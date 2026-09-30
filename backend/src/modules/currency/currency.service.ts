import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RedisService } from '../../redis/redis.service.js';
import {
  BOTH_CACHE_KEY,
  DOLAR_API_BASE_URL,
  FEATURE_FLAG_ENV,
  LAST_KNOWN_SUFFIX,
  MAX_SANE_RATE,
  MIN_SANE_RATE,
  RATE_CACHE_PREFIX,
  RATE_CACHE_TTL_SECONDS,
  RATE_TYPES,
  STALE_AFTER_MS,
  UPSTREAM_TIMEOUT_MS,
  type RateType,
} from './currency.constants.js';

/**
 * Forma REAL de `GET https://dolarapi.com/v1/dolares/{blue|oficial}`
 * (verificada contra la API, no asumida):
 *
 *   {
 *     "moneda": "USD",
 *     "casa": "blue",
 *     "nombre": "Blue",
 *     "compra": 1540,
 *     "venta": 1560,
 *     "fechaActualizacion": "2026-09-25T20:58:00.000Z"
 *   }
 *
 * La documentación popular habla de `value`/`timestamp`; esta versión de la
 * API no los manda. Aceptamos ambos por si el upstream cambia, pero el camino
 * real es `venta` (cuánto pagás por 1 USD) con `compra` como fallback.
 */
interface DolarApiQuote {
  moneda?: string;
  casa?: string;
  nombre?: string;
  compra?: number;
  venta?: number;
  fechaActualizacion?: string;
  value?: number;
  timestamp?: string;
}

/** Lo que se persiste en Redis. `fetchedAt` es el timestamp de DolarApi. */
interface RateQuote {
  rate: number;
  rateType: RateType;
  fetchedAt: string;
}

export interface RateView {
  rate: number;
  rateType: RateType;
  fetchedAt: string;
  stale: boolean;
}

export interface BothRatesView {
  rate: number;
  rateType: RateType;
  fetchedAt: string;
  stale: boolean;
  blue: RateView | null;
  oficial: RateView | null;
}

