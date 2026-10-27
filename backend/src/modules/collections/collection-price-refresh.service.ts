import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { TcgcsvService } from '../../jobs/tcgcsv/tcgcsv.service.js';
import { Prisma } from '@prisma/client';
import { latestMarketPriceJoin } from '../../common/sql/latest-price.js';
import { PRICE_MAX_AGE_MS } from '../../jobs/sync-prices.service.js';
import { PrismaService } from '../../prisma/index.js';
import { PRICE_PROVIDER, type PriceProvider } from '../providers/card-provider.interface.js';

@Injectable()
export class CollectionPriceRefreshService {
  private readonly logger = new Logger(CollectionPriceRefreshService.name);

  constructor(private readonly prisma: PrismaService,
    @Inject(PRICE_PROVIDER) private readonly prices: PriceProvider,
    @Optional() private readonly ingestion?: TcgcsvService) {}

  async enqueue(userId: string, collectionId: string | null = null): Promise<number> {
    const now = new Date();
    const candidates = await this.prisma.$queryRaw<{ cardId: string }[]>(Prisma.sql`
      SELECT DISTINCT i."cardId" FROM collection_items i
      JOIN collections col ON col.id = i."collectionId"
      ${latestMarketPriceJoin(this.prices)}
      WHERE col."userId" = ${userId}
        AND (${collectionId}::text IS NULL OR col.id = ${collectionId})
        AND (lp.market IS NULL OR lp."fetchedAt" <= ${new Date(now.getTime() - PRICE_MAX_AGE_MS)} OR lp."fetchedAt" > ${now})
    `);
    return this.ingestion?.enqueueCards(candidates.map((row) => row.cardId)) ?? 0;
  }

  async enqueueOnRead(userId: string, collectionId: string | null = null): Promise<void> {
    try { await this.enqueue(userId, collectionId); }
    catch { this.logger.warn('No se pudo solicitar el refresco de precios; se conservan las referencias guardadas'); }
  }
}
