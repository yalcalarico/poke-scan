export const CARD_DATA_PROVIDER = Symbol('CARD_DATA_PROVIDER');

export const PROVIDER_IDS = {
  POKEMON_TCG_IO: 'pokemontcg.io',
  // El historial público sigue validando estas identidades, sin registrar adaptadores.
  TCGDEX: 'tcgdex',
  SCRYDEX: 'scrydex',
} as const;

export interface RemoteSet {
  id: string;
  name: string;
  series: string | null;
  printedTotal: number | null;
  total: number | null;
  releaseDate: string | null;
  logoUrl: string | null;
  symbolUrl: string | null;
  /** Código impreso de 3 caracteres ("30C"). Null en los sets que no lo imprimen. */
  ptcgoCode: string | null;
  raw: unknown;
}

export interface RemoteCard {
  id: string;
  name: string;
  supertype: string;
  subtypes: string[];
  hp: string | null;
  types: string[];
  number: string;
  rarity: string | null;
  artist: string | null;
  setId: string;
  imageSmall: string;
  imageLarge: string;
  regulationMark: string | null;
  language: string | null;
  raw: unknown;
}

export interface PagedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CardDataProvider {
  readonly id: string;
  getSets(page: number, pageSize: number): Promise<PagedResult<RemoteSet>>;
  getCardsPage(page: number, pageSize: number): Promise<PagedResult<RemoteCard>>;

}

/** Identidad de las observaciones usadas en lecturas y valuaciones locales. */
export const PRICE_PROVIDER = Symbol('PRICE_PROVIDER');

export interface PriceProvider {
  readonly id: string;
  readonly defaultSource: string;
  readonly defaultCurrency: string;
}
