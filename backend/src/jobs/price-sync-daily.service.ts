import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { PriceQueueService } from './price-queue.service.js';
import { PriceSyncRegistryService } from './price-sync-registry.service.js';

export function utcDay(at = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

function enabled(config: ConfigService, key: string): boolean {
  const value = config.get<string>(key) ?? process.env[key];
  return value === undefined || !['false', '0', 'no'].includes(value.trim().toLowerCase());
}

@Injectable()
export class PriceSyncDailyService implements OnModuleInit {
  private readonly logger = new Logger(PriceSyncDailyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: PriceQueueService,
    private readonly registry: PriceSyncRegistryService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    void this.prisma.$executeRaw`
      INSERT INTO price_sync_controls (provider, "nextCycleAt") VALUES ('tcgdex', NOW())
      ON CONFLICT (provider) DO NOTHING
    `.catch(() => this.logger.warn('No se pudo inicializar el control del ciclo diario'));
    if (!enabled(this.config, 'ENABLE_PRICE_BACKFILL_CRON') || !enabled(this.config, 'PRICE_QUEUE_ENABLED')) return;
    const now = new Date();
    if (now.getTime() >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 15)) {
      void this.planToday(false).catch(() => this.logger.warn('Quedó pendiente recuperar el ciclo diario de precios'));
    }
  }

  /** El cron y las señales explícitas comparten una sola planificación idempotente. */
  @Cron('15 3 * * *', { timeZone: 'UTC' })
  async runScheduledCycle(): Promise<number> {
    if (!enabled(this.config, 'ENABLE_PRICE_BACKFILL_CRON') || !enabled(this.config, 'PRICE_QUEUE_ENABLED')) return 0;
    return this.planToday(false);
  }

  @Cron('*/15 * * * *', { timeZone: 'UTC' })
  async resumeToday(): Promise<number> {
    return this.planToday(false);
  }

  async signalSet(setId: string): Promise<number> {
    return this.planToday(true, setId);
  }

  async planToday(explicit: boolean, onlySetId?: string, now = new Date()): Promise<number> {
    if (!enabled(this.config, 'ENABLE_PRICE_BACKFILL_CRON') || !enabled(this.config, 'PRICE_QUEUE_ENABLED')) return 0;
    await this.registry.ensureCuratedSeed();
    await this.registry.reconcileCollectionSets();
    const day = utcDay(now);
    if (!explicit && now.getTime() < Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 3, 15)) {
      return 0;
    }

    const enabledSets = await this.prisma.$queryRaw<{ setId: string }[]>(Prisma.sql`
      SELECT "setId" FROM price_sync_sets
      WHERE enabled = TRUE AND (${onlySetId ?? null}::text IS NULL OR "setId" = ${onlySetId ?? null})
      ORDER BY priority, "setId"
    `);
    if (enabledSets.length === 0) return 0;
    const setIds = enabledSets.map(({ setId }) => setId);

    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE price_sync_card_days SET status = 'missed'::"PriceSyncCardDayStatus",
        "lastError" = 'El objetivo diario no llegó a iniciarse antes del siguiente día UTC', "updatedAt" = NOW()
      WHERE provider = 'tcgdex' AND "setId" = ANY(${setIds}::text[]) AND "syncDate" < ${day}::date
        AND status = 'pending'::"PriceSyncCardDayStatus"
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE price_sync_set_days d SET status = 'missed'::"PriceSyncSetDayStatus", "finishedAt" = NOW(), "updatedAt" = NOW()
      WHERE d.provider = 'tcgdex' AND d."setId" = ANY(${setIds}::text[]) AND d."syncDate" < ${day}::date
        AND d.status IN ('pending'::"PriceSyncSetDayStatus", 'running'::"PriceSyncSetDayStatus")
        AND NOT EXISTS (SELECT 1 FROM price_sync_card_days c WHERE c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate" AND c.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus"))
    `);

    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO price_sync_set_days (provider, "setId", "syncDate", status, "expectedCards", "createdAt", "updatedAt")
      SELECT 'tcgdex', s."setId", ${day}::date, 'pending'::"PriceSyncSetDayStatus",
        (SELECT COUNT(*)::int FROM cards c WHERE c."setId" = s."setId"), NOW(), NOW()
      FROM price_sync_sets s WHERE s.enabled AND s."setId" = ANY(${setIds}::text[])
      ON CONFLICT (provider, "setId", "syncDate") DO NOTHING
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO price_sync_card_days (provider, "cardId", "setId", "syncDate", status, "createdAt", "updatedAt")
      SELECT 'tcgdex', c.id, c."setId", ${day}::date, 'pending'::"PriceSyncCardDayStatus", NOW(), NOW()
      FROM cards c WHERE c."setId" = ANY(${setIds}::text[])
      ON CONFLICT (provider, "cardId", "syncDate") DO NOTHING
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE price_sync_set_days d SET
        "expectedCards" = (SELECT COUNT(*)::int FROM cards c WHERE c."setId" = d."setId"),
        status = CASE WHEN EXISTS (
          SELECT 1 FROM price_sync_card_days c WHERE c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate"
            AND c.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus")
        ) THEN 'running'::"PriceSyncSetDayStatus" ELSE d.status END,
        "startedAt" = CASE WHEN EXISTS (
          SELECT 1 FROM price_sync_card_days c WHERE c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate"
            AND c.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus")
        ) THEN COALESCE(d."startedAt", NOW()) ELSE d."startedAt" END,
        "finishedAt" = CASE WHEN EXISTS (
          SELECT 1 FROM price_sync_card_days c WHERE c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate"
            AND c.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus")
        ) THEN NULL ELSE d."finishedAt" END,
        "updatedAt" = NOW()
      WHERE d.provider = 'tcgdex' AND d."syncDate" = ${day}::date AND d."setId" = ANY(${setIds}::text[])
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      WITH observed AS MATERIALIZED (
        SELECT p."cardId", MAX(p."fetchedAt") AS "fetchedAt", COUNT(*)::int AS count
        FROM card_prices p JOIN cards c ON c.id = p."cardId"
        WHERE p.provider = 'tcgdex' AND p.source = 'tcgplayer' AND p.currency = 'USD'
          AND p.market IS NOT NULL
          AND p."fetchedAt" >= (${day}::date::timestamp AT TIME ZONE 'UTC')
          AND p."fetchedAt" < ((${day}::date + 1)::timestamp AT TIME ZONE 'UTC')
          AND c."setId" = ANY(${setIds}::text[])
        GROUP BY p."cardId"
      )
      UPDATE price_sync_card_days d SET status = 'quoted'::"PriceSyncCardDayStatus",
        "checkedAt" = observed."fetchedAt", "quoteCount" = observed.count, "updatedAt" = NOW()
      FROM observed
      WHERE d.provider = 'tcgdex' AND d."cardId" = observed."cardId" AND d."syncDate" = ${day}::date
        AND d.status = 'pending'::"PriceSyncCardDayStatus"
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE price_sync_set_days d SET
        status = CASE WHEN EXISTS (
          SELECT 1 FROM price_sync_card_days c WHERE c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate"
            AND c.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus")
        ) THEN 'running'::"PriceSyncSetDayStatus"
        WHEN EXISTS (
          SELECT 1 FROM price_sync_card_days c WHERE c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate"
            AND c.status = 'failed'::"PriceSyncCardDayStatus"
        ) AND NOT EXISTS (
          SELECT 1 FROM price_sync_card_days c WHERE c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate"
            AND c.status = 'quoted'::"PriceSyncCardDayStatus"
        ) AND NOT EXISTS (
          SELECT 1 FROM price_sync_card_days c WHERE c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate"
            AND c.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus")
        ) THEN 'failed'::"PriceSyncSetDayStatus"
        WHEN NOT EXISTS (
          SELECT 1 FROM price_sync_card_days c WHERE c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate"
            AND c.status <> 'quoted'::"PriceSyncCardDayStatus"
        ) THEN 'completed'::"PriceSyncSetDayStatus" ELSE 'partial'::"PriceSyncSetDayStatus" END,
        "finishedAt" = CASE WHEN EXISTS (
          SELECT 1 FROM price_sync_card_days c WHERE c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate"
            AND c.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus")
        ) THEN NULL ELSE COALESCE(d."finishedAt", NOW()) END,
        "updatedAt" = NOW()
      WHERE d.provider = 'tcgdex' AND d."syncDate" = ${day}::date AND d."setId" = ANY(${setIds}::text[])
    `);
    const ids = await this.prisma.$queryRaw<{ cardId: string }[]>(Prisma.sql`
      SELECT c.id AS "cardId" FROM cards c
      JOIN price_sync_card_days d ON d."cardId" = c.id AND d.provider = 'tcgdex' AND d."syncDate" = ${day}::date
      JOIN price_sync_sets s ON s."setId" = c."setId" AND s.enabled
      WHERE c."setId" = ANY(${setIds}::text[]) AND d.status = 'pending'::"PriceSyncCardDayStatus"
    `);
    const queued = await this.queue.enqueueMany(ids.map(({ cardId }) => cardId), 'daily', day);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE price_sync_set_days SET status = 'running'::"PriceSyncSetDayStatus", "startedAt" = COALESCE("startedAt", NOW()), "updatedAt" = NOW()
      WHERE provider = 'tcgdex' AND "syncDate" = ${day}::date AND "setId" = ANY(${setIds}::text[])
        AND status = 'pending'::"PriceSyncSetDayStatus"
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE price_sync_set_days SET status = 'completed'::"PriceSyncSetDayStatus", "finishedAt" = NOW(), "updatedAt" = NOW()
      WHERE provider = 'tcgdex' AND "syncDate" = ${day}::date AND "setId" = ANY(${setIds}::text[]) AND "expectedCards" = 0
    `);
    this.logger.log(`Ciclo tcgdex ${day.toISOString().slice(0, 10)}: ${queued} objetivos encolados`);
    return queued;
  }
}
