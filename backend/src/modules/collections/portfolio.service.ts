import { Inject, Injectable, Optional } from '@nestjs/common';
import { CollectionComparisonService } from '../../jobs/collection-comparison.service.js';
import { CollectionPriceRefreshService } from './collection-price-refresh.service.js';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { latestMarketPriceJoin } from '../../common/sql/latest-price.js';
import { priceMetadata, snapshotValuation, valuationFromCounts, type PriceMetadataDto, type ValueAggregateDto } from '../../common/price-metadata.js';
import { PrismaService } from '../../prisma/index.js';
import { PRICE_PROVIDER, type PriceProvider } from '../providers/card-provider.interface.js';

export interface PortfolioDto {
  totalCards: number;
  unpricedCards: number;
  valueUsd: number | null;
  valuation: ValueAggregateDto;
  history: { date: string; valueUsd: number | null; totalCards: number; unpricedCards: number; valuation: ValueAggregateDto }[];
  topCards: { cardId: string; name: string; imageSmall: string; setName: string; number: string;
    variant: string; quantity: number; marketUsd: number; valueUsd: number; reference: { provider: string; source: string; currency: string; fetchedAt: string } & PriceMetadataDto }[];
}

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService, @Inject(PRICE_PROVIDER) private readonly prices: PriceProvider,
    @Optional() private readonly priceRefresh?: CollectionPriceRefreshService,
    @Optional() private readonly comparisonSnapshots?: CollectionComparisonService) {}

  /** Corte diario con el inventario de ese día, aunque el usuario no visite la web. */
  @Cron('45 23 * * *', { timeZone: 'UTC' })
  async captureDaily(): Promise<void> {
    if (process.env.ENABLE_PORTFOLIO_SNAPSHOTS_CRON === 'false') return;
    if (this.prices.id === 'tcgcsv') {
      await this.comparisonSnapshots?.capture();
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO portfolio_snapshots ("userId", day, "valueUsd", "totalCards", "unpricedCards")
      SELECT col."userId", ${day}::date,
        CASE WHEN COALESCE(SUM(i.quantity), 0) > 0 AND COUNT(lp.market) = 0 THEN NULL
          ELSE ROUND(COALESCE(SUM(i.quantity * lp.market), 0)::numeric, 2)::float8 END,
        COALESCE(SUM(i.quantity), 0)::int,
        COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NULL), 0)::int
      FROM collections col LEFT JOIN collection_items i ON i."collectionId" = col.id
      ${latestMarketPriceJoin(this.prices)}
      GROUP BY col."userId"
      ON CONFLICT ("userId", day) DO UPDATE SET "valueUsd" = EXCLUDED."valueUsd",
        "totalCards" = EXCLUDED."totalCards", "unpricedCards" = EXCLUDED."unpricedCards"
    `);
    await this.comparisonSnapshots?.capture();
  }

  async summary(userId: string): Promise<PortfolioDto> {
    await this.priceRefresh?.enqueueOnRead(userId);
    const evaluatedAt = new Date();
    const [totals, topCards] = await Promise.all([
      this.prisma.$queryRaw<{ totalCards: number; unpricedCards: number; valueUsd: number; pricedCopies: number; freshCopies: number; staleCopies: number; oldestFetchedAt: Date | null; newestFetchedAt: Date | null }[]>(Prisma.sql`
        SELECT COALESCE(SUM(i.quantity), 0)::int AS "totalCards",
          COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NULL), 0)::int AS "unpricedCards",
          COALESCE(SUM(i.quantity * lp.market), 0)::float8 AS "valueUsd",
          COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NOT NULL), 0)::int AS "pricedCopies",
          COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NOT NULL AND lp.provider = ${this.prices.id} AND lp."fetchedAt" <= ${evaluatedAt} AND lp."fetchedAt" > ${new Date(evaluatedAt.getTime() - 86400000)}), 0)::int AS "freshCopies",
          COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NOT NULL AND lp."fetchedAt" <= ${new Date(evaluatedAt.getTime() - 86400000)}), 0)::int AS "staleCopies",
          MIN(lp."fetchedAt") FILTER (WHERE lp.market IS NOT NULL AND lp."fetchedAt" <= ${evaluatedAt}) AS "oldestFetchedAt",
          MAX(lp."fetchedAt") FILTER (WHERE lp.market IS NOT NULL AND lp."fetchedAt" <= ${evaluatedAt}) AS "newestFetchedAt"
        FROM collection_items i JOIN collections col ON col.id = i."collectionId"
        ${latestMarketPriceJoin(this.prices)} WHERE col."userId" = ${userId}
      `),
      this.prisma.$queryRaw<Array<Omit<PortfolioDto['topCards'][number], 'reference'> & { fetchedAt: Date; provider: string; source: string; currency: string }>>(Prisma.sql`
        SELECT c.id AS "cardId", c.name, c."imageSmall", s.name AS "setName", c.number,
          i.variant, SUM(i.quantity)::int AS quantity, MAX(lp.market)::float8 AS "marketUsd",
          SUM(i.quantity * lp.market)::float8 AS "valueUsd", lp."fetchedAt" AS "fetchedAt", lp.provider, lp.source, lp.currency
        FROM collection_items i JOIN collections col ON col.id = i."collectionId"
        JOIN cards c ON c.id = i."cardId" JOIN card_sets s ON s.id = c."setId"
        ${latestMarketPriceJoin(this.prices)}
        WHERE col."userId" = ${userId} AND lp.market IS NOT NULL
        GROUP BY c.id, s.name, i.variant, lp."fetchedAt", lp.provider, lp.source, lp.currency
        ORDER BY "marketUsd" DESC, c.name ASC, c.id ASC, i.variant ASC LIMIT 5
      `),
    ]);
    const total = totals[0] ?? { totalCards: 0, unpricedCards: 0, valueUsd: 0, pricedCopies: 0, freshCopies: 0, staleCopies: 0, oldestFetchedAt: null, newestFetchedAt: null };
    const valueUsd = total.totalCards > 0 && total.unpricedCards === total.totalCards ? null : Math.round(total.valueUsd * 100) / 100;
    const valuation = valuationFromCounts({ totalCopies: total.totalCards, pricedCopies: total.pricedCopies, amount: total.valueUsd, evaluatedAt,
      freshCopies: total.freshCopies, staleCopies: total.staleCopies, unknownFreshnessCopies: Math.max(0, total.pricedCopies - total.freshCopies - total.staleCopies),
      oldestFetchedAt: total.oldestFetchedAt, newestFetchedAt: total.newestFetchedAt });
    // Una observación por día UTC: consultar de nuevo actualiza el mismo punto.
    // No reconstruimos el pasado con las cantidades que el usuario tiene hoy.
    const day = new Date(`${evaluatedAt.toISOString().slice(0, 10)}T00:00:00Z`);
    if (this.prices.id !== 'tcgcsv') await this.prisma.portfolioSnapshot.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, valueUsd, totalCards: total.totalCards, unpricedCards: total.unpricedCards },
      update: { valueUsd, totalCards: total.totalCards, unpricedCards: total.unpricedCards },
    });
    const history = this.prices.id === 'tcgcsv'
      ? ((await this.comparisonSnapshots?.comparison(userId, null, 365))?.series.find((series) => series.provider === 'tcgcsv')?.points ?? [])
        .map((point) => ({ day: new Date(`${point.date}T00:00:00Z`), valueUsd: point.valueUsd, totalCards: point.totalCopies, unpricedCards: point.unpricedCopies })).reverse()
      : await this.prisma.portfolioSnapshot.findMany({ where: { userId }, orderBy: { day: 'desc' }, take: 365 });
    return { totalCards: total.totalCards, unpricedCards: total.unpricedCards, valueUsd, valuation, topCards: topCards.map((card) => ({
      cardId: card.cardId, name: card.name, imageSmall: card.imageSmall, setName: card.setName, number: card.number,
      variant: card.variant, quantity: card.quantity, marketUsd: card.marketUsd, valueUsd: card.valueUsd,
      reference: { provider: card.provider, source: card.source, currency: card.currency,
        fetchedAt: card.fetchedAt.toISOString(), ...priceMetadata(card.fetchedAt, card.provider, this.prices.id, evaluatedAt) },
    })), history: history.reverse().map((point) => ({
      date: point.day.toISOString().slice(0, 10), valueUsd: point.valueUsd,
      totalCards: point.totalCards, unpricedCards: point.unpricedCards,
      valuation: snapshotValuation(point.totalCards, point.unpricedCards, point.valueUsd),
    })) };
  }
}
