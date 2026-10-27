import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/index.js';

export interface ActiveTcgcsvBatch {
  syncDate: Date;
  openedAt: Date;
  setIds: string[];
  status: string;
  feedPublishedAt: Date | null;
  feedAttempts: number;
  nextAttemptAt: Date | null;
}

/** Coordina resultados del lote; la cola global conserva exclusivamente presupuesto y lease. */
export class TcgcsvBatchCoordinator {
  constructor(private readonly p: PrismaService, private readonly clock: () => Date) {}

  async acquire(owner: string): Promise<boolean> {
    return await this.p.$executeRaw`UPDATE tcgcsv_discovery_state SET "workerLockedBy" = ${owner},
      "workerLeaseUntil" = NOW() + INTERVAL '2 minutes' WHERE id = 'global'
      AND ("workerLeaseUntil" IS NULL OR "workerLeaseUntil" <= NOW())` === 1;
  }

  async release(owner: string): Promise<void> {
    await this.p.$executeRaw`UPDATE tcgcsv_discovery_state SET "workerLockedBy" = NULL, "workerLeaseUntil" = NULL
      WHERE id = 'global' AND "workerLockedBy" = ${owner}`;
  }

  async register(day: Date, groups: ReadonlyMap<number, string[]>): Promise<void> {
    if (!groups.size) return;
    const values = [...groups].map(([id, sets]) => Prisma.sql`(${day}::date, ${id}, ${sets}::text[])`);
    await this.p.$executeRaw(Prisma.sql`INSERT INTO tcgcsv_batch_groups ("syncDate", "groupId", "setIds")
      VALUES ${Prisma.join(values)} ON CONFLICT ("syncDate", "groupId") DO NOTHING`);
  }

