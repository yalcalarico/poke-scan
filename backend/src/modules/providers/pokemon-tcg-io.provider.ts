import { Injectable } from '@nestjs/common';
import { PROVIDER_IDS } from './card-provider.interface.js';
import type {
  CardDataProvider,
  PagedResult,
  RemoteCard,
  RemoteSet,
} from './card-provider.interface.js';

const BASE_URL = 'https://api.pokemontcg.io/v2';
const USER_AGENT = 'PokemonCardsScannerApp/1.0 (+https://github.com/pokemon-cards-scanner-app)';

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const BASE_BACKOFF_MS = 1000;
const MAX_ATTEMPTS = 4;

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
