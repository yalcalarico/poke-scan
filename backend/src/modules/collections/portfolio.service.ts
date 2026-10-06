import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { latestMarketPriceJoin } from '../../common/sql/latest-price.js';
import { PrismaService } from '../../prisma/index.js';
import { PRICE_PROVIDER, type PriceProvider } from '../providers/card-provider.interface.js';

export interface PortfolioDto {
  totalCards: number;
  unpricedCards: number;
  valueUsd: number | null;
  history: { date: string; valueUsd: number | null; totalCards: number; unpricedCards: number }[];
  topCards: { cardId: string; name: string; imageSmall: string; setName: string; number: string;
    variant: string; quantity: number; marketUsd: number; valueUsd: number }[];
}

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService, @Inject(PRICE_PROVIDER) private readonly prices: PriceProvider) {}

  async summary(userId: string): Promise<PortfolioDto> {
    const [totals, topCards] = await Promise.all([
      this.prisma.$queryRaw<{ totalCards: number; unpricedCards: number; valueUsd: number }[]>(Prisma.sql`
        SELECT COALESCE(SUM(i.quantity), 0)::int AS "totalCards",
          COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NULL), 0)::int AS "unpricedCards",
          COALESCE(SUM(i.quantity * lp.market), 0)::float8 AS "valueUsd"
        FROM collection_items i JOIN collections col ON col.id = i."collectionId"
        ${latestMarketPriceJoin(this.prices)} WHERE col."userId" = ${userId}
      `),
      this.prisma.$queryRaw<PortfolioDto['topCards']>(Prisma.sql`
        SELECT c.id AS "cardId", c.name, c."imageSmall", s.name AS "setName", c.number,
          i.variant, SUM(i.quantity)::int AS quantity, MAX(lp.market)::float8 AS "marketUsd",
          SUM(i.quantity * lp.market)::float8 AS "valueUsd"
        FROM collection_items i JOIN collections col ON col.id = i."collectionId"
        JOIN cards c ON c.id = i."cardId" JOIN card_sets s ON s.id = c."setId"
        ${latestMarketPriceJoin(this.prices)}
        WHERE col."userId" = ${userId} AND lp.market IS NOT NULL
        GROUP BY c.id, s.name, i.variant
        ORDER BY "marketUsd" DESC, c.name ASC, c.id ASC, i.variant ASC LIMIT 5
      `),
    ]);
    const total = totals[0] ?? { totalCards: 0, unpricedCards: 0, valueUsd: 0 };
    const valueUsd = total.totalCards > 0 && total.unpricedCards === total.totalCards ? null : Math.round(total.valueUsd * 100) / 100;
    // Una observación por día UTC: consultar de nuevo actualiza el mismo punto.
    // No reconstruimos el pasado con las cantidades que el usuario tiene hoy.
    const day = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    await this.prisma.portfolioSnapshot.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, valueUsd, totalCards: total.totalCards, unpricedCards: total.unpricedCards },
      update: { valueUsd, totalCards: total.totalCards, unpricedCards: total.unpricedCards },
    });
    const history = await this.prisma.portfolioSnapshot.findMany({ where: { userId }, orderBy: { day: 'desc' }, take: 365 });
    return { ...total, valueUsd, topCards, history: history.reverse().map((point) => ({
      date: point.day.toISOString().slice(0, 10), valueUsd: point.valueUsd,
      totalCards: point.totalCards, unpricedCards: point.unpricedCards,
    })) };
  }
}
