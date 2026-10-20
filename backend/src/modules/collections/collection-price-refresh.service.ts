import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { latestMarketPriceJoin } from '../../common/sql/latest-price.js';
import { PRICE_MAX_AGE_MS } from '../../jobs/sync-prices.service.js';
import { PrismaService } from '../../prisma/index.js';
import { PRICE_PROVIDER, type PriceProvider } from '../providers/card-provider.interface.js';

const NEGATIVE_RETRY_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class CollectionPriceRefreshService {
  private readonly logger = new Logger(CollectionPriceRefreshService.name);

  constructor(private readonly prisma: PrismaService,
    @Inject(PRICE_PROVIDER) private readonly prices: PriceProvider) {}

  async enqueue(userId: string, collectionId: string | null = null, retryFailed = false): Promise<number> {
    const now = new Date();
    // El INSERT comparte la deduplicación durable y el backoff del worker.
    // El cooldown evita insistir en cada visita por variantes que la fuente no cotiza.
    const rows = await this.prisma.$queryRaw<{ cardId: string }[]>(Prisma.sql`
      INSERT INTO price_refresh_jobs (id, "cardId", status, "availableAt", "updatedAt", origin)
      SELECT gen_random_uuid()::text, candidates."cardId", 'pending', ${now}, ${now}, 'interactive'::"PriceSyncQueueOrigin"
      FROM (
        SELECT DISTINCT i."cardId"
        FROM collection_items i JOIN collections col ON col.id = i."collectionId"
        ${latestMarketPriceJoin(this.prices)}
        WHERE col."userId" = ${userId}
          AND (${collectionId}::text IS NULL OR col.id = ${collectionId})
          AND (lp.market IS NULL OR lp."fetchedAt" <= ${new Date(now.getTime() - PRICE_MAX_AGE_MS)} OR lp."fetchedAt" > ${now})
      ) candidates
      WHERE true
      ON CONFLICT ("cardId") DO UPDATE SET
        status = CASE WHEN price_refresh_jobs.status IN ('completed', 'failed') THEN 'pending' ELSE price_refresh_jobs.status END,
        origin = 'interactive'::"PriceSyncQueueOrigin",
        "availableAt" = GREATEST(price_refresh_jobs."availableAt", EXCLUDED."availableAt"),
        "updatedAt" = EXCLUDED."updatedAt",
        attempts = CASE WHEN price_refresh_jobs.status IN ('completed', 'failed') THEN 0 ELSE price_refresh_jobs.attempts END,
        "completedAt" = CASE WHEN price_refresh_jobs.status IN ('completed', 'failed') THEN NULL ELSE price_refresh_jobs."completedAt" END,
        "lastError" = CASE WHEN price_refresh_jobs.status IN ('completed', 'failed') THEN NULL ELSE price_refresh_jobs."lastError" END,
        "lockedBy" = CASE WHEN price_refresh_jobs.status = 'processing' THEN price_refresh_jobs."lockedBy" ELSE NULL END,
        "lockedAt" = CASE WHEN price_refresh_jobs.status = 'processing' THEN price_refresh_jobs."lockedAt" ELSE NULL END
      WHERE (price_refresh_jobs.status = 'completed'
          AND (price_refresh_jobs."completedAt" IS NULL OR price_refresh_jobs."completedAt" <= ${new Date(now.getTime() - NEGATIVE_RETRY_MS)}))
        OR (${retryFailed} AND price_refresh_jobs.status = 'failed')
        OR (price_refresh_jobs.status IN ('pending', 'processing') AND price_refresh_jobs.origin <> 'interactive'::"PriceSyncQueueOrigin")
      RETURNING "cardId"
    `);
    return rows.length;
  }

  async enqueueOnRead(userId: string, collectionId: string | null = null): Promise<void> {
    try { await this.enqueue(userId, collectionId); }
    catch { this.logger.warn('No se pudo solicitar el refresco de precios; se conservan las referencias guardadas'); }
  }
}