export interface ConversionResult {
  usd: number;
  ars: number | null;
  rate: number | null;
  rateType: RateType;
  fetchedAt: string | null;
  stale: boolean;
}

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * ARS está habilitado salvo que `CURRENCY_ARS_ENABLED` valga exactamente
   * `'false'`. Ausente o cualquier otro valor => habilitado.
   */
  isArsEnabled(): boolean {
    return process.env[FEATURE_FLAG_ENV] !== 'false';
  }

  private assertEnabled(): void {
    if (!this.isArsEnabled()) {
      throw new NotFoundException(
        'Precios en ARS deshabilitados (CURRENCY_ARS_ENABLED=false)',
      );
    }
  }

  cacheKey(type: RateType): string {
    return `${RATE_CACHE_PREFIX}${type}`;
  }

  lastKnownKey(type: RateType): string {
    return `${RATE_CACHE_PREFIX}${type}${LAST_KNOWN_SUFFIX}`;
  }

  /**
   * Devuelve la cotización USD→ARS. Orden de resolución:
   *  1. caché fresca (TTL 1h)
   *  2. DolarApi (con timeout de 5s y validación de la respuesta)
   *  3. último valor conocido (sin TTL) marcado `stale: true`
   *  4. ServiceUnavailableException
   */
  async getUsdArs(type: RateType): Promise<RateView> {
    this.assertEnabled();

    const cached = await this.readCached(this.cacheKey(type));
    if (cached) return this.toView(cached, this.isOlderThanStaleWindow(cached));

    let quote: RateQuote;
    try {
      quote = await this.fetchQuote(type);
    } catch (error) {
      const reason = (error as Error).message;
      this.logger.warn(`DolarApi falló para "${type}": ${reason}`);

      const last = await this.readCached(this.lastKnownKey(type));
      if (last) {
        this.logger.warn(
          `Sirviendo cotización cacheada de "${type}" (${last.rate} ARS/USD) sin verificar`,
        );
        return this.toView(last, true);
      }

      throw new ServiceUnavailableException(
        `No hay cotización USD/ARS disponible para "${type}" y DolarApi no respondió (${reason}). Reintentá en unos minutos.`,
      );
    }

    await this.writeCached(quote);
    return this.toView(quote, this.isOlderThanStaleWindow(quote));
  }

  /**
   * Cotización de AMBIOS tipos para que el cliente pueda ofrecer el selector
   * (blue / oficial) con una sola llamada. Se cachea 1h.
   *
   * Un tipo puede faltar sin tumbar al otro: `blue` o `oficial` en `null`.
   */
  async getUsdArsBoth(preferred: RateType): Promise<BothRatesView> {
    this.assertEnabled();

    const cached = await this.redis.getJson<BothRatesView>(BOTH_CACHE_KEY);
    if (cached) return this.reorder(cached, preferred);

    const [blue, oficial] = await Promise.allSettled([
      this.getUsdArs('blue'),
      this.getUsdArs('oficial'),
    ]);

    const blueView = blue.status === 'fulfilled' ? blue.value : null;
    const oficialView = oficial.status === 'fulfilled' ? oficial.value : null;

    if (!blueView && !oficialView) {
      throw new ServiceUnavailableException(
        'No hay cotización USD/ARS disponible: DolarApi no respondió y no hay valores cacheados.',
      );
    }

    for (const [type, result] of [
      ['blue', blue],
      ['oficial', oficial],
    ] as const) {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Sin cotización para "${type}": ${(result.reason as Error).message}`,
        );
      }
    }

    const payload: BothRatesView = {
      ...this.pickPrimary(preferred, blueView, oficialView),
      blue: blueView,
      oficial: oficialView,
    };

    await this.redis.setJson(BOTH_CACHE_KEY, payload, RATE_CACHE_TTL_SECONDS);
    return payload;
  }

  /**
   * Elige la cotización "principal" de entre las dos.
   *
   * La preferencia es un *deseo*, no una garantía: `blue` y `oficial` se piden
   * en paralelo con `allSettled` y cualquiera de los dos puede faltar. Servir la
   * que hay con su `rateType` real es estrictamente mejor que un 500, y el
   * cliente siempre muestra qué tipo de cambio está usando, así que no miente.
   *
   * El que se cachea en `BOTH_CACHE_KEY` es el resultado de esta elección, así
   * que el orden de preferencia queda registrado en la propia respuesta.
   */
  private pickPrimary(
    preferred: RateType,
    blue: RateView | null,
    oficial: RateView | null,
  ): { rate: number; rateType: RateType; fetchedAt: string; stale: boolean } {
    const preferredView = preferred === 'oficial' ? oficial : blue;
    if (preferredView) {
      return {
        rate: preferredView.rate,
        rateType: preferred,
        fetchedAt: preferredView.fetchedAt,
        stale: preferredView.stale,
      };
    }

    const fallback = preferred === 'oficial' ? blue : oficial;
    if (!fallback) {
      // Sin `blue` ni `oficial` no hay nada que devolver. Los callers de este
      // método ya tiran 503 antes de llegar acá; es una guarda, no un camino
      // que se pueda alcanzar.
      throw new ServiceUnavailableException(
        'No hay cotización USD/ARS disponible: DolarApi no respondió y no hay valores cacheados.',
      );
    }

    const fallbackType = preferred === 'oficial' ? 'blue' : 'oficial';
    this.logger.warn(
      `Cotización "${preferred}" no disponible: se sirve "${fallbackType}" como principal`,
    );
    return {
      rate: fallback.rate,
      rateType: fallbackType,
      fetchedAt: fallback.fetchedAt,
      stale: fallback.stale,
    };
  }

  /**
   * `usd * rate`. Si la cotización no está disponible devuelve `ars: null`
   * en vez de tirar error: los listados de precios no se pueden romper por
   * una API externa caída.
   */
  async convert(usd: number, type: RateType): Promise<ConversionResult> {
    const base: ConversionResult = {
      usd,
      ars: null,
      rate: null,
      rateType: type,
      fetchedAt: null,
      stale: true,
    };

    if (!Number.isFinite(usd) || !this.isArsEnabled()) return base;

    try {
      const quote = await this.getUsdArs(type);
      return {
        usd,
        ars: round2(usd * quote.rate),
        rate: quote.rate,
        rateType: quote.rateType,
        fetchedAt: quote.fetchedAt,
        stale: quote.stale,
      };
    } catch (error) {
      this.logger.warn(
        `Sin conversión para ${usd} USD (${type}): ${(error as Error).message}`,
      );
      return base;
    }
  }

  /**
   * SOLO lee Redis. Para endpoints públicos como `GET /cards/:id/prices`:
   * no pegarle a DolarApi por request, porque un listado paginado dispararía
   * una consulta externa por página. Si no hay nada cacheado, `null` y listo.
   *
   * La conversión a ARS en general es responsabilidad del cliente: pide el
   * rate una vez a `GET /currency/usd-ars` (cacheado 1h) y lo aplica.
   */
  async getCachedRate(type: RateType): Promise<RateView | null> {
    if (!this.isArsEnabled()) return null;

    const cached =
      (await this.readCached(this.cacheKey(type))) ??
      (await this.readCached(this.lastKnownKey(type)));
    if (!cached) return null;

    return this.toView(cached, this.isOlderThanStaleWindow(cached));
  }

  /**
   * Igual que `getCachedRate` pero devuelve el rate "principal" de la
   * preferencia del usuario, tolerando valores guardados fuera del enum.
   */
  async getCachedRateFor(preferredRateType: string | null | undefined): Promise<RateView | null> {
    const type: RateType = RATE_TYPES.includes(preferredRateType as RateType)
      ? (preferredRateType as RateType)
      : 'blue';
    return this.getCachedRate(type);
  }

  /**
   * Reordena una respuesta ya cacheada para una preferencia nueva. Misma
   * tolerancia que `pickPrimary`: si la preferida no está en la cache, se
   * devuelve la que haya con su `rateType` real.
   */
  private reorder(view: BothRatesView, preferred: RateType): BothRatesView {
    return { ...view, ...this.pickPrimary(preferred, view.blue, view.oficial) };
  }

  private async fetchQuote(type: RateType): Promise<RateQuote> {
    const url = `${DOLAR_API_BASE_URL}/v1/dolares/${type}`;

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      const reason = (error as Error).name === 'TimeoutError'
        ? `timeout de ${UPSTREAM_TIMEOUT_MS}ms`
        : (error as Error).message;
      throw new Error(`no se pudo contactar a DolarApi (${reason})`);
    }

    if (!response.ok) {
      throw new Error(`DolarApi respondió ${response.status}`);
    }

    // DolarApi puede devolver HTML (proxy, mantenimiento). Chequeamos el
    // content-type antes de hacer JSON.parse para no tragarnos una excepción
    // de parseo y perder el mensaje real.
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      throw new Error(`DolarApi devolvió "${contentType || 'sin content-type'}' en vez de JSON`);
    }

    let payload: DolarApiQuote;
    try {
      payload = (await response.json()) as DolarApiQuote;
    } catch {
      throw new Error('DolarApi devolvió JSON inválido');
    }

    return this.parseQuote(payload, type);
  }

  private parseQuote(payload: DolarApiQuote, type: RateType): RateQuote {
    if (payload === null || typeof payload !== 'object') {
      throw new Error('DolarApi devolvió una respuesta inesperada');
    }

    // `venta` es lo que cuesta comprar USD; `compra` es el fallback.
    const candidates = [payload.venta, payload.compra, payload.value];
    const rate = candidates.find(
      (value) => typeof value === 'number' && Number.isFinite(value),
    );

    if (rate === undefined) {
      throw new Error('DolarApi no devolvió un valor de cotización numérico');
    }
    if (rate <= MIN_SANE_RATE || rate > MAX_SANE_RATE) {
      throw new Error(`DolarApi devolvió una cotización fuera de rango: ${rate}`);
    }

    return {
      rate,
      rateType: type,
      fetchedAt: this.parseTimestamp(payload.fechaActualizacion ?? payload.timestamp),
    };
  }

  private parseTimestamp(value: string | undefined): string {
    if (!value) return new Date().toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  private isOlderThanStaleWindow(quote: RateQuote): boolean {
    const fetchedAt = new Date(quote.fetchedAt).getTime();
    if (Number.isNaN(fetchedAt)) return true;
    return Date.now() - fetchedAt > STALE_AFTER_MS;
  }

  private toView(quote: RateQuote, stale: boolean): RateView {
    return {
      rate: quote.rate,
      rateType: quote.rateType,
      fetchedAt: quote.fetchedAt,
      stale,
    };
  }

  /** Lee y valida: una entrada corrupta o de otro tipo se ignora. */
  private async readCached(key: string): Promise<RateQuote | null> {
    const raw = await this.redis.getJson<RateQuote>(key);
    if (!raw) return null;
    if (typeof raw.rate !== 'number' || !Number.isFinite(raw.rate) || raw.rate <= 0) {
      this.logger.warn(`Entrada de caché inválida en ${key}, se ignora`);
      return null;
    }
    return raw;
  }

  private async writeCached(quote: RateQuote): Promise<void> {
    await this.redis.setJson(this.cacheKey(quote.rateType), quote, RATE_CACHE_TTL_SECONDS);
    // Sin TTL: sobrevive a la caída de DolarApi y al vencimiento de la caché.
    await this.redis.setJson(this.lastKnownKey(quote.rateType), quote);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
