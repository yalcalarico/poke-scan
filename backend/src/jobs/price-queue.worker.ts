import { hostname } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

import {
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ProviderRateGate } from './provider-rate.gate.js';
import { PriceQueueService, type ClaimedPriceRefresh } from './price-queue.service.js';
import { SyncPricesService } from './sync-prices.service.js';
import { ProviderRateLimitError } from '../common/errors/provider-rate-limit.error.js';

/**
 * Cuánto espera el worker cuando no encuentra nada, y hasta cuánto crece.
 *
 * El piso de 250 ms es invisible para el usuario —la lectura que encoló no
 * espera al refresco igual, y el refresh tarda 2,3 s por el ritmo global—, y
 * crecer hasta 2 s mantiene el costo en ocioso en medio query por segundo por
 * proceso. El techo importa porque el worker está vivo aunque no haya nada que
 * refrescar: las cartas ya refrescadas vuelven a vencerse solas, así que la cola
 * se vacía sola cada cierto tiempo y ese es el peor caso del backoff.
 */
const IDLE_POLL_MIN_MS = 250;
const IDLE_POLL_MAX_MS = 2000;

/** Espera tras un error del propio loop, para no quedar en un lazo de excepciones. */
const ERROR_BACKOFF_MS = 1000;

/**
 * El identificador con el que esta instancia toma jobs.
 *
 * `hostname:pid` y no un uuid porque el propósito es que un operador pueda leer
 * `price_refresh_jobs` y saber de qué proceso salió la fila. No es un secreto:
 * solo sirve para distinguir quién tomó cada job.
 */
function instanceId(): string {
  return `${hostname()}:${process.pid}`;
}

/**
 * Drena la cola de precios.
 *
 * Es el reemplazo del `drain()` que estaba dentro de `SyncPricesService`: un
 * loop que toma una carta vencida, espera su turno del ritmo global, le pide el
 * precio al proveedor y anota el resultado.
 *
 * ## Por qué el trabajo NO está acá
 *
 * El worker no sabe qué es una carta ni qué es una fila de `card_prices`: pide
 * el refresco a `SyncPricesService` y le cree el resultado. Esa separación es lo
 * que permite que la cola y el servicio de precios no se cyclen entre sí, y que
 * el worker se pueda testear sin levantar el proveedor.
 */
