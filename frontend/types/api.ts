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
  /** API que entregó la cotización; `null` en precios legacy sin procedencia verificable. */
  provider: string | null;
  /** `true` si el dato es legacy/de otro proveedor o superó la frescura configurada. */
  isStale?: boolean;
  currency: string; // 'USD'
  source: string; // mercado/listing, p. ej. 'tcgplayer'
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
  /**
   * Los tres campos que consume la píldora de variación del `PriceDelta`
   * (`components/prices/price-delta.tsx`), **planos** y en USD.
   *
   * ## Por qué existen si `change` ya estaba
   *
   * No es un segundo cálculo: el backend deriva los tres de `change` con los
   * mismos nombres que el componente ya espera. La diferencia es de forma —
   * `change` es anidado y con prefijo (`change.usd`), los tres son de primer
   * nivel — y el endpoint de histórico los manda así porque su consumidor es un
   * gráfico, no una tabla.
   *
   * ## Reglas que hay que respetar al usarlos
   *
   * - **Opcionales**: los precios de items de colección y del link público no
   *   los traen, así que `undefined` es "este endpoint no calcula delta".
   * - **`null` es una respuesta explícita**, nunca `0`: no hay ninguna
   *   cotización *anterior* a la ventana con la que comparar, que es lo que más
   *   pasa porque `card_prices` tiene unos días de historia. Un `0 %` afirma
   *   que el precio no se movió, y eso es un dato. Ver la nota de `change`
   *   arriba, que es la misma regla.
   * - **Van siempre juntos o ninguno**: si no hay nada honesto que decir, los
   *   tres vienen `null`.
   * - **Siempre en USD**: la conversión a ARS la hace el cliente
   *   (`useCurrency().formatMoney`), como con todos los demás precios.
   *
   * `card-price-section.tsx` lee estos tres y usa `change` anidado como
   * respaldo, para que una fila de precio que solo traiga la forma anidida
   * siga mostrando el delta.
   */
  changeUsd?: number | null;
  changePercent?: number | null;
  /** "últimos 30 días". `null` cuando no hay delta. */
  windowLabel?: string | null;
}

/** Variación de precio de una ventana. Espeja `PriceChangeDto` del backend. */
export interface PriceChangeDto {
  usd: number;
  percent: number;
  windowDays: number;
  /** ISO 8601 de la fila usada como referencia. */
  from: string;
}

/* ─── Histórico de precios ───
 *
 * `GET /api/cards/:id/prices/history?days=&variant=`. Es la serie que dibuja el
 * `Sparkline` de la ficha y de la que sale el delta real.
 *
 * A diferencia de `/prices`, este endpoint **nunca** consulta al proveedor de
 * precios: arma la serie con un `DISTINCT ON (fetchedAt::date)` sobre el índice
 * `(cardId, variant, fetchedAt)` que `card_prices` ya tiene. Por eso no gasta
 * nada del presupuesto de pokemontcg.io (`AGENTS.md` §3.1) y por eso puede ir
 * por la ruta pública.
 */

/** Un día de la serie. Espeja `PriceHistoryPointDto` del backend. */
export interface PriceHistoryPointDto {
  /** El día en UTC, `YYYY-MM-DD`. Es la etiqueta del eje. */
  date: string;
  /** `fetchedAt` real de la fila que se eligió para ese día. */
  fetchedAt: string;
  market: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
}

/**
 * La variación de la ventana. Espeja `PriceWindowChangeDto`.
 *
 * Los dos van **con signo**: `changeUsd: -2839.31` es una caída.
 */
export interface PriceWindowChangeDto {
  changeUsd: number;
  /** Cero decimales, redondeo simétrico. */
  changePercent: number;
}

