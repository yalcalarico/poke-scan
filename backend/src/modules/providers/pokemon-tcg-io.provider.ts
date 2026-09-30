import { Injectable } from '@nestjs/common';
import { PROVIDER_IDS } from './card-provider.interface.js';
import type {
  CardDataProvider,
  PagedResult,
  RemoteCard,
  RemoteCardPrice,
  RemoteSet,
} from './card-provider.interface.js';

const BASE_URL = 'https://api.pokemontcg.io/v2';
const USER_AGENT = 'PokemonCardsScannerApp/1.0 (+https://github.com/pokemon-cards-scanner-app)';

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const BASE_BACKOFF_MS = 1000;
const MAX_ATTEMPTS = 4;

/**
 * Claves de variante de TCGPlayer → nuestro enum.
 *
 * La fuente usa una clave distinta según la antigüedad del set. Los sets
 * modernos usan `normal` / `holofoil` / `reverseHolofoil`, pero los antiguos
 * (sobre todo Base) usan `1stEdition` / `unlimited` / `unlimitedHolofoil` /
 * `1stEditionHolofoil`. Con el mapa incompleto, 1.510 cartas del set Base se
 * quedaban sin precio aunque la fuente lo tuviera.
 *
 * Conteo real sobre el catálogo (20.670 cartas):
 *   reverseHolofoil 12.463 · normal 11.567 · holofoil 7.286
 *   1stEdition 673 · unlimited 673 · unlimitedHolofoil 164 · 1stEditionHolofoil 159
 */
const VARIANT_MAP: Record<string, string> = {
  normal: 'normal',
  holofoil: 'holofoil',
  reverseHolofoil: 'reverseHolofoil',
  '1stEditionNormal': 'firstEditionNormal',
  '1stEditionHolofoil': 'firstEditionHolofoil',
  // Sets antiguos: la 1ª edición y la reprint sin límite son ediciones
  // distintas de la misma carta, no de una variante de brillo.
  '1stEdition': 'firstEdition',
  unlimited: 'unlimited',
  unlimitedHolofoil: 'unlimitedHolofoil',
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

class NonRetryableError extends Error {}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNullableString(value: unknown): string | null {
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => v !== null && v !== undefined).map((v) => String(v));
}

function mapSet(raw: any): RemoteSet {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    series: toNullableString(raw.series),
    printedTotal: toNumber(raw.printedTotal),
    total: toNumber(raw.total),
    releaseDate: toNullableString(raw.releaseDate),
    logoUrl: toNullableString(raw.images?.logo),
    symbolUrl: toNullableString(raw.images?.symbol),
    ptcgoCode: toNullableString(raw.ptcgoCode),
    raw,
  };
}

function mapCard(raw: any): RemoteCard {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    supertype: String(raw.supertype ?? 'Unknown'),
    subtypes: toStringArray(raw.subtypes),
    hp: toNullableString(raw.hp),
    types: toStringArray(raw.types),
    number: String(raw.number ?? ''),
    rarity: toNullableString(raw.rarity),
    artist: toNullableString(raw.artist),
    setId: String(raw.set?.id ?? ''),
    imageSmall: String(raw.images?.small ?? ''),
    imageLarge: String(raw.images?.large ?? ''),
    regulationMark: toNullableString(raw.regulationMark),
    language: null,
    raw,
  };
}

function mapPaged<T>(
  data: T[],
  payload: any,
  requestedPage: number,
  requestedPageSize: number,
): PagedResult<T> {
  const page = toNumber(payload?.page) ?? requestedPage;
  const pageSize = toNumber(payload?.pageSize) ?? requestedPageSize;
  const total = toNumber(payload?.total) ?? toNumber(payload?.totalCount) ?? data.length;
  const totalPages =
    toNumber(payload?.totalPages) ?? Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
  return { data, page, pageSize, total, totalPages };
}

@Injectable()
export class PokemonTcgIoProvider implements CardDataProvider {
  readonly id = PROVIDER_IDS.POKEMON_TCG_IO;

  private readonly baseUrl: string = BASE_URL;

  async getSets(page: number, pageSize: number): Promise<PagedResult<RemoteSet>> {
    const payload = await this.getJson(`/sets?pageSize=${pageSize}&page=${page}`);
    const data = Array.isArray(payload?.data) ? payload.data.map(mapSet) : [];
    return mapPaged(data, payload, page, pageSize);
  }

  async getCardsPage(page: number, pageSize: number): Promise<PagedResult<RemoteCard>> {
    const payload = await this.getJson(`/cards?pageSize=${pageSize}&page=${page}`);
    const data = Array.isArray(payload?.data) ? payload.data.map(mapCard) : [];
    return mapPaged(data, payload, page, pageSize);
  }

  async getCard(id: string): Promise<RemoteCard | null> {
    try {
      const payload = await this.getJson(`/cards/${encodeURIComponent(id)}`);
      return payload?.data ? mapCard(payload.data) : null;
    } catch {
      return null;
    }
  }

  async getPricesForCard(
    card: RemoteCard | { id: string; tcgplayer?: unknown },
  ): Promise<RemoteCardPrice[]> {
    const holder = card as { id: string; tcgplayer?: unknown; raw?: unknown };
    const tcgplayer = (holder.tcgplayer ?? (holder.raw as any)?.tcgplayer) as
      | { prices?: Record<string, Record<string, unknown>> }
      | undefined;
    const prices = tcgplayer?.prices;
    if (!prices || typeof prices !== 'object') return [];

    const result: RemoteCardPrice[] = [];
    for (const [rawVariant, values] of Object.entries(prices)) {
      const variant = VARIANT_MAP[rawVariant];
      if (!variant || !values || typeof values !== 'object') continue;

      const low = toNumber((values as any).low);
      const mid = toNumber((values as any).mid);
      const high = toNumber((values as any).high);
      const market = toNumber((values as any).market);
      if (low === null && mid === null && high === null && market === null) continue;

      result.push({
        cardId: holder.id,
        variant,
        low,
        mid,
        high,
        market,
        source: 'tcgplayer',
        currency: 'USD',
      });
    }
    return result;
  }

  private async getJson(path: string): Promise<any> {
    return this.fetchWithRetry(`${this.baseUrl}${path}`);
  }

  private async fetchWithRetry(url: string, intentos: number = MAX_ATTEMPTS): Promise<any> {
    let lastError: unknown;

    for (let attempt = 0; attempt < intentos; attempt++) {
      let waitMs = BASE_BACKOFF_MS * 2 ** attempt;

      try {
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
          },
          signal: AbortSignal.timeout(30_000),
        });

        if (response.ok) return await response.json();

        if (!RETRYABLE_STATUS.has(response.status)) {
          throw new NonRetryableError(
            `pokemontcg.io respondió ${response.status} ${response.statusText} para ${url}`,
          );
        }

        lastError = new Error(`pokemontcg.io respondió ${response.status} para ${url}`);
        const retryAfter = Number(response.headers.get('retry-after'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) waitMs = retryAfter * 1000;
      } catch (error) {
        if (error instanceof NonRetryableError) throw error;
        lastError = error;
      }

      if (attempt < intentos - 1) await delay(waitMs + Math.floor(Math.random() * 250));
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Fallo de red al consultar ${url}`);
  }
}
