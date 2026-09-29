import type {
  CardDto,
  CardSearchField,
  CardSort,
  CardSortDirection,
  Paginated,
  PriceDto,
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

export function getSets(): Promise<SetDto[]> {
  return apiFetch<SetDto[]>('/sets');
}
