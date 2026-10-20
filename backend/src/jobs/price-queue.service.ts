import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

export type PriceRefreshStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ClaimedPriceRefresh {
  id: string;
  cardId: string;
  attempts: number;
  origin: 'legacy' | 'daily' | 'interactive';
  syncDate: Date | null;
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
  async enqueueAsync(cardId: string, origin: 'interactive' | 'daily' = 'interactive', syncDate?: Date): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ cardId: string }[]>(Prisma.sql`
      INSERT INTO price_refresh_jobs (id, "cardId", status, "availableAt", "updatedAt", origin, "syncDate")
      VALUES (
        gen_random_uuid()::text,
        ${cardId},
        'pending',
        NOW(),
        NOW(),
        ${origin}::"PriceSyncQueueOrigin",
        ${syncDate ?? null}::date
      )
      ON CONFLICT ("cardId") DO UPDATE
      SET status = CASE WHEN price_refresh_jobs.status IN ('completed', 'failed') THEN 'pending' ELSE price_refresh_jobs.status END,
          origin = CASE WHEN price_refresh_jobs.origin = 'interactive'::"PriceSyncQueueOrigin" OR EXCLUDED.origin = 'interactive'::"PriceSyncQueueOrigin" THEN 'interactive'::"PriceSyncQueueOrigin" ELSE EXCLUDED.origin END,
          "syncDate" = CASE WHEN price_refresh_jobs.status = 'processing' THEN price_refresh_jobs."syncDate" ELSE COALESCE(EXCLUDED."syncDate", price_refresh_jobs."syncDate") END,
          "availableAt" = GREATEST(price_refresh_jobs."availableAt", NOW()),
          attempts = CASE
            WHEN ${origin} = 'interactive' AND price_refresh_jobs.status IN ('completed', 'failed') THEN 0
            WHEN ${origin} = 'daily' AND ${syncDate ?? null}::date IS DISTINCT FROM price_refresh_jobs."syncDate" THEN 0
            ELSE price_refresh_jobs.attempts END,
          "lastError" = NULL,
          "completedAt" = CASE WHEN price_refresh_jobs.status IN ('completed', 'failed') THEN NULL ELSE price_refresh_jobs."completedAt" END,
          "updatedAt" = NOW()
      WHERE price_refresh_jobs.status IN ('completed', 'failed')
         OR (${origin} = 'interactive' AND price_refresh_jobs.origin <> 'interactive'::"PriceSyncQueueOrigin" AND price_refresh_jobs.status IN ('pending', 'processing'))
      RETURNING "cardId"
    `);
    return rows.length > 0;
  }

  /** Inserta recorridos grandes en una sola operación, conservando el ritmo en el worker. */
  async enqueueMany(cardIds: readonly string[], origin: 'daily' | 'interactive' = 'interactive', syncDate?: Date): Promise<number> {
    if (cardIds.length === 0) return 0;
    return this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO price_refresh_jobs (id, "cardId", status, "availableAt", "updatedAt", origin, "syncDate")
      SELECT gen_random_uuid()::text, candidate, 'pending', NOW(), NOW(), ${origin}::"PriceSyncQueueOrigin", ${syncDate ?? null}::date
      FROM unnest(${[...cardIds]}::text[]) AS candidate
      ON CONFLICT ("cardId") DO UPDATE
      SET status = CASE WHEN price_refresh_jobs.status IN ('completed', 'failed') THEN 'pending' ELSE price_refresh_jobs.status END,
          attempts = CASE WHEN EXCLUDED.origin = 'daily'::"PriceSyncQueueOrigin" AND EXCLUDED."syncDate" IS DISTINCT FROM price_refresh_jobs."syncDate"
            AND price_refresh_jobs.origin = 'daily'::"PriceSyncQueueOrigin" THEN 0
            WHEN EXCLUDED.origin = 'daily'::"PriceSyncQueueOrigin" AND price_refresh_jobs.status IN ('completed', 'failed') THEN 0
            WHEN EXCLUDED.origin = 'interactive'::"PriceSyncQueueOrigin" AND price_refresh_jobs.status IN ('completed', 'failed') THEN 0
            ELSE price_refresh_jobs.attempts END,
          "lockedBy" = CASE WHEN price_refresh_jobs.status = 'processing' THEN price_refresh_jobs."lockedBy" ELSE NULL END,
          "lockedAt" = CASE WHEN price_refresh_jobs.status = 'processing' THEN price_refresh_jobs."lockedAt" ELSE NULL END,
          origin = CASE WHEN price_refresh_jobs.origin = 'interactive'::"PriceSyncQueueOrigin" OR EXCLUDED.origin = 'interactive'::"PriceSyncQueueOrigin" THEN 'interactive'::"PriceSyncQueueOrigin" ELSE EXCLUDED.origin END,
          "syncDate" = CASE WHEN price_refresh_jobs.status = 'processing' THEN price_refresh_jobs."syncDate" ELSE COALESCE(EXCLUDED."syncDate", price_refresh_jobs."syncDate") END,
          "availableAt" = GREATEST(price_refresh_jobs."availableAt", NOW()),
          "lastError" = CASE WHEN price_refresh_jobs.status IN ('completed', 'failed') OR (EXCLUDED.origin = 'daily'::"PriceSyncQueueOrigin" AND price_refresh_jobs.origin = 'daily'::"PriceSyncQueueOrigin" AND EXCLUDED."syncDate" IS DISTINCT FROM price_refresh_jobs."syncDate") THEN NULL ELSE price_refresh_jobs."lastError" END,
          "completedAt" = CASE WHEN price_refresh_jobs.status IN ('completed', 'failed') THEN NULL ELSE price_refresh_jobs."completedAt" END,
          "updatedAt" = NOW()
      WHERE (price_refresh_jobs.status IN ('completed', 'failed') AND (
              (EXCLUDED.origin = 'daily'::"PriceSyncQueueOrigin" AND (
                (price_refresh_jobs.origin = 'daily'::"PriceSyncQueueOrigin" AND EXCLUDED."syncDate" IS DISTINCT FROM price_refresh_jobs."syncDate")
                OR (price_refresh_jobs.origin = 'legacy'::"PriceSyncQueueOrigin" AND price_refresh_jobs."availableAt" <= NOW())
                OR (price_refresh_jobs.origin = 'interactive'::"PriceSyncQueueOrigin" AND EXCLUDED."syncDate" IS DISTINCT FROM price_refresh_jobs."syncDate")
              ))
              OR (EXCLUDED.origin = 'interactive'::"PriceSyncQueueOrigin" AND price_refresh_jobs."availableAt" <= NOW())))
         OR (EXCLUDED.origin = 'daily'::"PriceSyncQueueOrigin" AND price_refresh_jobs.origin = 'legacy'::"PriceSyncQueueOrigin" AND price_refresh_jobs.status IN ('pending', 'processing'))
         OR (EXCLUDED.origin = 'daily'::"PriceSyncQueueOrigin" AND price_refresh_jobs.origin = 'daily'::"PriceSyncQueueOrigin" AND price_refresh_jobs.status = 'pending' AND EXCLUDED."syncDate" IS DISTINCT FROM price_refresh_jobs."syncDate")
         OR (EXCLUDED.origin = 'daily'::"PriceSyncQueueOrigin" AND price_refresh_jobs.origin = 'interactive'::"PriceSyncQueueOrigin" AND price_refresh_jobs.status IN ('pending', 'processing'))
         OR (EXCLUDED.origin = 'interactive'::"PriceSyncQueueOrigin" AND price_refresh_jobs.origin <> 'interactive'::"PriceSyncQueueOrigin" AND price_refresh_jobs.status IN ('pending', 'processing'))
    `);
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
      { id: string; cardId: string; attempts: number; origin: ClaimedPriceRefresh['origin']; syncDate: Date | null }[]
    >(Prisma.sql`
      UPDATE price_refresh_jobs j
      SET status = 'processing',
          "lockedBy" = ${lockedBy},
          "lockedAt" = NOW(),
          "updatedAt" = NOW(),
          attempts = j.attempts
      WHERE j.id = (
        SELECT q.id
        FROM price_refresh_jobs q
        WHERE q.status = 'pending'
          AND q."availableAt" <= NOW()
          AND NOT EXISTS (SELECT 1 FROM provider_rate_limits r WHERE r."providerId" = 'tcgdex' AND r."blockedUntil" > NOW())
          AND (q.origin = 'interactive'::"PriceSyncQueueOrigin" OR (
            q.origin = 'daily'::"PriceSyncQueueOrigin" AND q."syncDate" = (NOW() AT TIME ZONE 'UTC')::date
            AND EXISTS (SELECT 1 FROM price_sync_sets s JOIN cards c ON c."setId" = s."setId" WHERE c.id = q."cardId" AND s.enabled)
          ))
        ORDER BY CASE q.origin WHEN 'interactive'::"PriceSyncQueueOrigin" THEN 0 ELSE 1 END,
          CASE WHEN q.origin = 'daily'::"PriceSyncQueueOrigin" THEN (
            SELECT s.priority FROM price_sync_sets s JOIN cards c ON c."setId" = s."setId" WHERE c.id = q."cardId" AND s.enabled
          ) ELSE 0 END ASC,
          q."availableAt" ASC, q."createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING j.id, j."cardId", j.attempts, j.origin, j."syncDate"
    `);
    const row = rows[0];
    if (row?.syncDate) {
      await this.prisma.$executeRaw`
        UPDATE price_sync_card_days SET status = 'processing'::"PriceSyncCardDayStatus", "updatedAt" = NOW()
        WHERE provider = 'tcgdex' AND "cardId" = ${row.cardId} AND "syncDate" = ${row.syncDate}::date
          AND status = 'pending'::"PriceSyncCardDayStatus"
      `;
    }
    return row ? { id: row.id, cardId: row.cardId, attempts: row.attempts, origin: row.origin, syncDate: row.syncDate } : null;
  }

  async startAttempt(jobId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ attempts: number; cardId: string; origin: ClaimedPriceRefresh['origin']; syncDate: Date | null }[]>`
      UPDATE price_refresh_jobs SET attempts = attempts + 1, "updatedAt" = NOW()
      WHERE id = ${jobId} AND status = 'processing' RETURNING attempts, "cardId", origin, "syncDate"
    `;
    const row = rows[0];
    if (row?.syncDate) {
      await this.prisma.$executeRaw`
        UPDATE price_sync_card_days SET attempts = attempts + 1, "updatedAt" = NOW()
        WHERE provider = 'tcgdex' AND "cardId" = ${row.cardId} AND "syncDate" = ${row.syncDate}::date
      `;
    }
    return row?.attempts ?? 0;
  }

  async requeuePendingDailyTarget(cardId: string, syncDate: Date): Promise<boolean> {
    const targets = await this.prisma.$queryRaw<{ cardId: string }[]>(Prisma.sql`
      SELECT d."cardId" FROM price_sync_card_days d
      JOIN price_sync_sets s ON s."setId" = d."setId" AND s.enabled
      WHERE d.provider = 'tcgdex' AND d."cardId" = ${cardId} AND d."syncDate" = ${syncDate}::date
        AND d.status = 'pending'::"PriceSyncCardDayStatus"
      LIMIT 1
    `);
    if (targets.length === 0) return false;
    return this.enqueueAsync(cardId, 'daily', syncDate);
  }

  async markCrossedDayMissed(job: ClaimedPriceRefresh): Promise<void> {
    if (!job.syncDate) return;
    const today = new Date();
    if (job.syncDate.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)) return;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE price_sync_card_days SET status = 'missed'::"PriceSyncCardDayStatus", "checkedAt" = NULL,
        "lastError" = 'El objetivo diario venció antes de finalizar la consulta', "updatedAt" = NOW()
      WHERE provider = 'tcgdex' AND "cardId" = ${job.cardId} AND "syncDate" = ${job.syncDate}::date
        AND status = 'processing'::"PriceSyncCardDayStatus"
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE price_sync_set_days SET status = 'missed'::"PriceSyncSetDayStatus", "updatedAt" = NOW()
      WHERE provider = 'tcgdex' AND "syncDate" = ${job.syncDate}::date AND "setId" = (SELECT "setId" FROM cards WHERE id = ${job.cardId})
        AND NOT EXISTS (SELECT 1 FROM price_sync_card_days d WHERE d.provider = 'tcgdex' AND d."setId" = price_sync_set_days."setId" AND d."syncDate" = price_sync_set_days."syncDate" AND d.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus"))
    `);
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
          "availableAt" = NOW() + ${this.interval(delayMs)},
          "updatedAt" = NOW()
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
    const job = await this.prisma.priceRefreshJob.findUnique({ where: { id: jobId }, select: { cardId: true, origin: true, syncDate: true } });
    if (job?.syncDate) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE price_sync_card_days SET status = ${giveUp ? 'failed' : 'pending'}::"PriceSyncCardDayStatus",
          "lastError" = ${error.slice(0, 500)}, "updatedAt" = NOW()
        WHERE provider = 'tcgdex' AND "cardId" = ${job.cardId} AND "syncDate" = ${job.syncDate}::date
          AND status IN ('processing'::"PriceSyncCardDayStatus", 'failed'::"PriceSyncCardDayStatus")
      `);
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE price_sync_set_days s SET status = CASE
          WHEN EXISTS (SELECT 1 FROM price_sync_card_days c WHERE c.provider = s.provider AND c."setId" = s."setId" AND c."syncDate" = s."syncDate" AND c.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus")) THEN 'running'::"PriceSyncSetDayStatus"
          WHEN EXISTS (SELECT 1 FROM price_sync_card_days c WHERE c.provider = s.provider AND c."setId" = s."setId" AND c."syncDate" = s."syncDate" AND c.status = 'quoted'::"PriceSyncCardDayStatus") THEN 'partial'::"PriceSyncSetDayStatus"
          WHEN EXISTS (SELECT 1 FROM price_sync_card_days c WHERE c.provider = s.provider AND c."setId" = s."setId" AND c."syncDate" = s."syncDate" AND c.status = 'failed'::"PriceSyncCardDayStatus") THEN 'failed'::"PriceSyncSetDayStatus"
          ELSE 'partial'::"PriceSyncSetDayStatus" END,
          "finishedAt" = CASE WHEN EXISTS (SELECT 1 FROM price_sync_card_days c WHERE c.provider = s.provider AND c."setId" = s."setId" AND c."syncDate" = s."syncDate" AND c.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus")) THEN NULL ELSE NOW() END,
          "updatedAt" = NOW()
        WHERE s.provider = 'tcgdex' AND s."setId" = (SELECT "setId" FROM cards WHERE id = ${job.cardId}) AND s."syncDate" = ${job.syncDate}::date
      `);
    }
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
