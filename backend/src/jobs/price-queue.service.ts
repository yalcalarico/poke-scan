import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

export type PriceRefreshStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ClaimedPriceRefresh {
  id: string;
  cardId: string;
  attempts: number;
}

/**
 * Backoff del primer reintento. Con el doble en cada intento y este tope, un
 * proveedor caído pasa de "26 requests/min" a uno cada 30 s, 1 m, 2 m, 4 m...
 */
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

/**
 * Intentos antes de dejar de reintentar solo.
 *
 * Pasado este número la fila queda `failed` y **no** se reintenta sola: espera
 * una señal nueva (que alguien vuelva a abrir la carta y la reencole). Con un
 * total de 5 y el backoff exponencial, una carta con el proveedor caído para
 * en ~15 minutos y después queda quieta.
 */
export const MAX_PRICE_REFRESH_ATTEMPTS = 5;

/**
 * Un `processing` más viejo que esto se considera abandonado.
 *
 * Es el criterio de recuperación del arranque, así que tiene que ser más holgado
 * que la tarea más larga posible: un refresh es un request HTTP con reintentos
 * (`retry.ts` llega a 8 intentos con backoff de 30 s), o sea del orden del
 * minuto. Diez minutos es tres veces eso.
 */
export const ABANDONED_JOB_MS = 10 * 60 * 1000;

/**
 * La cola de refresco de precios, en Postgres.
 *
 * Reemplaza al `queue: string[]` de `SyncPricesService`. Lo que cambia no es
 * solamente que la cola sobreviva a un reinicio: es que **`lastProviderCallAt`
 * también era del proceso**, así que el `MIN_GAP_MS` se contaba por instancia y
 * con dos backend el ritmo real hacia el proveedor se duplicaba. El ritmo vive
 * ahora en `ProviderRateGate`, que es compartido.
 *
 * Este servicio es solo el almacenamiento y las transiciones de estado. Quién
 * drena la cola es `PriceQueueWorker`, y quién hace el trabajo es
 * `SyncPricesService`: separarlos es lo que mantiene el grafo de inyección sin
 * ciclos.
 *
 * ## Los estados
 *
 * - `pending`: espera su turno. `availableAt` dice cuándo.
 * - `processing`: alguien lo tomó. `lockedBy`/`lockedAt` son el claim.
 * - `completed`: terminó, haya precio o no. "El proveedor no tiene esta carta"
 *   es una respuesta, no un fallo.
 * - `failed`: agotó los intentos. No se reintenta solo.
 */
@Injectable()
export class PriceQueueService {
  private readonly logger = new Logger(PriceQueueService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Encola un refresco sin esperar.
   *
   * Se llama desde el camino de una lectura pública (`getPricesForCard`), así
   * que no puede esperar el round trip: la respuesta del usuario no depende de
   * que el encolado se haya escrito. Por eso no es `async` y por eso el error
   * se loguea en vez de propagarse.
   */
  enqueue(cardId: string): void {
    if (!cardId) return;
    void this.enqueueAsync(cardId).catch((error: unknown) => {
      this.logger.warn(
        `No se pudo encolar el refresco de ${cardId}: ${(error as Error).message}`,
      );
    });
  }

  /**
   * El encolado de verdad.
   *
   * El `ON CONFLICT` con `WHERE` es lo que hace que encolar sea barato de
   * repetir: si la fila ya está `pending` o `processing`, el conflicto no
   * escribe nada y el `RETURNING` viene vacío. Sin ese `WHERE`, cada lectura de
   * una carta vencida sería un `UPDATE` —y las lecturas de precio están en el
   * camino de una página.
   *
   * El `GREATEST` del `availableAt` es la otra mitad: reencolar **nunca adelanta
   * un backoff**. Una carta que el proveedor rechazó puede recibir señales
   * nuevas todo el día, y si cada una la despertara el reintento sería un lazo
   * contra un proveedor que acaba de decir que no.
   */
  async enqueueAsync(cardId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ cardId: string }[]>(Prisma.sql`
      INSERT INTO price_refresh_jobs (id, "cardId", status, "availableAt", "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        ${cardId},
        'pending',
        (now() AT TIME ZONE 'UTC'),
        (now() AT TIME ZONE 'UTC')
      )
      ON CONFLICT ("cardId") DO UPDATE
      SET status = 'pending',
          "availableAt" = GREATEST(price_refresh_jobs."availableAt", (now() AT TIME ZONE 'UTC')),
          "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE price_refresh_jobs.status IN ('completed', 'failed')
      RETURNING "cardId"
    `);
    return rows.length > 0;
  }

