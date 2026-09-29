import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PRICE_PROVIDER,
  type PriceProvider,
  type RemoteCardPrice,
} from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { TCGDEX_SET_MAPPING, TcgdexSetMappingService } from './tcgdex-set-mapping.service.js';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/**
 * Frescura máxima de un precio. Es la **misma** regla que aplica el cliente en
 * `PRICE_MAX_AGE_MS` (`components/v2/prices/price-delta.tsx`): si el backend
 * acepta un precio de 26 h y el cliente lo marca como viejo, los dos se
 * contradicen en la misma pantalla. Se exporta para que el cálculo del delta a
 * 30 días use este número y no una copia.
 */
export const PRICE_MAX_AGE_MS = MAX_AGE_MS;
const CACHE_TTL_SECONDS = 60 * 60;
/**
 * Carta que tcgdex todavía no cotiza (set recién lanzado): reintentar en 6 h
 * en vez de 1 h, así no se le pega en cada vista de una carta sin respuesta.
 */
const NEGATIVE_CACHE_TTL_SECONDS = 6 * 60 * 60;
/**
 * Disciplina de la cola: tcgdex no publica límite (pide "consideración"), pero
 * es infra comunitaria compartida y el catálogo también usa pokemontcg.io
 * (~26 req/min entre ambos, debajo de los 30/min de esa API).
 */
const MIN_GAP_MS = 2300;

export interface CardPriceView {
  cardId: string;
  variant: string;
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  source: string;
  currency: string;
  fetchedAt: Date;
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
  source: string;
  currency: string;
  fetchedAt: Date;
}): CardPriceView {
  return {
    cardId: row.cardId,
    variant: row.variant,
    low: toNumber(row.low),
    mid: toNumber(row.mid),
    high: toNumber(row.high),
    market: toNumber(row.market),
    source: row.source,
    currency: row.currency,
    fetchedAt: row.fetchedAt,
  };
}

