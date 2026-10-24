import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
import { priceMetadata, validDate, type PriceMetadataDto } from '../common/price-metadata.js';
import { TcgcsvService } from './tcgcsv/tcgcsv.service.js';
import { ProviderRateLimitError } from '../common/errors/provider-rate-limit.error.js';

function utcDate(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

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
      row.provider !== activeProviderId || Date.now() - row.fetchedAt.getTime() >= MAX_AGE_MS,
  };
}

export function hydrateCachedPrice(price: CardPriceView, activeProviderId: string, now = new Date()): CardPriceView {
  const fetchedAt = new Date(price.fetchedAt);
  const evaluation = validDate(price.evaluatedAt, now);
  const hasMetadata = evaluation !== null && ['fresh', 'stale', 'unknown'].includes(price.freshness) &&
    (price.freshness === 'unknown' || validDate(price.fetchedAt, evaluation) !== null) &&
    price.upstreamUpdatedAt === null && price.upstreamFreshness === 'unknown';
  return {
    ...price,
    fetchedAt,
    ...(hasMetadata ? {} : { evaluatedAt: now.toISOString(), freshness: 'unknown' as const, upstreamUpdatedAt: null, upstreamFreshness: 'unknown' as const }),
    isStale: price.provider !== activeProviderId || now.getTime() - fetchedAt.getTime() >= MAX_AGE_MS,
  };
}

export class PriceFetchError extends Error {
  constructor(
    readonly cardId: string,
    message: string,
    readonly cause?: unknown,
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
    @Optional() private readonly ingestion?: TcgcsvService,
  ) {}

