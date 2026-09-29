import { Injectable, Logger } from '@nestjs/common';
import type {
  PriceProvider,
  RemoteCardPrice,
  RemotePriceSet,
  RemotePriceSetDetail,
} from './card-provider.interface.js';

const BASE_URL = 'https://api.tcgdex.net/v2/en';
const USER_AGENT = 'PokemonCardsScannerApp/1.0 (+https://github.com/pokemon-cards-scanner-app)';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;

/**
 * Claves de variante de tcgdex → nuestro enum. tcgdex usa kebab-case
 * (`reverse-holofoil`) contra el camelCase de pokemontcg.io. Los sets antiguos
 * traen `1st-edition` / `unlimited` como ediciones, igual que el enum nuestro.
 */
const VARIANT_MAP: Record<string, string> = {
  normal: 'normal',
  holofoil: 'holofoil',
  'reverse-holofoil': 'reverseHolofoil',
  '1st-edition': 'firstEdition',
  '1st-edition-holofoil': 'firstEditionHolofoil',
  unlimited: 'unlimited',
  'unlimited-holofoil': 'unlimitedHolofoil',
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

class NotFoundError extends Error {}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Cliente HTTP de tcgdex.dev: la fuente de precios en vivo (TCGPlayer USD,
 * actualizado ~cada 1 h, sin API key ni límite publicado).
 *
 * Los precios se piden por `(setId, localId)` vía `/sets/{setId}/{localId}`:
 * el endpoint acepta el número de carta sin padding ("18") aunque el set use
 * "018" (verificado contra me55 y miscp). El fallback con padding cubre el
 * caso inverso, si apareciera un set que solo acepta padded.
 */
@Injectable()
export class TcgdexProvider implements PriceProvider {
  private readonly logger = new Logger(TcgdexProvider.name);

  async listSets(): Promise<RemotePriceSet[]> {
    const payload = await this.getJson('/sets');
    if (!Array.isArray(payload)) return [];
    const result: RemotePriceSet[] = [];
    for (const item of payload) {
      const record = asRecord(item);
      if (!record || asString(record.id).length === 0) continue;
      result.push({ id: asString(record.id), name: asString(record.name) });
    }
    return result;
  }

  async getSetDetail(setId: string): Promise<RemotePriceSetDetail | null> {
    const payload = asRecord(await this.getJson(`/sets/${encodeURIComponent(setId)}`));
    if (payload === null || asString(payload.id).length === 0) return null;
    const localIds: string[] = [];
    if (Array.isArray(payload.cards)) {
      for (const card of payload.cards) {
        const record = asRecord(card);
        const localId = record === null ? '' : asString(record.localId);
        if (localId.length > 0) localIds.push(localId);
      }
    }
    return {
      id: asString(payload.id),
      name: asString(payload.name),
      localIds,
    };
  }

  async getCardPrices(
    cardId: string,
    setId: string,
    localId: string,
  ): Promise<RemoteCardPrice[]> {
    let payload: unknown;
    try {
      payload = await this.getJson(
        `/sets/${encodeURIComponent(setId)}/${encodeURIComponent(localId)}`,
      );
    } catch (error) {
      if (error instanceof NotFoundError && /^\d+$/.test(localId)) {
        // Fallback defensivo: algún set podría exigir el número con padding.
        this.logger.debug(
          `${setId}/${localId} no existe sin padding: reintentando con padStart(3)`,
        );
        payload = await this.getJson(
          `/sets/${encodeURIComponent(setId)}/${localId.padStart(3, '0')}`,
        );
      } else {
        throw error;
      }
    }

    const card = asRecord(payload);
    const pricing = card === null ? null : asRecord(card.pricing);
    const tcgplayer = pricing === null ? null : asRecord(pricing.tcgplayer);
    if (tcgplayer === null) return [];

    const unit = asString(tcgplayer.unit);
    const currency = unit.length > 0 ? unit : 'USD';

    const result: RemoteCardPrice[] = [];
    for (const [rawVariant, values] of Object.entries(tcgplayer)) {
      const variant = VARIANT_MAP[rawVariant];
      const prices = asRecord(values);
      if (!variant || prices === null) continue;

      const low = toNumber(prices.lowPrice);
      const mid = toNumber(prices.midPrice);
      const high = toNumber(prices.highPrice);
      const market = toNumber(prices.marketPrice);
      if (low === null && mid === null && high === null && market === null) continue;

      result.push({
        cardId,
        variant,
        low,
        mid,
        high,
        market,
        source: 'tcgplayer',
        currency,
      });
    }
    return result;
  }

  private async getJson(path: string): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(`${BASE_URL}${path}`, {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        });

        if (response.ok) return await response.json();

        if (response.status === 404) {
          throw new NotFoundError(`tcgdex respondió 404 para ${path}`);
        }

        if (!RETRYABLE_STATUS.has(response.status)) {
          throw new Error(
            `tcgdex respondió ${response.status} ${response.statusText} para ${path}`,
          );
        }

        lastError = new Error(`tcgdex respondió ${response.status} para ${path}`);
      } catch (error) {
        if (error instanceof NotFoundError) throw error;
        lastError = error;
      }

      if (attempt < MAX_ATTEMPTS - 1) {
        await delay(BASE_BACKOFF_MS * 2 ** attempt + Math.floor(Math.random() * 250));
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Fallo de red al consultar tcgdex ${path}`);
  }
}