@Injectable()
export class SyncPricesService {
  private readonly logger = new Logger(SyncPricesService.name);
  private readonly queue: string[] = [];
  private readonly pending = new Set<string>();
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(TCGDEX_SET_MAPPING)
    private readonly mapping: Pick<TcgdexSetMappingService, 'resolve'>,
    @Inject(PRICE_PROVIDER) private readonly priceProvider: PriceProvider,
  ) {}

  async getPricesForCard(cardId: string): Promise<CardPriceView[]> {
    const cached = await this.redis.getJson<CardPriceView[]>(this.cacheKey(cardId));
    if (cached) return cached.map((p) => ({ ...p, fetchedAt: new Date(p.fetchedAt) }));

    const latest = await this.latestPrices(cardId);
    if (latest.length > 0 && Date.now() - latest[0]!.fetchedAt.getTime() < MAX_AGE_MS) {
      await this.cache(cardId, latest);
      return latest;
    }

    return this.refresh(cardId);
  }

  /**
   * Trae los precios en vivo desde tcgdex, identificado por (set, localId).
   *
   * Hasta acá llegaba el `rawJson` congelado de pokemontcg.io (su feed de
   * precios quedó ~2023): sets como me55 nunca iban a tener precio y ningún
   * refresh era real. Si tcgdex todavía no cotiza la carta, se degrada a lo
   * último conocido con la TTL negativa para reintentar más tarde.
   */
  async refresh(cardId: string): Promise<CardPriceView[]> {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        number: true,
        set: { select: { id: true, name: true, tcgdexSetId: true } },
      },
    });
    if (!card) {
      this.logger.warn(`No existe la carta ${cardId}: no hay precios para sincronizar`);
      return [];
    }

    let tcgdexSetId = card.set.tcgdexSetId;
    if (tcgdexSetId === null) {
      tcgdexSetId = (await this.mapping.resolve(card.set.id))?.tcgdexSetId ?? null;
    }
    if (tcgdexSetId === null) {
      this.logger.warn(
        `Sin mapeo a tcgdex para el set ${card.set.name} (${card.set.id}): no se pueden refrescar los precios de ${cardId}`,
      );
      return this.latestPrices(cardId);
    }

    let remote: RemoteCardPrice[];
    try {
      remote = await this.priceProvider.getCardPrices(card.id, tcgdexSetId, card.number);
    } catch (error) {
      this.logger.warn(
        `Fallo el fetch de precios de tcgdex para ${cardId}: ${(error as Error).message}`,
      );
      return this.latestPrices(cardId);
    }

    if (remote.length === 0) {
      this.logger.log(
        `tcgdex todavía no cotiza ${cardId} (${card.set.name}): queda lo último conocido`,
      );
      const previous = await this.latestPrices(cardId);
      await this.cache(cardId, previous, NEGATIVE_CACHE_TTL_SECONDS);
      return previous;
    }

    const fetchedAt = new Date();
    await this.prisma.cardPrice.createMany({
      data: remote.map((price) => ({
        cardId,
        variant: price.variant,
        low: price.low,
        mid: price.mid,
        high: price.high,
        market: price.market,
        source: price.source,
        currency: price.currency,
        fetchedAt,
      })),
    });

    const view: CardPriceView[] = remote.map((price) => ({
      ...price,
      fetchedAt,
    }));
    await this.cache(cardId, view);
    this.logger.log(
      `Precios de ${cardId} actualizados desde tcgdex: ${view.map((p) => p.variant).join(', ')}`,
    );
    return view;
  }

  async refreshMany(cardIds: string[]): Promise<{
    refreshed: number;
    failed: number;
    results: Record<string, CardPriceView[]>;
  }> {
    const results: Record<string, CardPriceView[]> = {};
    let failed = 0;
    for (const cardId of cardIds) {
      try {
        results[cardId] = await this.refresh(cardId);
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Falló el refresco de precios de ${cardId}: ${(error as Error).message}`,
        );
        results[cardId] = [];
      }
    }
    return { refreshed: Object.keys(results).length - failed, failed, results };
  }

  /**
   * Encola el refresco de una carta sin esperar.
   *
   * El precio se pide bajo demanda, así que una carta recién agregada a una
   * colección no tenía precio hasta que el usuario abría su detalle: el total de
   * la colección valía $0 pese a que el precio existe. Encolarlo al agregar lo
   * resuelve sin bloquear la respuesta ni pelar el rate limit.
   *
   * `MIN_GAP_MS` mantiene el proceso por debajo de ~26 peticiones/minuto, con
   * margen para el catálogo que sigue saliendo de pokemontcg.io (30/min).
   */
  enqueueRefresh(cardId: string): void {
    if (!cardId || this.pending.has(cardId)) return;
    this.pending.add(cardId);
    this.queue.push(cardId);
    if (!this.draining) void this.drain();
  }

  /** Cartas esperando refresco. Pensado para diagnóstico y tests. */
  get queueSize(): number {
    return this.queue.length;
  }

  private async drain(): Promise<void> {
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const cardId = this.queue.shift()!;
        try {
          await this.refresh(cardId);
        } catch (error) {
          this.logger.warn(
            `Fallo el refresco en background de ${cardId}: ${(error as Error).message}`,
          );
        } finally {
          this.pending.delete(cardId);
        }
        if (this.queue.length > 0) await this.sleep(MIN_GAP_MS);
      }
    } finally {
      this.draining = false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Último precio por variante, no el histórico entero.
   *
   * `card_prices` es append-only, así que una carta refrescada N veces tiene N
   * filas por variante. Con un `findMany` el endpoint devolvía la misma
   * variante repetida (y con `take: 20` una variante vieja podía desaparecer
   * del resultado). Es el mismo `DISTINCT ON` que usan las agregaciones de
   * colecciones, share y friends.
   */
  private async latestPrices(cardId: string): Promise<CardPriceView[]> {
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
        p.source,
        p.currency,
        p."fetchedAt" AS "fetchedAt"
      FROM card_prices p
      WHERE p."cardId" = ${cardId}
      ORDER BY p."cardId", p.variant, p."fetchedAt" DESC
    `;
    return rows.map(toView);
  }

  private cacheKey(cardId: string): string {
    return `prices:${cardId}`;
  }

  private async cache(
    cardId: string,
    prices: CardPriceView[],
    ttlSeconds: number = CACHE_TTL_SECONDS,
  ): Promise<void> {
    await this.redis.setJson(this.cacheKey(cardId), prices, ttlSeconds);
  }
}