  /**
   * Toma la próxima carta pendiente y la marca como `processing`.
   *
   * `FOR UPDATE SKIP LOCKED` es lo que hace que dos instancias no puedan tomar
   * la misma fila, y que una instancia con una cola llena no bloquee a la otra:
   * la que pierde el lock salta a la siguiente fila en vez de esperar.
   *
   * Devuelve `null` cuando no hay nada vencido. Nótese que una fila `failed` con
   * `availableAt` futuro **no** se reclama: solo la reencola una señal nueva.
   */
  async claimNext(lockedBy: string): Promise<ClaimedPriceRefresh | null> {
    const rows = await this.prisma.$queryRaw<
      { id: string; cardId: string; attempts: number }[]
    >(Prisma.sql`
      UPDATE price_refresh_jobs j
      SET status = 'processing',
          "lockedBy" = ${lockedBy},
          "lockedAt" = (now() AT TIME ZONE 'UTC'),
          "updatedAt" = (now() AT TIME ZONE 'UTC'),
          attempts = j.attempts + 1
      WHERE j.id = (
        SELECT q.id
        FROM price_refresh_jobs q
        WHERE q.status = 'pending'
          AND q."availableAt" <= (now() AT TIME ZONE 'UTC')
        ORDER BY q."availableAt" ASC, q."createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING j.id, j."cardId", j.attempts
    `);
    const row = rows[0];
    return row ? { id: row.id, cardId: row.cardId, attempts: row.attempts } : null;
  }

  /**
   * Devuelve la fila al final de la cola.
   *
   * Se usa cuando el worker tomó un job pero el ritmo global todavía no lo deja
   * llamar al proveedor: reencolar con `availableAt` en el futuro en vez de
   * dormir. El job tomado deja libre el resto de la cola para otra instancia.
   */
  async release(jobId: string, delayMs: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE price_refresh_jobs
      SET status = 'pending',
          "lockedBy" = NULL,
          "lockedAt" = NULL,
          "availableAt" = (now() AT TIME ZONE 'UTC') + ${this.interval(delayMs)},
          "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE id = ${jobId}
    `;
  }

  async complete(jobId: string): Promise<void> {
    await this.prisma.priceRefreshJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        lockedBy: null,
        lockedAt: null,
        lastError: null,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * El job falló. Si le quedan intentos vuelve a `pending` con backoff; si no,
   * queda `failed` esperando una señal nueva.
   */
  async fail(jobId: string, attempts: number, error: string): Promise<PriceRefreshStatus> {
    const giveUp = attempts >= MAX_PRICE_REFRESH_ATTEMPTS;
    const status: PriceRefreshStatus = giveUp ? 'failed' : 'pending';
    await this.prisma.priceRefreshJob.update({
      where: { id: jobId },
      data: {
        status,
        lastError: error.slice(0, 500),
        lockedBy: null,
        lockedAt: null,
        completedAt: giveUp ? new Date() : null,
        ...(giveUp ? {} : { availableAt: new Date(Date.now() + this.backoffMs(attempts)) }),
        updatedAt: new Date(),
      },
    });
    return status;
  }

  /**
   * Devuelve a `pending` los `processing` cuyo `lockedAt` es más viejo que
   * `ABANDONED_JOB_MS`.
   *
   * Se corre en el arranque. Sin esto, un backend que muere a mitad de un
   * refresh deja la fila en `processing` para siempre: no la vuelve a tomar
   * nadie —el claim solo mira `pending`— y no es un error que alguien vea, solo
   * un precio que no se actualiza más.
   *
   * No se filtra por `lockedBy`: el identificador de instancia cambia en cada
   * arranque, así que después de un reinicio no hay nadie a quien preguntarle si
   * esa fila era suya. El criterio es la edad, que es lo único que sobrevive al
   * proceso muerto.
   */
  async reconcileAbandoned(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - ABANDONED_JOB_MS);
    const { count } = await this.prisma.priceRefreshJob.updateMany({
      where: { status: 'processing', lockedAt: { lt: cutoff } },
      data: { status: 'pending', lockedBy: null, lockedAt: null, availableAt: now },
    });
    if (count > 0) {
      this.logger.warn(
        `${count} refrescos de precio quedaron en processing al arrancar y volvieron a la cola`,
      );
    }
    return count;
  }

  /** Pendientes y en processing. Para diagnóstico y tests. */
  async pendingCount(): Promise<number> {
    return this.prisma.priceRefreshJob.count({
      where: { status: { in: ['pending', 'processing'] } },
    });
  }

  private backoffMs(attempts: number): number {
    const exponent = Math.max(0, attempts - 1);
    return Math.min(BASE_BACKOFF_MS * 2 ** exponent, MAX_BACKOFF_MS);
  }

  private interval(ms: number): string {
    return `${Math.max(0, Math.round(ms))} milliseconds`;
  }
}