  async seal(day: Date): Promise<void> {
    await this.p.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE tcgcsv_batch_groups g SET status = 'skipped', "finishedAt" = NOW(),
        "lastError" = 'Evidencia recibida antes de abrir la tanda; no se repite la descarga'
        WHERE g."syncDate" = ${day}::date AND g.status = 'pending'
          AND EXISTS (SELECT 1 FROM price_sync_card_days d WHERE d.provider = 'tcgcsv' AND d."syncDate" = g."syncDate" AND d."setId" = ANY(g."setIds"))
          AND NOT EXISTS (SELECT 1 FROM price_sync_card_days d WHERE d.provider = 'tcgcsv' AND d."syncDate" = g."syncDate"
            AND d."setId" = ANY(g."setIds") AND d.status IN ('pending','processing'))`;
      await tx.$executeRaw`UPDATE tcgcsv_daily_batches SET status = 'pending' WHERE "syncDate" = ${day}::date AND status = 'planning'`;
    });
    await this.finish(day);
  }

  async active(): Promise<ActiveTcgcsvBatch | null> {
    const [batch] = await this.p.$queryRaw<ActiveTcgcsvBatch[]>`
      SELECT * FROM tcgcsv_daily_batches WHERE status IN ('pending','running') ORDER BY "syncDate" LIMIT 1`;
    if (!batch) return null;
    if (this.clock().getTime() >= batch.syncDate.getTime() + 45 * 3600000) {
      await this.failRemaining(batch.syncDate, 'La tanda no terminó antes del siguiente horario diario; revisar suspensión o disponibilidad');
      return this.active();
    }
    const lost = await this.p.$queryRaw<{ groupId: number }[]>`
      SELECT g."groupId" FROM tcgcsv_batch_groups g LEFT JOIN tcgcsv_group_jobs j ON j."groupId" = g."groupId"
      WHERE g."syncDate" = ${batch.syncDate}::date AND g.status = 'processing'
        AND (j."groupId" IS NULL OR j.status <> 'processing' OR j."leaseUntil" <= NOW())`;
    if (lost.length) await this.failGroups(batch.syncDate, lost.map((row) => row.groupId),
      'Ejecución interrumpida o lease vencido; se conservan las reservas de archivos', undefined, true);
    await this.p.$executeRaw`UPDATE tcgcsv_batch_groups g SET status = 'completed', "finishedAt" = NOW(), "lastError" = NULL
      WHERE g."syncDate" = ${batch.syncDate}::date AND g.status = 'pending' AND EXISTS (
        SELECT 1 FROM price_ingestion_runs r WHERE r.provider = 'tcgcsv' AND r."groupId" = g."groupId"
          AND r."feedPublishedAt" = ${batch.feedPublishedAt})`;
    const stranded = await this.p.$queryRaw<{ groupId: number }[]>`SELECT g."groupId" FROM tcgcsv_batch_groups g
      WHERE g."syncDate" = ${batch.syncDate}::date AND g.status = 'pending' AND NOT EXISTS (
        SELECT 1 FROM price_sync_sets s JOIN price_sync_card_days d ON d."setId" = s."setId"
        WHERE s.enabled AND s."setId" = ANY(g."setIds") AND d.provider = 'tcgcsv' AND d."syncDate" = g."syncDate"
          AND d.status IN ('pending','processing'))`;
    if (stranded.length) await this.failGroups(batch.syncDate, stranded.map((row) => row.groupId),
      'El grupo quedó sin objetivos habilitados o sin cartas pendientes en esta tanda');
    await this.finish(batch.syncDate);
    const [open] = await this.p.$queryRaw<ActiveTcgcsvBatch[]>`SELECT * FROM tcgcsv_daily_batches
      WHERE "syncDate" = ${batch.syncDate}::date AND status IN ('pending','running')`;
    return open ?? this.active();
  }

  async activateJobs(batch: ActiveTcgcsvBatch): Promise<number> {
    const changed = await this.p.$executeRaw`
      INSERT INTO tcgcsv_group_jobs ("groupId",status,"availableAt",origin,"syncDate","updatedAt")
      SELECT g."groupId", 'pending', COALESCE(g."nextAttemptAt", NOW()), 'daily'::"PriceSyncQueueOrigin", g."syncDate", NOW()
      FROM tcgcsv_batch_groups g WHERE g."syncDate" = ${batch.syncDate}::date AND g.status = 'pending'
      ON CONFLICT ("groupId") DO UPDATE SET origin = 'daily'::"PriceSyncQueueOrigin", "syncDate" = EXCLUDED."syncDate",
        status = 'pending', "updatedAt" = NOW(),
        "availableAt" = GREATEST(EXCLUDED."availableAt", COALESCE(tcgcsv_group_jobs."downloadStartedAt" + INTERVAL '24 hours', NOW()),
          CASE WHEN tcgcsv_group_jobs."syncDate" = EXCLUDED."syncDate" THEN tcgcsv_group_jobs."availableAt" ELSE NOW() END)
      WHERE tcgcsv_group_jobs.status <> 'processing'`;
    return changed;
  }

  async bind(batch: ActiveTcgcsvBatch, build: Date): Promise<ActiveTcgcsvBatch | null> {
    if (build.getTime() >= batch.syncDate.getTime() + 44 * 3600000) {
      await this.failRemaining(batch.syncDate, 'La publicación de la tanda ya fue reemplazada antes de poder fijarla');
      return null;
    }
    if (build.getTime() < batch.syncDate.getTime() + 20 * 3600000) {
      await this.manifestFailed(batch, 'La fuente todavía no publicó el feed correspondiente a la tanda');
      return null;
    }
    const [bound] = await this.p.$queryRaw<ActiveTcgcsvBatch[]>`UPDATE tcgcsv_daily_batches
      SET "feedPublishedAt" = COALESCE("feedPublishedAt", ${build}), status = 'running', "nextAttemptAt" = NULL, "lastError" = NULL
      WHERE "syncDate" = ${batch.syncDate}::date AND status IN ('pending','running') RETURNING *`;
    return bound ?? null;
  }

  async manifestFailed(batch: ActiveTcgcsvBatch, message: string): Promise<void> {
    const [state] = await this.p.$queryRaw<{ feedAttempts: number }[]>`UPDATE tcgcsv_daily_batches
      SET "feedAttempts" = "feedAttempts" + 1, "lastError" = ${message}, "nextAttemptAt" = ${new Date(this.clock().getTime() + 60000)}
      WHERE "syncDate" = ${batch.syncDate}::date AND status IN ('pending','running') AND "feedPublishedAt" IS NULL RETURNING "feedAttempts"`;
    if (state && state.feedAttempts >= 3) await this.failRemaining(batch.syncDate, `${message} (tres intentos sin poder fijar publicación)`);
  }

  async claim(day: Date, groupId: number): Promise<void> {
    await this.p.$executeRaw`UPDATE tcgcsv_batch_groups SET status = 'processing', attempts = attempts + 1,
      "startedAt" = COALESCE("startedAt", NOW()), "nextAttemptAt" = NULL
      WHERE "syncDate" = ${day}::date AND "groupId" = ${groupId} AND status = 'pending'`;
  }

  async groupFailed(day: Date, groupId: number, owner: string, message: string, consumedFile: boolean): Promise<void> {
    const [group] = await this.p.$queryRaw<{ attempts: number }[]>`SELECT attempts FROM tcgcsv_batch_groups
      WHERE "syncDate" = ${day}::date AND "groupId" = ${groupId} AND status = 'processing'`;
    if (!group) return;
    if (consumedFile || group.attempts >= 3) {
      await this.failGroups(day, [groupId], message, owner);
      return;
    }
    const retryAt = new Date(this.clock().getTime() + 60000);
    await this.p.$transaction(async (tx) => {
      const owned = await tx.$executeRaw`UPDATE tcgcsv_group_jobs SET status = 'pending', "lockedBy" = NULL, "leaseUntil" = NULL,
        "availableAt" = GREATEST("availableAt", ${retryAt}), "lastError" = ${message}, "updatedAt" = NOW()
        WHERE "groupId" = ${groupId} AND "lockedBy" = ${owner} AND "syncDate" = ${day}::date`;
      if (!owned) return;
      await tx.$executeRaw`UPDATE tcgcsv_batch_groups SET status = 'pending', "nextAttemptAt" = ${retryAt}, "lastError" = ${message}
        WHERE "syncDate" = ${day}::date AND "groupId" = ${groupId} AND status = 'processing'`;
    });
  }

  async failRemaining(day: Date, message: string): Promise<void> {
    const groups = await this.p.$queryRaw<{ groupId: number }[]>`SELECT "groupId" FROM tcgcsv_batch_groups
      WHERE "syncDate" = ${day}::date AND status IN ('pending','processing')`;
    if (groups.length) await this.failGroups(day, groups.map((row) => row.groupId), message);
    await this.finish(day);
  }

  private async failGroups(day: Date, ids: number[], message: string, owner?: string, expiredOnly = false): Promise<void> {
    await this.p.$transaction(async (tx) => {
      // Mismo orden que la publicación: primero presupuesto/lease, después grupo y tanda.
      await tx.$queryRaw`SELECT "groupId" FROM tcgcsv_group_jobs WHERE "groupId" = ANY(${ids}::int[]) ORDER BY "groupId" FOR UPDATE`;
      const groups = await tx.$queryRaw<{ setIds: string[] }[]>`UPDATE tcgcsv_batch_groups g SET status = 'failed',
        "finishedAt" = NOW(), "nextAttemptAt" = NULL, "lastError" = ${message}
        WHERE g."syncDate" = ${day}::date AND g."groupId" = ANY(${ids}::int[]) AND g.status IN ('pending','processing')
          AND (${owner ?? null}::text IS NULL OR EXISTS (SELECT 1 FROM tcgcsv_group_jobs j WHERE j."groupId" = g."groupId"
            AND j."syncDate" = g."syncDate" AND j."lockedBy" = ${owner ?? null}))
          AND (NOT ${expiredOnly} OR NOT EXISTS (SELECT 1 FROM tcgcsv_group_jobs j WHERE j."groupId" = g."groupId"
            AND j.status = 'processing' AND j."leaseUntil" > NOW())) RETURNING g."setIds"`;
      const setIds = [...new Set(groups.flatMap((row) => row.setIds))];
      if (!setIds.length) return;
      await tx.$executeRaw`UPDATE price_sync_card_days SET status = 'failed', "lastError" = ${message}, "updatedAt" = NOW()
        WHERE provider = 'tcgcsv' AND "syncDate" = ${day}::date AND "setId" = ANY(${setIds}::text[]) AND status IN ('pending','processing')`;
      await tx.$executeRaw`UPDATE price_sync_set_days SET status = 'failed', "lastError" = ${message}, "finishedAt" = NOW(),
        "nextAttemptAt" = NULL, "updatedAt" = NOW() WHERE provider = 'tcgcsv' AND "syncDate" = ${day}::date AND "setId" = ANY(${setIds}::text[])`;
      await tx.$executeRaw`UPDATE tcgcsv_group_jobs SET status = 'failed', "lastError" = ${message}, "lockedBy" = NULL,
        "leaseUntil" = NULL, "updatedAt" = NOW() WHERE "syncDate" = ${day}::date AND "groupId" = ANY(${ids}::int[])
          AND (${owner ?? null}::text IS NULL OR "lockedBy" = ${owner ?? null})`;
    });
    await this.finish(day);
  }

  async finish(day: Date): Promise<void> {
    await this.p.$executeRaw`UPDATE tcgcsv_daily_batches b SET
      status = CASE WHEN EXISTS (SELECT 1 FROM tcgcsv_batch_groups g WHERE g."syncDate" = b."syncDate" AND g.status = 'failed')
        OR EXISTS (SELECT 1 FROM price_sync_set_days d WHERE d.provider = 'tcgcsv' AND d."syncDate" = b."syncDate"
          AND d."setId" = ANY(b."setIds") AND d.status IN ('failed','blocked_mapping')) THEN 'failed' ELSE 'completed' END,
      "finishedAt" = NOW(), "nextAttemptAt" = NULL
      WHERE b."syncDate" = ${day}::date AND b.status IN ('pending','running')
        AND NOT EXISTS (SELECT 1 FROM tcgcsv_batch_groups g WHERE g."syncDate" = b."syncDate" AND g.status IN ('pending','processing'))`;
  }
}
