export const CARD_DATA_PROVIDER = Symbol('CARD_DATA_PROVIDER');

export const PROVIDER_IDS = {
  POKEMON_TCG_IO: 'pokemontcg.io',
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

export interface RemoteCardPrice {
  cardId: string;
  variant: string;
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  /** Mercado/listing del precio (p.ej. TCGPlayer), no la API proveedora. */
  source: string;
  currency: string;
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
  getCard(id: string): Promise<RemoteCard | null>;
  getPricesForCard(
    card: RemoteCard | { id: string; tcgplayer?: unknown },
  ): Promise<RemoteCardPrice[]>;
}

/**
 * Fuente de precios en vivo, separada del catálogo. El catálogo sigue
 * espejándose desde pokemontcg.io, pero su feed de precios quedó congelado
 * (~2023): los sets nuevos nunca traían precio. Los precios se piden ahora a
 * tcgdex, que actualiza TCGPlayer cada ~1 h.
 */
export const PRICE_PROVIDER = Symbol('PRICE_PROVIDER');

/** Set de la fuente de precios, para mapear contra nuestro catálogo. */
export interface RemotePriceSet {
  id: string;
  name: string;
}

/**
 * Detalle de un set de la fuente de precios: los `localId` de sus cartas,
 * para validar que el set mapeado es el correcto antes de persistirlo.
 */
export interface RemotePriceSetDetail {
  id: string;
  name: string;
  localIds: string[];
}

export interface PriceProvider {
  readonly id: string;
  /** Mercado que usa la app para rankings y valuaciones por defecto. */
  readonly defaultSource: string;
  /** Moneda que usa la app para rankings y valuaciones por defecto. */
  readonly defaultCurrency: string;
  listSets(): Promise<RemotePriceSet[]>;
  getSetDetail(setId: string): Promise<RemotePriceSetDetail | null>;
  /**
   * Precios en vivo de una carta identificada por (set, localId).
   * `cardId` es el nuestro y viaja en cada `RemoteCardPrice` para que el
   * caller no tenga que re-estamparlo.
   */
  getCardPrices(
    cardId: string,
    setId: string,
    localId: string,
  ): Promise<RemoteCardPrice[]>;
}