/** Espeja `PriceHistoryDto` del backend. */
export interface PriceHistoryDto {
  cardId: string;
  /** `null` identifica la serie legacy sin proveedor verificable. */
  provider: string | null;
  source: string;
  /**
   * La variante de la serie, o `null` si es "la mejor disponible por día".
   *
   * `null` **no** es un default perdido: hay cartas que solo tienen
   * `reverseHolofoil` o `firstEdition`, y fijar una variante las dejaría sin
   * serie. Es el mismo criterio "mejor precio disponible" que usa `sort=price`.
   */
  variant: CardVariant | null;
  /** Moneda original de la serie. La conversión a ARS la hace el cliente (§9.3). */
  currency: string;
  /** La ventana efectiva, ya recortada por el servidor a 7..365. */
  windowDays: number;
  /** Fecha del primer punto con `market`, o `null` si la serie está vacía. */
  from: string | null;
  /** Fecha del último punto con `market`, o `null` si la serie está vacía. */
  to: string | null;
  /** Un punto por día, en orden cronológico ascendente. */
  points: PriceHistoryPointDto[];
  /**
   * El delta de la ventana, o **`null`**.
   *
   * El `null` es deliberado y no es un bug: es lo que vuelve cuando no hay
   * **dos** puntos con `market`, o cuando el primero vale `0` (con un cero en la
   * base el porcentaje no significa nada). Dos extremos iguales **sí** devuelven
   * `{changeUsd: 0, changePercent: 0}`, porque "no se movió" es un dato.
   *
   * Con unos días de historia en `card_prices`, el caso común es `null`: el
   * gráfico se dibuja igual y el delta **no** se inventa. La misma regla que
   * aplica `price-delta.tsx` cuando no hay variación que mostrar.
   */
  change: PriceWindowChangeDto | null;
}

/* ─── Ubicación de una carta en las colecciones del usuario ─── */

/**
 * Dónde está esta carta en las colecciones del usuario.
 *
 * `GET /api/cards/:id/location`, **autenticado**. Antes de este endpoint, la
 * ficha de carta tenía que listar todas las colecciones del usuario en paralelo
 * y buscar el ítem por nombre en cada una: con 8 colecciones eran 8 requests
 * concurrentes en el montaje de la segunda pantalla más visitada.
 *
 * Devuelve `null` (y **no** 404) cuando la carta existe pero el usuario no la
 * tiene: "no la tenés" no es un error. El 404 queda reservado a "la carta no
 * existe".
 *
 * Cuando la carta está en más de una colección o bajo más de una variante,
 * devuelve **el ítem con más copias** (`quantity DESC`, con la principal y la
 * más antigua como desempates), no un array. Es la fila que va a abrir el
 * `ItemSheet`, y esa fila es la que el usuario quiere administrar.
 */
export interface CardLocationDto {
  collectionId: string;
  collectionName: string;
  /** Id del ítem, que es lo que necesita el `PATCH /items/:itemId`. */
  itemId: string;
  quantity: number;
  variant: CardVariant;
  condition: CardCondition;
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
  user: UserDto;
}

// ─── Colecciones ───
export interface PortfolioDto {
  totalCards: number;
  unpricedCards: number;
  valueUsd: number | null;
  history: { date: string; valueUsd: number | null; totalCards: number; unpricedCards: number }[];
  topCards: { cardId: string; name: string; imageSmall: string; setName: string; number: string;
    variant: string; quantity: number; marketUsd: number; valueUsd: number }[];
}

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

/** Carta visual seleccionada y sus precios; modelo de sesión del navegador. */
export interface RecognizedCard {
  card: CardDto;
  score: number;
  rawScore: number;
  price: PriceDto | null;
  prices?: PriceDto[];
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

export interface VisualIdentifyRequestDto {
  image: string;
}
export interface VisualIdentifyResponseDto {
  candidates: {
    card: CardDto;
    similarity: number;
    retrievalRank: number;
  }[];
  retrievalLimit: number;
  references: number;
  indexVersion: string;
  indexStale: boolean;
  collections: number;
  indexMs: number;
  cold: boolean;
  modelMs: number;
  inferenceMs: number;
  totalMs: number;
}