@Injectable()
export class PriceQueueWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PriceQueueWorker.name);
  private readonly id = instanceId();
  private running = false;
  private loop: Promise<void> | null = null;
  private readonly shutdown = new AbortController();
  private idleMs = IDLE_POLL_MIN_MS;
  private pollMinMs = IDLE_POLL_MIN_MS;
  private pollMaxMs = IDLE_POLL_MAX_MS;

  constructor(
    private readonly queue: PriceQueueService,
    private readonly gate: ProviderRateGate,
    private readonly syncPrices: SyncPricesService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /**
   * Ajusta el poll del loop. Es inyectable **solo para tests**: con el poll de
   * producción (250 ms..2 s) un test que espera a que el worker tome una carta
   * depende de un timer, y eso es una fuente garantizada de flakiness. Los
   * valores de producción no debería cambiarlos nadie más.
   */
  setPollInterval(minMs: number, maxMs: number): void {
    this.pollMinMs = minMs;
    this.pollMaxMs = Math.max(minMs, maxMs);
    this.idleMs = minMs;
  }

  async onModuleInit(): Promise<void> {
    const enabled =
      !['false', '0', 'no'].includes((this.config?.get<string>('PRICE_QUEUE_ENABLED') ?? process.env.PRICE_QUEUE_ENABLED ?? 'true').trim().toLowerCase());
    if (!enabled) {
      this.logger.log('Worker de precios desactivado por PRICE_QUEUE_ENABLED=false.');
      return;
    }
    // La recuperación de los jobs que quedaron tomados no es de acá sino de
    // `JobsRecoveryService`, que la hace junto con la de los `ScanJob`: es el
    // mismo problema y quiere un solo lugar donde mirar.
    this.running = true;
    this.loop = this.run();
    this.logger.log(`Worker de precios listo como ${this.id}`);
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    this.shutdown.abort();
    await this.loop;
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        await this.gate.waitOutProviderPause(this.shutdown.signal);
        if (!this.running) break;
        const job = await this.queue.claimNext(this.id);
        if (!job) {
          await this.sleep(this.idleMs);
          this.idleMs = Math.min(this.idleMs * 2, this.pollMaxMs);
          continue;
        }
        this.idleMs = this.pollMinMs;
        await this.runJob(job);
      } catch (error) {
        /*
         * Un error acá es del loop mismo (la DB cayó, por ejemplo), no del job:
         * los errores del job se anotan dentro de `runJob`. Sin este `catch` el
         * loop se muere con el primer fallo y la cola deja de vaciarse para el
         * resto de la vida del proceso, en silencio.
         */
        this.logger.error(`Fallo el worker de precios: ${(error as Error).message}`);
        await this.sleep(ERROR_BACKOFF_MS);
      }
    }
  }

  private async runJob(job: ClaimedPriceRefresh): Promise<void> {
    let attempts = job.attempts;
    let requestStarted = false;
    const dailyDeduplicate = job.origin === 'daily' || (job.syncDate !== null && job.attempts > 0);
    try {
      if (dailyDeduplicate && await this.syncPrices.hasTerminalDailyObservation(job.cardId)) {
        await this.syncPrices.fetchAndStoreWithOutcome(job.cardId, true);
        await this.queue.complete(job.id);
        await this.queue.markCrossedDayMissed(job);
        return;
      }
      /*
       * El claim va **antes** del slot, y el slot no se suelta hasta el final.
       *
       * Tomar el slot primero sería peor: un worker con la cola vacía
       * consumiría un hueco de ritmo en cada poll, y el poll quedaría limitado a
       * un intento cada 2,3 s. Con este orden, la fila está tomada mientras
       * espera —unos 2,3 s como máximo, porque el worker es de a uno— y si el
       * proceso muere en esa espera la deja en `processing`, que es
       * exactamente lo que `reconcileAbandoned` sabe recuperar.
       */
      const blockedFor = await this.gate.waitForClaimedJobSlot();
      if (blockedFor !== null) {
        await this.queue.release(job.id, blockedFor);
        return;
      }
      await this.syncPrices.fetchAndStoreWithOutcome(job.cardId, dailyDeduplicate, async () => {
        attempts = await this.queue.startAttempt(job.id);
        requestStarted = true;
      });
      await this.queue.complete(job.id);
      await this.queue.markCrossedDayMissed(job);
      const now = new Date();
      if (job.origin === 'daily' && job.syncDate && job.syncDate.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10) &&
        now.getTime() >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 15)) {
        const syncDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        await this.queue.requeuePendingDailyTarget(job.cardId, syncDate);
      }
    } catch (error) {
      const message = (error as Error).message;
      const rateLimit = error instanceof ProviderRateLimitError
        ? error
        : error instanceof Error && error.cause instanceof ProviderRateLimitError
          ? error.cause
          : null;
      if (rateLimit) await this.gate.recordRateLimit(rateLimit);
      if (!requestStarted) {
        await this.queue.release(job.id, rateLimit?.retryAfterMs ?? 1000);
        return;
      }
      const status = await this.queue.fail(job.id, Math.max(attempts, job.attempts), message);
      if (status === 'failed') {
        this.logger.error(
          `Refresh de ${job.cardId} agotó los intentos: ${message}. Queda esperando una señal nueva.`,
        );
      } else {
        this.logger.warn(`Refresh de ${job.cardId} falló (intento ${job.attempts}): ${message}`);
      }
    }
  }

  /**
   * La espera entre polls es un `setTimeout` común, con `unref` para que el
   * timer no impida que el proceso baje.
   */
  private async sleep(ms: number): Promise<void> {
    try { await delay(ms, undefined, { signal: this.shutdown.signal }); }
    catch { /* el cierre interrumpe el poll y el backoff del loop */ }
  }
}
