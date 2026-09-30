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
/** Cortesía actual hacia TCGdex; sus requests no consumen la cuota de pokemontcg.io. */
const MIN_GAP_MS = 2300;

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

@Injectable()
export class SyncPricesService {
  private readonly logger = new Logger(SyncPricesService.name);
  private readonly queue: string[] = [];
  private readonly pending = new Set<string>();
  /**
   * Refrescos en vuelo por carta. `getPricesForCard` corre en el camino de un
   * request público: sin esto, N clientes abriendo la misma carta vencida
   * dispararían N llamadas al proveedor por la misma fila.
   */
  private readonly inFlight = new Map<string, Promise<CardPriceView[]>>();
  /** Serializa las llamadas al proveedor para poder espaciarlas en el tiempo. */
  private gate: Promise<unknown> = Promise.resolve();
  private lastProviderCallAt = 0;
  /**
   * Separación mínima entre dos llamadas al proveedor. Es una propiedad
   * inyectable solo para que los tests no tarden 2,3 s por caso: el valor de
   * producción es `MIN_GAP_MS` y no debería cambiarlo nadie más.
   */
  private minGapMs = MIN_GAP_MS;
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
   * Es el camino que corre en background y en el lote admin. La lectura pública
   * no espera esta promesa: devuelve lo último conocido y encola el refresh.
   * Este método aplica dos barreras a todos los refresh efectivos:
   *
   * - **dedupe por carta**: si la carta ya se está refrescando, se espera esa
   *   misma promesa en vez de abrir un segundo request al proveedor.
   * - **gap mínimo del proveedor activo**: `MIN_GAP_MS` se aplica acá, no solo en `drain`.
   *   Antes, dos requests simultáneos sobre cartas vencidas distintas salían
   *   los dos juntos, y un `refreshMany` (endpoint admin) podía saltarse el
   *   ritmo configurado. Todos los refresh pasan por la misma puerta y
   *   comparten el mismo reloj dentro de este proceso.
   */
  private refreshThrottled(cardId: string): Promise<CardPriceView[]> {
    const existing = this.inFlight.get(cardId);
    if (existing) return existing;

    const run = this.withProviderSlot(() => this.refreshUnthrottled(cardId)).finally(() => {
      this.inFlight.delete(cardId);
    });
    this.inFlight.set(cardId, run);
    return run;
  }

  /**
   * Serializa el acceso al proveedor y espera lo que falte para respetar el
   * gap. El reloj se toma al empezar, no al terminar: dos llamadas lentas
   * seguidas no acumulan el gap dos veces.
   */
  private async withProviderSlot<T>(task: () => Promise<T>): Promise<T> {
    const run = this.gate.then(async () => {
      const wait = this.lastProviderCallAt + this.minGapMs - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.lastProviderCallAt = Date.now();
      return task();
    });
    this.gate = run.catch(() => undefined);
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
   * `withProviderSlot`, por el que pasan todos los caminos. Si se pusiera
   * también acá, la cola y el lote admin medirían el tiempo por separado y
   * volvería a haber dos relojes.
   */
  async refresh(cardId: string): Promise<CardPriceView[]> {
    return this.refreshThrottled(cardId);
  }

  private async refreshUnthrottled(cardId: string): Promise<CardPriceView[]> {
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
      return this.latestKnownPrices(cardId);
    }

    let remote: RemoteCardPrice[];
    try {
      remote = await this.priceProvider.getCardPrices(card.id, tcgdexSetId, card.number);
    } catch (error) {
      this.logger.warn(
        `Fallo el fetch de precios de tcgdex para ${cardId}: ${(error as Error).message}`,
      );
      return this.latestKnownPrices(cardId);
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
    * Cada carta pasa por `refresh`, así que un lote grande tampoco puede
    * gastar el presupuesto de un saque: N cartas son N requests espaciados
   * por `MIN_GAP_MS`. Es lento a propósito, y la alternativa era comerse el
   * rate limit del proveedor.
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
    * El ritmo (≈26 peticiones/minuto) lo aplica `withProviderSlot` dentro de
    * `refresh`. Las lecturas públicas stale-while-revalidate encolan acá y
    * devuelven el dato disponible sin esperar el slot.
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
        // Sin `sleep` acá: `refresh` pasa por `withProviderSlot`, que mantiene
        // el límite también para los lotes admin.
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
