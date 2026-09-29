import type {
  CardDto,
  CardSearchField,
  CardSort,
  CardSortDirection,
  CardVariant,
  Paginated,
  PriceDto,
  PriceHistoryDto,
  SetDto,
} from '@/types/api';
import { apiFetch, buildQueryString } from './api-client';

export type { CardSearchField, CardSort, CardSortDirection } from '@/types/api';

export interface CardSearchParams {
  q?: string;
  /** Campo contra el que matchea `q`. El backend usa `name` si no se manda. */
  searchBy?: CardSearchField;
  setId?: string;
  rarity?: string;
  supertype?: string;
  type?: string;
  page?: number;
  pageSize?: number;
  sort?: CardSort;
  /**
   * Sentido del `sort`. El backend lo **ignora si viene `q`**: con texto el
   * orden es por score de relevancia, que no es invertible.
   */
  direction?: CardSortDirection;
}

export interface CardWithPricesDto {
  card: CardDto;
  prices: PriceDto[];
}

/**
 * Parámetros de `GET /cards/:id/prices/history`.
 *
 * Los dos son opcionales y los dos tienen un default que **no** se escribe: el
 * default del servidor es 30 días y "la mejor cotización disponible de cada
 * día". Mandarlos es para cambiar la ventana o fijar una variante.
 */
export interface PriceHistoryParams {
  /** Ventana en días. El servidor la recorta a 7..365 en vez de dar 400. */
  days?: number;
  /**
   * Acota la serie a una variante. Sin él, la serie es una fila por día con la
   * mejor cotización disponible de ese día.
   */
  variant?: CardVariant;
}

export function buildCardsSearchPath(params: CardSearchParams = {}): string {
  return `/cards/search${buildQueryString(params)}`;
}

export function searchCards(params: CardSearchParams = {}): Promise<Paginated<CardDto>> {
  return apiFetch<Paginated<CardDto>>(buildCardsSearchPath(params));
}

export function getCard(id: string): Promise<CardDto> {
  return apiFetch<CardDto>(`/cards/${encodeURIComponent(id)}`);
}

export function getCardPrices(id: string): Promise<CardWithPricesDto> {
  return apiFetch<CardWithPricesDto>(`/cards/${encodeURIComponent(id)}/prices`);
}

/**
 * La serie de precios de la carta (`GET /cards/:id/prices/history`).
 *
 * ## Por qué esta request es gratis
 *
 * A diferencia de `getCardPrices`, este endpoint **nunca** consulta al proveedor
 * de precios: arma la serie con un `DISTINCT ON (fetchedAt::date)` sobre el
 * índice `(cardId, variant, fetchedAt)` que `card_prices` ya tiene. No gasta ni
 * una petición del presupuesto de 1.000/día de pokemontcg.io (`AGENTS.md` §3.1),
 * y por eso la ficha puede pedirla siempre que quiera.
 *
 * Un 404 se propaga como `ApiError`, y solo significa "la carta no existe".
 */
export function getCardPriceHistory(
  id: string,
  params: PriceHistoryParams = {},
): Promise<PriceHistoryDto> {
  return apiFetch<PriceHistoryDto>(
    `/cards/${encodeURIComponent(id)}/prices/history${buildQueryString(params)}`,
  );
}

export function getSets(): Promise<SetDto[]> {
  return apiFetch<SetDto[]>('/sets');
}
