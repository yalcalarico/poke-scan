// ─── Genéricos ───
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ─── Set (expansión) ───
export interface SetDto {
  id: string;
  name: string;
  series: string | null;
  printedTotal: number | null;
  total: number | null;
  releaseDate: string | null;
  logoUrl: string | null;
  symbolUrl: string | null;
}

// ─── Carta ───
export interface CardDto {
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
  set?: SetDto;
  imageSmall: string;
  imageLarge: string;
}

// ─── Búsqueda de cartas (GET /api/cards/search) ───
export type CardSort = 'name' | 'rarity' | 'number' | 'price';

/** Sentido del `sort`. Solo aplica si no viene `q`. */
export type CardSortDirection = 'asc' | 'desc';

/** Campo contra el que matchea `q`. Espeja `SearchCardsDto.searchBy`. */
export type CardSearchField = 'name' | 'number' | 'artist';

// ─── Precios (USD) ───
export type CardVariant =
  | 'normal'
  | 'holofoil'
  | 'reverseHolofoil'
  | 'firstEditionNormal'
  | 'firstEditionHolofoil'
  // Sets antiguos (Base y anteriores): la 1ª edición y la reprint "unlimited"
  // son ediciones distintas, no variantes de brillo.
  | 'firstEdition'
  | 'unlimited'
  | 'unlimitedHolofoil';

export type CardCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DM';

export interface PriceDto {
  cardId: string;
  variant: CardVariant;
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  currency: string; // 'USD'
  source: string; // 'tcgplayer'
  fetchedAt: string; // ISO 8601
  priceArs?: number | null; // presente cuando CURRENCY_ARS_ENABLED está activo
  /**
   * Variación contra la ventana de 30 días (B10).
   *
   * **Opcional y en USD**: solo lo manda `GET /cards/:id/prices`; los precios
   * de items de colección y del link público no lo traen, y sin él el
   * `PriceDelta` cae a "Actualizado hace 3 h".
   *
   * Cuando viene `null` (y no `undefined`) es una respuesta explícita: se
   * calculó y no hay nada honesto que decir. Las razones están en
   * `priceChange()` del backend; la que más se ve es que no exista ninguna
   * cotización **anterior** a la ventana, porque `card_prices` solo tiene unos
   * días de historia.
   *
   * - `usd` va **con signo**: `-2839.31` es una caída.
   * - `percent` sale con cero decimales (redondeo simétrico).
   * - `windowDays` es la ventana pedida (30).
   * - `from` es el `fetchedAt` real de la fila de referencia, que puede ser más
   *   viejo que la ventana. Si el cliente lo muestra, no miente.
   */
  change?: PriceChangeDto | null;
}

/** Variación de precio de una ventana. Espeja `PriceChangeDto` del backend. */
export interface PriceChangeDto {
  usd: number;
  percent: number;
  windowDays: number;
  /** ISO 8601 de la fila usada como referencia. */
  from: string;
}

// ─── Usuario ───
export interface UserDto {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  preferredCurrency?: 'USD' | 'ARS';
  preferredRateType?: 'blue' | 'oficial' | null;
}

export interface AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

// ─── Colecciones ───
/**
 * Una miniatura del mosaic de portada de `CollectionDto`.
 *
 * El backend collage las 4 cartas con más `quantity` de la colección, sin
 * repetir carta (la misma carta puede estar con dos variantes) y con un
 * desempate determinista. Solo `imageSmall`: es una URL, no un binario.
 */
export interface CollectionCoverItem {
  cardId: string;
  imageSmall: string;
}

export interface CollectionDto {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  itemCount: number;
  uniqueCount: number;
  duplicateCount: number;
  totalValueUsd: number;
  totalValueArs: number | null;
  /**
   * Hasta 4 miniaturas para el collage. Viene en `GET /collections`,
   * `GET /collections/:id`, `POST /collections` y `PATCH /collections/:id`;
   * **siempre como array, nunca `undefined`**. Es `[]` en una colección recién
   * creada y el cliente cae a la superficie de marca cuando está vacío.
   */
  cover: CollectionCoverItem[];
  createdAt: string;
}

