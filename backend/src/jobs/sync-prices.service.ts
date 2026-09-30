import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PRICE_PROVIDER,
  type PriceProvider,
  type RemoteCardPrice,
} from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { ProviderRateGate } from './provider-rate.gate.js';
import { PriceQueueService } from './price-queue.service.js';
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

export interface CardPriceView {
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
}, activeProviderId: string): CardPriceView {
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
    isStale:
      row.provider !== activeProviderId || Date.now() - row.fetchedAt.getTime() >= MAX_AGE_MS,
  };
}

export class PriceFetchError extends Error {
  constructor(
    readonly cardId: string,
    message: string,
  ) {
    super(message);
    this.name = 'PriceFetchError';
  }
}

@Injectable()
export class SyncPricesService {
  private readonly logger = new Logger(SyncPricesService.name);
  /**
   * Refrescos en vuelo por carta. `getPricesForCard` corre en el camino de un
   * request público: sin esto, N clientes abriendo la misma carta vencida
   * dispararían N llamadas al proveedor por la misma fila.
   *
   * Es la **única** deduplicación que queda en memoria, y a propósito: la cola
   * ya deduplica por `processing` y de forma cross-proceso, pero el lote admin
   * (`refreshMany`) llama directo y no pasa por la cola. Contra el worker
   * concurrente de otra instancia esto no protege —esa fila la tiene tomada
   * otra—, aunque el ritmo global sí se respeta en los dos casos.
   */
  private readonly inFlight = new Map<string, Promise<CardPriceView[]>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gate: ProviderRateGate,
    private readonly queue: PriceQueueService,
    @Inject(TCGDEX_SET_MAPPING)
    private readonly mapping: Pick<TcgdexSetMappingService, 'resolve'>,
    @Inject(PRICE_PROVIDER) private readonly priceProvider: PriceProvider,
  ) {}

  async getPricesForCard(cardId: string): Promise<CardPriceView[]> {
    const cached = await this.redis.getJson<CardPriceView[]>(this.cacheKey(cardId));
    if (cached) {
      const prices = cached.map((price) => {
        const fetchedAt = new Date(price.fetchedAt);
        return {
          ...price,
          fetchedAt,
          isStale:
            price.provider !== this.priceProvider.id ||
            Date.now() - fetchedAt.getTime() >= MAX_AGE_MS,
        };
      });
      // Una lista vacía puede ser una respuesta negativa cacheada por seis
      // horas. Respetar esa TTL evita insistirle a la fuente por cartas que
      // todavía no cotiza.
      if (prices.some((price) => price.provider === this.priceProvider.id) && this.isStale(prices)) {
        this.enqueueRefresh(cardId);
      }
      return prices;
    }

    const current = await this.latestPrices(cardId, this.priceProvider.id);
    if (current.length > 0) {
      if (!this.isStale(current)) await this.cache(cardId, current);
      else this.enqueueRefresh(cardId);
      return current;
    }

    // Una fila legacy u otro proveedor se puede mostrar como fallback, pero no
    // se trata como fresca ni se usa para valuaciones del proveedor activo.
    const fallback = await this.latestFallbackPrices(cardId);
    this.enqueueRefresh(cardId);
    return fallback;
  }

  private isStale(prices: readonly CardPriceView[]): boolean {
    const fetchedAt = prices[0]?.fetchedAt;
    return (
      fetchedAt === undefined ||
      prices[0]?.provider !== this.priceProvider.id ||
      Date.now() - fetchedAt.getTime() >= MAX_AGE_MS
    );
  }

  /**
   * Refresco con el ritmo del proveedor.
   *
   * Es el camino **directo**: el lote admin y cualquier llamada explícita. El
   * camino de una lectura pública no usa esto —encola y devuelve lo último
   * conocido— y el worker de la cola tampoco: toma el slot él mismo.
   *
   * Lo que queda acá es la deduplicación por carta (`inFlight`) y el
   * `PriceFetchError` degradado a "lo último conocido", que es lo que espera un
   * endpoint que tiene que devolver algo.
   */
  private refreshThrottled(cardId: string): Promise<CardPriceView[]> {
    const existing = this.inFlight.get(cardId);
    if (existing) return existing;

    const run = this.gate
      .wait()
      .then(() => this.fetchAndStore(cardId))
      .catch((error: unknown) => {
        if (!(error instanceof PriceFetchError)) throw error;
        this.logger.warn(
          `Fallo el fetch de precios de ${cardId}: ${error.message}. Queda lo último conocido`,
        );
        return this.latestKnownPrices(cardId);
      })
      .finally(() => {
        this.inFlight.delete(cardId);
      });
    this.inFlight.set(cardId, run);
    return run;
  }

  /**
   * Trae los precios en vivo desde tcgdex, identificado por (set, localId).
   *
   * Hasta acá llegaba el `rawJson` congelado de pokemontcg.io (su feed de
   * precios quedó ~2023): sets como me55 nunca iban a tener precio y ningún
   * refresh era real. Si tcgdex todavía no cotiza la carta, se degrada a lo
   * último conocido con la TTL negativa para reintentar más tarde.
   *
   * Habla con el proveedor sin gap propio a propósito: el ritmo lo impone
   * `ProviderRateGate`, por el que pasan el lote admin y el worker de la cola.
   * Si se pusiera también acá, los dos caminos medirían el tiempo por separado y
   * volvería a haber dos relojes.
   */
  async refresh(cardId: string): Promise<CardPriceView[]> {
    return this.refreshThrottled(cardId);
  }

  /**
   * El refresco, sin nada de ritmo ni de deduplicación alrededor.
   *
   * Es la unidad de trabajo que consume la cola: el worker ya tomó el slot, así
   * que si esto tomara otro, la carta esperaría 2,3 s al slot que ella misma
   * acaba de liberar.
   *
   * ## Por qué `PriceFetchError` es un error y no un `catch` silencioso
   *
   * Antes este método se tragaba el fallo del proveedor y devolvía "lo último
   * conocido", que para un endpoint es lo correcto. Para la cola no lo es: un
   * 500 de tcgdex y una carta que tcgdex no tiene se veían **igual**, así que
   * un proveedor caído se guardaba como "terminado" y no se volvía a pedir
   * nunca. Ahora el fallo sale, la cola lo anota con backoff, y es
   * `refresh()` —el camino que tiene que devolver algo— el que degrada.
   */
  async fetchAndStore(cardId: string): Promise<CardPriceView[]> {
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
      /*
       * Sin mapeo no es un fallo: es una condición estable y conocida
       * (`cel25c` y `me55c` no mapean a propósito). Reintentar no lo arregla y
       * cada intento es un request que se gasta, así que se responde con lo
       * último conocido y el job termina como `completed`.
       */
      this.logger.warn(
        `Sin mapeo a tcgdex para el set ${card.set.name} (${card.set.id}): no se pueden refrescar los precios de ${cardId}`,
      );
      return this.latestKnownPrices(cardId);
    }

    let remote: RemoteCardPrice[];
    try {
      remote = await this.priceProvider.getCardPrices(card.id, tcgdexSetId, card.number);
    } catch (error) {
      throw new PriceFetchError(cardId, (error as Error).message);
    }

    const currentQuotes = remote.filter(
      (price) =>
        price.source === this.priceProvider.defaultSource &&
        price.currency === this.priceProvider.defaultCurrency,
    );
    const fetchedAt = new Date();
    if (remote.length > 0) {
      await this.prisma.cardPrice.createMany({
        data: remote.map((price) => ({
          cardId,
          variant: price.variant,
          low: price.low,
          mid: price.mid,
          high: price.high,
          market: price.market,
          provider: this.priceProvider.id,
          source: price.source,
          currency: price.currency,
          fetchedAt,
        })),
      });
    }

    if (currentQuotes.length === 0) {
      this.logger.log(
        `${this.priceProvider.id} no devolvió ${this.priceProvider.defaultSource}/${this.priceProvider.defaultCurrency} para ${cardId}: queda lo último conocido`,
      );
      const previous = await this.latestKnownPrices(cardId);
      await this.cache(cardId, previous, NEGATIVE_CACHE_TTL_SECONDS);
      return previous;
    }

    const view: CardPriceView[] = currentQuotes.map((price) => ({
      ...price,
      provider: this.priceProvider.id,
      fetchedAt,
      isStale: false,
    }));
    await this.cache(cardId, view);
    this.logger.log(
      `Precios de ${cardId} actualizados desde tcgdex: ${view.map((p) => p.variant).join(', ')}`,
    );
    return view;
  }

  /**
   * Refresco por lote del endpoint admin.
   *
   * Cada carta pasa por `refresh`, así que un lote grande tampoco puede gastar
   * el presupuesto de un saque: N cartas son N requests espaciados por el gap
   * global, y además este lote compite en el **mismo** reloj que el worker de la
   * cola. Es lento a propósito, y la alternativa era comerse el rate limit del
   * proveedor.
   */
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
   * No es más que una delegación a la cola: la deduplicación, el backoff y la
   * persistencia viven en `PriceQueueService`. El ritmo (≈26 peticiones/minuto)
   * lo aplica el worker de la cola antes de cada llamada al proveedor.
   */
  enqueueRefresh(cardId: string): void {
    this.queue.enqueue(cardId);
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
  private async latestPrices(
    cardId: string,
    providerId: string,
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
        AND p.provider = ${providerId}
        AND p.source = ${this.priceProvider.defaultSource}
        AND p.currency = ${this.priceProvider.defaultCurrency}
      ORDER BY p."cardId", p.variant, p."fetchedAt" DESC
    `;
    return rows.map((row) => toView(row, this.priceProvider.id));
  }

  private async latestFallbackPrices(cardId: string): Promise<CardPriceView[]> {
    const rows = await this.prisma.$queryRaw<
      (Omit<CardPriceView, 'low' | 'mid' | 'high' | 'market'> & {
        low: Prisma.Decimal | null;
        mid: Prisma.Decimal | null;
        high: Prisma.Decimal | null;
        market: Prisma.Decimal | null;
      })[]
    >`
      WITH fallback_provider AS (
        SELECT p.provider
        FROM card_prices p
        WHERE p."cardId" = ${cardId}
          AND p.provider IS DISTINCT FROM ${this.priceProvider.id}
          AND p.source = ${this.priceProvider.defaultSource}
          AND p.currency = ${this.priceProvider.defaultCurrency}
        GROUP BY p.provider
        ORDER BY MAX(p."fetchedAt") DESC NULLS LAST
        LIMIT 1
      )
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
        AND p.provider IS NOT DISTINCT FROM (SELECT provider FROM fallback_provider)
        AND p.source = ${this.priceProvider.defaultSource}
        AND p.currency = ${this.priceProvider.defaultCurrency}
      ORDER BY p."cardId", p.variant, p."fetchedAt" DESC
    `;
    return rows.map((row) => toView(row, this.priceProvider.id));
  }

  private async latestKnownPrices(cardId: string): Promise<CardPriceView[]> {
    const current = await this.latestPrices(cardId, this.priceProvider.id);
    return current.length > 0 ? current : this.latestFallbackPrices(cardId);
  }

  private cacheKey(cardId: string): string {
    return `prices:v2:${this.priceProvider.id}:${cardId}`;
  }

  private async cache(
    cardId: string,
    prices: CardPriceView[],
    ttlSeconds: number = CACHE_TTL_SECONDS,
  ): Promise<void> {
    await this.redis.setJson(this.cacheKey(cardId), prices, ttlSeconds);
  }
}
