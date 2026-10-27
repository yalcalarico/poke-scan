import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PRICE_PROVIDER, type PriceProvider } from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { priceMetadata, type PriceMetadataDto } from '../common/price-metadata.js';
import { TcgcsvService } from './tcgcsv/tcgcsv.service.js';

/** Frescura compartida por lecturas, deltas y refrescos de colección. */
export const PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface CardPriceView extends PriceMetadataDto {
  cardId: string;
  variant: string;
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  provider: string | null;
  source: string;
  currency: string;
  fetchedAt: Date;
  isStale: boolean;
}

function toNumber(value: Prisma.Decimal | null): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toView(row: {
  cardId: string;
  variant: string;
  low: Prisma.Decimal | null;
  mid: Prisma.Decimal | null;
  high: Prisma.Decimal | null;
  market: Prisma.Decimal | null;
  provider: string | null;
  source: string;
  currency: string;
  fetchedAt: Date;
}, activeProviderId: string, evaluatedAt = new Date()): CardPriceView {
  return {
    cardId: row.cardId,
    variant: row.variant,
    low: toNumber(row.low),
    mid: toNumber(row.mid),
    high: toNumber(row.high),
    market: toNumber(row.market),
    provider: row.provider,
    source: row.source,
    currency: row.currency,
    fetchedAt: row.fetchedAt,
    ...priceMetadata(row.fetchedAt, row.provider, activeProviderId, evaluatedAt),
    isStale:
      row.provider !== activeProviderId || Date.now() - row.fetchedAt.getTime() >= PRICE_MAX_AGE_MS,
  };
}

/** Lee observaciones confirmadas; toda actualización se delega a la cola por grupo. */
@Injectable()
export class SyncPricesService {
  private readonly logger = new Logger(SyncPricesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRICE_PROVIDER) private readonly priceProvider: PriceProvider,
    private readonly ingestion: TcgcsvService,
  ) {}

  async getPricesForCard(cardId: string): Promise<CardPriceView[]> {
    // Una publicación del feed debe verse en la siguiente lectura, sin caché por carta.
    const prices = await this.latestPrices(cardId);
    if (prices.length === 0 || this.isStale(prices)) this.enqueueRefresh(cardId);
    return prices;
  }

  private isStale(prices: readonly CardPriceView[]): boolean {
    const fetchedAt = prices[0]?.fetchedAt;
    return fetchedAt === undefined || Date.now() - fetchedAt.getTime() >= PRICE_MAX_AGE_MS;
  }

  async refreshMany(cardIds: string[]): Promise<{
    refreshed: number;
    failed: number;
    results: Record<string, CardPriceView[]>;
    queued: number;
  }> {
    const queued = await this.ingestion.enqueueCards(cardIds);
    return { refreshed: 0, failed: 0, queued, results: {} };
  }

  enqueueRefresh(cardId: string): void {
    void this.ingestion.enqueueCards([cardId]).catch(() =>
      this.logger.warn('No se pudo encolar la actualización TCGCSV'));
  }

  private async latestPrices(
    cardId: string,
  ): Promise<CardPriceView[]> {
    const rows = await this.prisma.$queryRaw<
      (Omit<CardPriceView, 'low' | 'mid' | 'high' | 'market'> & {
        low: Prisma.Decimal | null;
        mid: Prisma.Decimal | null;
        high: Prisma.Decimal | null;
        market: Prisma.Decimal | null;
      })[]
    >`
      SELECT DISTINCT ON (p."cardId", p.variant)
        p."cardId" AS "cardId",
        p.variant AS "variant",
        p.low,
        p.mid,
        p.high,
        p.market,
        p.provider,
        p.source,
        p.currency,
        p."fetchedAt" AS "fetchedAt"
      FROM card_prices p
      WHERE p."cardId" = ${cardId}
        AND p.provider = ${this.priceProvider.id}
        AND p.source = ${this.priceProvider.defaultSource}
        AND p.currency = ${this.priceProvider.defaultCurrency}
      ORDER BY p."cardId", p.variant, p."fetchedAt" DESC
    `;
    const evaluatedAt = new Date();
    return rows.map((row) => toView(row, this.priceProvider.id, evaluatedAt));
  }

}