export interface CollectionItemDto {
  id: string;
  collectionId: string;
  card: CardDto;
  variant: CardVariant;
  condition: CardCondition;
  quantity: number;
  isForTrade: boolean;
  notes: string | null;
  addedAt: string;
  price: PriceDto | null;
}

export interface CollectionStatsDto {
  totalCards: number;
  uniqueCards: number;
  duplicateCards: number;
  setsCount: number;
  totalValueUsd: number;
  totalValueArs: number | null;
}

// ─── Identificación por escaneo ───
export interface IdentifyRequestDto {
  lines?: string[];
  name?: string;
  number?: string;
  setHint?: string;
  limit?: number;
}

export interface IdentifiedCandidateDto {
  card: CardDto;
  score: number; // 0..1
  price: PriceDto | null;
  prices?: PriceDto[];
  matchedText?: string | null;
}

export interface IdentifyResponseDto {
  candidates: IdentifiedCandidateDto[];
  extracted: {
    name: string | null;
    number: string | null;
    setHint?: string | null;
  };
  totalCandidates: number;
}

// ─── Compartir ───
export interface ShareLinkDto {
  id: string;
  slug: string;
  url: string;
  collectionId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface SharedCollectionDto {
  ownerDisplayName: string;
  collectionName: string;
  items: CollectionItemDto[];
  stats: CollectionStatsDto;
}

// ─── Progreso por set ───
// Los dos DTO de abajo son el contrato de `GET /collections/:id/set-progress`
// y `GET /sets/:id/cards`. Duplicados a mano con los del backend
// (`AGENTS.md` §1): `SetProgressDto` en `collections.service.ts` y
// `SetCardsResponseDto` en `cards.service.ts`.

/**
 * Una fila del agregado por set de una colección
 * (`GET /api/collections/:id/set-progress`).
 *
 * - `owned`: cartas **únicas** del set que están en la colección
 *   (`COUNT(DISTINCT cardId)`), no la suma de cantidades. La misma carta con dos
 *   items (variante `normal` + `holofoil`) es **una** carta con dos copias. Ojo
 *   con `CollectionStatsDto.uniqueCards`, que es `COUNT(item.id)` — items, no
 *   cartas: con duplicados los dos números difieren.
 * - `total`: el denominador. Sale de `card_sets.total` y, si es `NULL`, de
 *   `card_sets.printedTotal`. Si **ambos** son `NULL` va `0`, y el cliente lo
 *   traduce a "desconocido" (muestra `—` y no calcula porcentaje) en vez de
 *   inventar un denominador con un `COUNT(cards)`.
 * - `valueUsd`: `SUM(quantity × market)` de la última fila de `card_prices` de
 *   la variante de cada item, en USD. **Siempre USD**: la conversión a ARS la
 *   hace el cliente con `useCurrency().formatMoney` (§9.3).
 * - `valueArs`: espejo opcional si `CURRENCY_ARS_ENABLED` está activo. El
 *   cliente **no** lo usa (misma razón que `CollectionStatsDto.totalValueArs`:
 *   el valor crudo siempre es USD); está para no romper el contrato si el
 *   backend lo empieza a mandar.
 * - `missingCount`: `total - owned`, ya recortado en 0.
 *
 * La respuesta es un **array pelado**, no un `Paginated`: son, a lo sumo, los sets
 * en los que la colección tiene alguna carta. `[]` si está vacía, nunca 404.
 */
export interface SetProgressDto {
  setId: string;
  owned: number;
  total: number;
  valueUsd: number;
  valueArs: number | null;
  missingCount: number;
}

/**
 * La lista completa de un set (`GET /api/sets/:id/cards`), que es lo que
 * necesita el binder: sin esto hay que paginar `/cards/search?setId=` de a 100
 * y un set de 300 cartas son 3 requests.
 *
 * `total` es el conteo real de `cards` de ese set, que puede diferir de
 * `SetDto.total` (el de la fuente). El binder usa este número, que es el que
 * puede contar los slots.
 */
export interface SetCardsResponseDto {
  set: SetDto;
  cards: CardDto[];
  total: number;
}