  async getPricesForCard(cardId: string): Promise<CardPriceView[]> {
    if (this.priceProvider.id === 'tcgcsv') {
      // El feed puede publicarse entre dos lecturas: PostgreSQL refleja el lote
      // confirmado sin conservar una cifra vieja en la caché de cartas.
      const prices = await this.latestPrices(cardId, 'tcgcsv');
      if (prices.length === 0 || this.isStale(prices)) this.enqueueRefresh(cardId);
      return prices;
    }
    const cached = await this.redis.getJson<CardPriceView[]>(this.cacheKey(cardId));
    if (cached) {
      const evaluatedAt = new Date();
      const prices = cached.map((price) => hydrateCachedPrice(price, this.priceProvider.id, evaluatedAt));
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
    if (this.priceProvider.id === 'tcgcsv') {
      await this.ingestion?.enqueueCards([cardId]);
      return this.latestPrices(cardId, 'tcgcsv');
    }
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
    return (await this.fetchAndStoreWithOutcome(cardId)).prices;
  }

  async hasTerminalDailyObservation(cardId: string): Promise<boolean> {
    const syncDate = utcDate(new Date());
    const row = await this.prisma.priceSyncCardDay.findUnique({
      where: { provider_cardId_syncDate: { provider: this.priceProvider.id, cardId, syncDate } },
      select: { status: true },
    });
    return row !== null && ['quoted', 'no_quote', 'unmapped', 'unsupported', 'no_new_feed'].includes(row.status);
  }

  async fetchAndStoreWithOutcome(cardId: string, dailyDeduplicate = false, onProviderRequest?: () => Promise<void>): Promise<{
    prices: CardPriceView[];
    status: 'quoted' | 'no_quote' | 'unmapped' | 'unsupported' | 'failed';
    checkedAt: Date | null;
    quoteCount: number;
  }> {
    if (this.priceProvider.id === 'tcgcsv') {
      await this.ingestion?.enqueueCards([cardId]);
      const prices = await this.latestPrices(cardId, 'tcgcsv');
      return { prices, status: prices.some((price) => price.market !== null) ? 'quoted' : 'no_quote', checkedAt: null, quoteCount: 0 };
    }
    if (dailyDeduplicate) {
      const today = utcDate(new Date());
      const observed = await this.prisma.priceSyncCardDay.findUnique({
        where: { provider_cardId_syncDate: { provider: this.priceProvider.id, cardId, syncDate: today } },
      });
      if (observed && ['quoted', 'no_quote', 'unmapped', 'unsupported', 'no_new_feed'].includes(observed.status)) {
        const terminalStatus = observed.status === 'quoted' ? 'quoted'
          : observed.status === 'unmapped' ? 'unmapped'
            : observed.status === 'unsupported' ? 'unsupported' : 'no_quote';
        return {
          prices: await this.latestKnownPrices(cardId),
          status: terminalStatus,
          checkedAt: observed.checkedAt,
          quoteCount: observed.quoteCount,
        };
      }
    }
    let setId: string | null = null;
    const cardBefore = await this.prisma.card.findUnique({ where: { id: cardId }, select: { setId: true } });
    setId = cardBefore?.setId ?? null;
    const mapped = cardBefore ? await this.prisma.cardSet.findUnique({ where: { id: cardBefore.setId }, select: { tcgdexSetId: true } }) : null;
    let prices: CardPriceView[] = [];
    let status: 'quoted' | 'no_quote' | 'unmapped' | 'unsupported' | 'failed' = 'unsupported';
    let checkedAt: Date | null = null;
    let quoteCount = 0;
    let didFetch = false;
    try {
      prices = await this.fetchAndStoreRaw(cardId, async (remote, fetchedAt) => {
        didFetch = true;
        checkedAt = fetchedAt;
        const quotes = remote.filter((price) => price.source === this.priceProvider.defaultSource && price.currency === this.priceProvider.defaultCurrency && price.market !== null);
        quoteCount = quotes.length;
        status = quoteCount > 0 ? 'quoted' : 'no_quote';
        if (!setId) return;
        const syncDate = new Date(Date.UTC(fetchedAt.getUTCFullYear(), fetchedAt.getUTCMonth(), fetchedAt.getUTCDate()));
        const evidence = { provider: this.priceProvider.id, cardId, setId, syncDate };
        await this.prisma.$transaction(async (tx) => {
          if (remote.length > 0) {
            await tx.cardPrice.createMany({ data: remote.map((price) => ({
              cardId, variant: price.variant, low: price.low, mid: price.mid, high: price.high,
              market: price.market, provider: this.priceProvider.id, source: price.source,
              currency: price.currency, fetchedAt,
            })) });
          }
          await tx.priceSyncCardDay.upsert({
            where: { provider_cardId_syncDate: { provider: evidence.provider, cardId, syncDate: evidence.syncDate } },
            create: { ...evidence, status, checkedAt: fetchedAt, quoteCount, lastError: null },
            update: { status, checkedAt: fetchedAt, quoteCount, lastError: null },
          });
          await this.refreshSetDay(tx, setId!, syncDate);
        });
      }, onProviderRequest);
      if (!cardBefore) status = 'unsupported';
      else if (!didFetch) {
        status = mapped?.tcgdexSetId == null ? 'unmapped' : 'unsupported';
        if (status === 'unmapped' && setId) {
          const syncDate = utcDate(new Date());
          await this.prisma.$transaction(async (tx) => {
            await tx.priceSyncCardDay.upsert({
              where: { provider_cardId_syncDate: { provider: this.priceProvider.id, cardId, syncDate } },
              create: { provider: this.priceProvider.id, cardId, setId: setId!, syncDate, status, checkedAt: null, quoteCount: 0 },
              update: { status, checkedAt: null, quoteCount: 0 },
            });
            await this.refreshSetDay(tx, setId!, syncDate);
          });
        }
      }
    } catch (error) {
      status = 'failed';
      const rateLimit = error instanceof ProviderRateLimitError
        ? error
        : error instanceof Error && error.cause instanceof ProviderRateLimitError
          ? error.cause
          : null;
      if (rateLimit) await this.gate.recordRateLimit(rateLimit);
      checkedAt = new Date();
      if (setId) {
        const syncDate = new Date(Date.UTC(checkedAt.getUTCFullYear(), checkedAt.getUTCMonth(), checkedAt.getUTCDate()));
        const evidence = { provider: this.priceProvider.id, cardId, setId, syncDate };
        await this.prisma.$transaction(async (tx) => {
          await tx.priceSyncCardDay.upsert({
            where: { provider_cardId_syncDate: { provider: evidence.provider, cardId, syncDate: evidence.syncDate } },
            create: { ...evidence, status: 'failed', checkedAt, quoteCount: 0, lastError: (error as Error).message.slice(0, 500) },
            update: { status: 'failed', checkedAt, lastError: (error as Error).message.slice(0, 500) },
          });
          await this.refreshSetDay(tx, setId!, syncDate);
        });
      }
      throw error;
    }
    return { prices, status, checkedAt, quoteCount };
  }

  private async refreshSetDay(tx: Prisma.TransactionClient, setId: string, syncDate: Date): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE price_sync_set_days sd SET
        status = CASE
          WHEN EXISTS (SELECT 1 FROM price_sync_card_days c WHERE c.provider = sd.provider AND c."setId" = sd."setId" AND c."syncDate" = sd."syncDate" AND c.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus")) THEN 'running'::"PriceSyncSetDayStatus"
          WHEN EXISTS (SELECT 1 FROM price_sync_card_days c WHERE c.provider = sd.provider AND c."setId" = sd."setId" AND c."syncDate" = sd."syncDate" AND c.status = 'failed'::"PriceSyncCardDayStatus")
            AND NOT EXISTS (SELECT 1 FROM price_sync_card_days c WHERE c.provider = sd.provider AND c."setId" = sd."setId" AND c."syncDate" = sd."syncDate" AND c.status = 'quoted'::"PriceSyncCardDayStatus")
            AND NOT EXISTS (SELECT 1 FROM price_sync_card_days c WHERE c.provider = sd.provider AND c."setId" = sd."setId" AND c."syncDate" = sd."syncDate" AND c.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus")) THEN 'failed'::"PriceSyncSetDayStatus"
          WHEN NOT EXISTS (SELECT 1 FROM price_sync_card_days c WHERE c.provider = sd.provider AND c."setId" = sd."setId" AND c."syncDate" = sd."syncDate" AND c.status <> 'quoted'::"PriceSyncCardDayStatus") THEN 'completed'::"PriceSyncSetDayStatus"
          ELSE 'partial'::"PriceSyncSetDayStatus" END,
        "sourceCheckedAt" = (SELECT MAX(c."checkedAt") FROM price_sync_card_days c WHERE c.provider = sd.provider AND c."setId" = sd."setId" AND c."syncDate" = sd."syncDate"),
        "finishedAt" = CASE WHEN NOT EXISTS (SELECT 1 FROM price_sync_card_days c WHERE c.provider = sd.provider AND c."setId" = sd."setId" AND c."syncDate" = sd."syncDate" AND c.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus")) THEN COALESCE(sd."finishedAt", NOW()) ELSE NULL END,
        "updatedAt" = NOW()
      WHERE sd.provider = ${this.priceProvider.id} AND sd."setId" = ${setId} AND sd."syncDate" = ${syncDate}::date
    `);
  }

  private async fetchAndStoreRaw(cardId: string, onProviderResult: (remote: RemoteCardPrice[], fetchedAt: Date) => Promise<void>, onProviderRequest?: () => Promise<void>): Promise<CardPriceView[]> {
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
      await onProviderRequest?.();
      remote = await this.priceProvider.getCardPrices(card.id, tcgdexSetId, card.number);
    } catch (error) {
      throw new PriceFetchError(cardId, (error as Error).message, error);
    }

    const currentQuotes = remote.filter(
      (price) =>
        price.source === this.priceProvider.defaultSource &&
        price.currency === this.priceProvider.defaultCurrency,
    );
    const fetchedAt = new Date();
    await onProviderResult(remote, fetchedAt);

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
      ...priceMetadata(fetchedAt, this.priceProvider.id, this.priceProvider.id, fetchedAt),
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
    queued?: number;
  }> {
    if (this.priceProvider.id === 'tcgcsv') {
      const queued = await this.ingestion?.enqueueCards(cardIds) ?? 0;
      return { refreshed: 0, failed: 0, queued, results: {} };
    }
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
    if (this.priceProvider.id === 'tcgcsv') {
      void this.ingestion?.enqueueCards([cardId]).catch(() => this.logger.warn('No se pudo encolar la actualización TCGCSV'));
      return;
    }
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
    const evaluatedAt = new Date();
    return rows.map((row) => toView(row, this.priceProvider.id, evaluatedAt));
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
    const evaluatedAt = new Date();
    return rows.map((row) => toView(row, this.priceProvider.id, evaluatedAt));
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
