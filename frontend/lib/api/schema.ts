import { CONDITION_OPTIONS, VARIANT_OPTIONS } from '@/lib/variants';
import type {
  CardCondition,
  CardDto,
  CardLocationDto,
  CardVariant,
  CollectionItemDto,
  CollectionStatsDto,
  PriceChangeDto,
  PriceDto,
  PriceHistoryDto,
  PriceHistoryPointDto,
  PriceWindowChangeDto,
  SetDto,
} from '@/types/api';

import type { PublicSharedCollection } from './share';

/**
 * Los guards del contrato: la única respuesta a "¿esto es un `CardDto`?".
 *
 * ## Por qué existe
 *
 * Los DTO del contrato están duplicados a mano con el backend (`AGENTS.md` §1),
 * así que el `as` de `apiFetch<T>` no compra nada: en runtime el body es
 * `unknown` y lo único que dice el tipo es qué nos gustaría que fuera. Cuando
 * tres pantallas necesitan la misma pregunta, la respuesta se copia, y las
 * las copias divergen: cada una acepta o rechaza un poco distinto y ninguna es
 * la correcta por construcción.
 *
 * ## Qué NO hace
 *
 * **No reescribe el contrato.** `CardDto`, `SetDto`, etc. viven en
 * `types/api.ts`, que es el espejo a mano de los DTO del backend. Acá solo se
 * leen esos tipos, nunca se redefinen: si acá se declarara un `CardDto` local,
 * el error de desincronización dejaría de ser visible.
 *
 * ## La regla que comparten todos los guards
 *
 * - **Obligatorio de verdad** (`CardDto.id`, `name`, `setId`; `PriceDto.variant`;
 *   las cantidades y los `boolean`): si no está o no tiene el tipo, el objeto
 *   se descarta. Un DTO con la identidad incompleta no se puede dibujar ni
 *   linkear, y completar la clave primaria con un default inventa datos.
 * - **Opcional del contrato**: si falta, se completa con el default que ya usan
 *   las pantallas (`'Unknown'`, `'—'`, `''`, `[]`, `null`). Tirar la carta
 *   entera porque le falta el `artist` es peor que mostrarla sin artista.
 *
 * Los guards **devuelven `null`, no tiran**. Quien compone decide qué hacer con
 * un `null`: la ficha de carta lo trata como 404, el mock decorativo como lista
 * vacía y la colección compartida como error con reintento.
 */

/* ─── Lectores ─── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Un string con algo adentro, o `null`. Un `''` no es un dato. */
function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Un número finito, o `null`. El `NaN` y el `Infinity` no vienen del contrato. */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Filtra los strings y descarta el resto: un array con un `null` adentro no es un DTO roto. */
function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/**
 * Mapas de string a unión, construidos desde la fuente única de labels
 * (`lib/variants.ts`, §9.5). Un `Set<string>` no alcanza: `Set.has()` devuelve
 * `boolean` y no refine el tipo, así que terminaría faltando un `as`. Con el
 * `Map` el refinamiento sale solo del `get` tipado, y la lista de variantes no
 * está escrita dos veces.
 */
const VARIANT_VALUES = new Map<string, CardVariant>(
  VARIANT_OPTIONS.map((option): [string, CardVariant] => [option.value, option.value]),
);
const CONDITION_VALUES = new Map<string, CardCondition>(
  CONDITION_OPTIONS.map((option): [string, CardCondition] => [option.value, option.value]),
);

function toVariant(value: unknown): CardVariant | null {
  return typeof value === 'string' ? (VARIANT_VALUES.get(value) ?? null) : null;
}

function toCondition(value: unknown): CardCondition | null {
  return typeof value === 'string' ? (CONDITION_VALUES.get(value) ?? null) : null;
}

/**
 * `PriceChangeDto` o `null` (B10).
 *
 * Un delta incompleto se descarta entero, igual que una carta sin `id`: el
 * `PriceDelta` pinta `changeUsd` y `changePercent` como si fueran verdad, así
 * que un `{ percent: NaN }` a medio camino se ve como "bajó 0 %", que es un
 * dato falso. Ausente y `null` significan cosas distintas y se preservan:
 * ausente = "este endpoint no calcula delta", `null` = "se calculó y no hay".
 */
function toPriceChange(raw: unknown): PriceChangeDto | null | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) return null;

  const usd = num(raw.usd);
  const percent = num(raw.percent);
  const windowDays = num(raw.windowDays);
  const from = str(raw.from);
  if (usd === null || percent === null || windowDays === null || !from) return null;

  return { usd, percent, windowDays, from };
}

/**
 * El delta **plano** de `PriceDto` (`changeUsd` / `changePercent` /
 * `windowLabel`), o `undefined` si el endpoint no lo manda.
 *
 * Los tres van juntos o no van, así que se preservan como bloque y se devuelve
 * `undefined` si falta cualquiera: un `changePercent` sin `changeUsd` haría que
 * el `PriceDelta` eligiera el porcentaje como referencia de signo y pinte una
 * caída donde no la hubo.
 *
 * El `null` explícito se conserva (se ve "se calculó y no hay nada que decir"),
 * igual que en `toPriceChange`. La diferencia es que acá los tres campos son
 * `number | null` sueltos y no un objeto.
 */
function toFlatPriceChange(raw: Record<string, unknown>): {
  changeUsd: number | null;
  changePercent: number | null;
  windowLabel: string | null;
} {
  const changeUsd = num(raw.changeUsd);
  const changePercent = num(raw.changePercent);
  const windowLabel = str(raw.windowLabel);
  if (changeUsd === null || changePercent === null) {
    return { changeUsd: null, changePercent: null, windowLabel: null };
  }
  return { changeUsd, changePercent, windowLabel };
}

/* ─── Set ─── */

/**
 * `SetDto` o `null`.
 *
 * Sin `set` hay una mitad de la app que se rompe: el link "ver el set" de la
 * ficha y el título del binder salen del `set.name`. Un set sin nombre no se
 * puede mostrar.
 */
export function toSetDto(raw: unknown): SetDto | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    series: str(raw.series),
    printedTotal: num(raw.printedTotal),
    total: num(raw.total),
    releaseDate: str(raw.releaseDate),
    logoUrl: str(raw.logoUrl),
    symbolUrl: str(raw.symbolUrl),
  };
}

/* ─── Carta ─── */

/**
 * `CardDto` o `null`. El guard canónico: lo usan la ficha, el catálogo, el
 * scroller de "otras de este set" y el mock de la home.
 *
 * `id`, `name` y `setId` son los tres campos sin default. `setId` en
 * particular no se completa con el `id` de la carta (que fue lo que hacía el
 * mock de la home): un link a `/buscar?setId=<id de carta>` abre un catálogo
 * vacío sin avisar, que es peor que no mostrar la carta.
 *
 * El `supertype` del contrato es un string, no un enum: la fuente manda
 * `Pokemon`, `Trainer`, `Energy` o `Unknown`.
 */
export function toCardDto(raw: unknown): CardDto | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  const setId = str(raw.setId);
  if (!id || !name || !setId) return null;

  return {
    id,
    name,
    supertype: str(raw.supertype) ?? 'Unknown',
    subtypes: strArray(raw.subtypes),
    hp: str(raw.hp),
    types: strArray(raw.types),
    number: str(raw.number) ?? '—',
    rarity: str(raw.rarity),
    artist: str(raw.artist),
    setId,
    set: toSetDto(raw.set) ?? undefined,
    imageSmall: str(raw.imageSmall) ?? '',
    imageLarge: str(raw.imageLarge) ?? '',
  };
}

/** `toCardDto` sobre la página de `GET /cards/search`: descarta las que no cierran. */
export function toCardList(raw: unknown): CardDto[] {
  if (!isRecord(raw) || !Array.isArray(raw.data)) return [];
  return raw.data.map(toCardDto).filter((card): card is CardDto => card !== null);
}

/* ─── Precios ─── */

/**
 * `PriceDto` o `null`.
 *
 * La única variante de `CardVariant` que el backend puede mandar y que
 * `lib/variants.ts` no conoce es una fila corrupta, no un precio: sin `variant`
 * la fila no se puede ubicar en la tabla de precios, así que se descarta
 * entera en vez de dibujarla con `variant: 'normal'` inventado.
 *
 * `currency`, `source` y `fetchedAt` son defaults porque ningún componente de
 * precio los lee para calcular: el cálculo es siempre USD y la conversión la
 * hace el cliente (`useCurrency`, §9.3).
 */
export function toPriceDto(raw: unknown): PriceDto | null {
  if (!isRecord(raw)) return null;
  const variant = toVariant(raw.variant);
  if (!variant) return null;

  return {
    cardId: str(raw.cardId) ?? '',
    variant,
    low: num(raw.low),
    mid: num(raw.mid),
    high: num(raw.high),
    market: num(raw.market),
    provider: str(raw.provider),
    isStale: raw.isStale === true,
    currency: str(raw.currency) ?? 'USD',
    source: str(raw.source) ?? '—',
    fetchedAt: str(raw.fetchedAt) ?? '',
    priceArs: num(raw.priceArs),
    // Se conserva la distinción ausente/`null`: solo `GET /cards/:id/prices`
    // manda el campo, y el `PriceDelta` necesita saber si no vino o vino vacío.
    change: toPriceChange(raw.change),
    // Los tres planos. Se leen **después** de haber validado la variante: una
    // fila corrupta se descarta entera más arriba, así que acá no hay que
    // decidir qué hacer con un delta de una fila que no existe.
    ...toFlatPriceChange(raw),
  };
}

/* ─── Histórico de precios ─── */

/** `PriceHistoryPointDto` o `null`: un punto sin `date` no se puede ubicar. */
function toPriceHistoryPoint(raw: unknown): PriceHistoryPointDto | null {
  if (!isRecord(raw)) return null;
  const date = str(raw.date);
  if (!date) return null;

  return {
    date,
    // `fetchedAt` real de la fila elegida para ese día. Default a la fecha del
    // punto: el backend siempre lo manda, y un ISO inválido es peor que
    // devolver el día, que al menos sigue siendo la etiqueta del eje.
    fetchedAt: str(raw.fetchedAt) ?? date,
    market: num(raw.market),
    low: num(raw.low),
    mid: num(raw.mid),
    high: num(raw.high),
  };
}

/**
 * `PriceHistoryDto` o `null`, para `GET /cards/:id/prices/history`.
 *
 * ## Por qué es "todo o nada" y por qué no lo es para los puntos
 *
 * El envelope sin `cardId` no se puede ni dibujar ni volver a pedir: se
 * descarta entero. Un **punto** sin `date` sí se puede descartar individual: son
 * filas de una serie y perder una no deja la serie sin sentido (salvo que se
 * pierda la primera o la última, y para eso están `from` y `to`, que son
 * datos del envelope y se calculan aparte).
 *
 * `change: null` se preserva tal cual. Es la respuesta que el backend da cuando
 * no hay con qué comparar, y es lo que hace que el `Sparkline` muestre la serie
 * **sin** delta en lugar de inventar un 0 %.
 */
export function toPriceHistory(raw: unknown): PriceHistoryDto | null {
  if (!isRecord(raw)) return null;
  const cardId = str(raw.cardId);
  if (!cardId) return null;

  const points: PriceHistoryPointDto[] = [];
  for (const entry of Array.isArray(raw.points) ? raw.points : []) {
    const point = toPriceHistoryPoint(entry);
    if (point) points.push(point);
  }

  const windowDays = num(raw.windowDays);

  /*
   * El delta del envelope. Los dos números van juntos o no hay nada: un
   * `changePercent` sin `changeUsd` haría que el `PriceDelta` usara el
   * porcentaje como signo de referencia, que es un camino que no existe.
   *
   * Y `null` se queda en `null`. Es la respuesta del backend cuando hay un solo
   * punto con precio o el primero vale 0, y es exactamente lo que el
   * `Sparkline` necesita para **no** pintar una variación que no se puede
   * calcular (ver `PriceHistoryDto.change` en `types/api.ts`).
   */
  let change: PriceWindowChangeDto | null = null;
  if (isRecord(raw.change)) {
    const changeUsd = num(raw.change.changeUsd);
    const changePercent = num(raw.change.changePercent);
    if (changeUsd !== null && changePercent !== null) change = { changeUsd, changePercent };
  }

  return {
    cardId,
    provider: str(raw.provider),
    source: str(raw.source) ?? '—',
    variant: toVariant(raw.variant),
    currency: str(raw.currency) ?? 'USD',
    windowDays: windowDays === null ? 30 : windowDays,
    from: str(raw.from),
    to: str(raw.to),
    points,
    change,
  };
}

/** `toPriceDto` sobre el envelope de `GET /cards/:id/prices` (`{ card, prices }`). */
export function toPriceList(raw: unknown): PriceDto[] {
  if (!isRecord(raw) || !Array.isArray(raw.prices)) return [];
  return raw.prices.map(toPriceDto).filter((price): price is PriceDto => price !== null);
}

/* ─── Colecciones ─── */

/** `CollectionItemDto` o `null`. */
export function toCollectionItemDto(raw: unknown): CollectionItemDto | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const collectionId = str(raw.collectionId);
  const card = toCardDto(raw.card);
  const variant = toVariant(raw.variant);
  const condition = toCondition(raw.condition);
  const quantity = num(raw.quantity);
  const isForTrade = raw.isForTrade;
  const addedAt = str(raw.addedAt);
  if (
    !id ||
    !collectionId ||
    !card ||
    !variant ||
    !condition ||
    quantity === null ||
    typeof isForTrade !== 'boolean' ||
    !addedAt
  ) {
    return null;
  }

  return {
    id,
    collectionId,
    card,
    variant,
    condition,
    quantity,
    isForTrade,
    notes: str(raw.notes),
    addedAt,
    price: raw.price === undefined ? null : toPriceDto(raw.price),
  };
}

/**
 * `CardLocationDto` o `null`, para `GET /cards/:id/location`.
 *
 * ## Por qué el `null` del envelope y el del guard son el mismo valor
 *
 * El endpoint responde `null` cuando la carta existe y el usuario no la tiene,
 * y eso **no es un error**. El guard devuelve `null` para los dos casos —"no la
 * tenés" y "la respuesta no se puede leer"— porque para la ficha de carta son
 * la misma situación de pantalla: no hay ítem que administrar y no hay nada que
 * mostrar. La diferencia real (404 = la carta no existe) llega como `ApiError`
 * antes de que el guard se ejecute.
 *
 * La alternativa —un tipo `{ found: false } | { found: true, … }`— obligaría a
 * que cada call site desarmara un caso que no cambia nada en pantalla. La regla
 * del módulo es que el guard devuelve `null` y quien compone decide, y acá
 * quien compone tiene una sola decisión que tomar.
 *
 * `itemId` es el campo obligatorio de verdad: sin él no hay `PATCH /items/:id`
 * que pueda hacer el toggle de intercambio ni abrir el `ItemSheet`.
 */
export function toCardLocation(raw: unknown): CardLocationDto | null {
  if (!isRecord(raw)) return null;
  const collectionId = str(raw.collectionId);
  const itemId = str(raw.itemId);
  const quantity = num(raw.quantity);
  const variant = toVariant(raw.variant);
  const condition = toCondition(raw.condition);
  if (!collectionId || !itemId || quantity === null || !variant || !condition) return null;

  return {
    collectionId,
    // El nombre de la colección va en la descripción de la `StatRow`; si
    // faltara, sale "—" en vez de perder el ítem entero.
    collectionName: str(raw.collectionName) ?? '—',
    itemId,
    quantity,
    variant,
    condition,
  };
}

/** `CollectionStatsDto` o `null`. */
export function toCollectionStatsDto(raw: unknown): CollectionStatsDto | null {
  if (!isRecord(raw)) return null;
  const totalCards = num(raw.totalCards);
  const uniqueCards = num(raw.uniqueCards);
  const duplicateCards = num(raw.duplicateCards);
  const setsCount = num(raw.setsCount);
  const totalValueUsd = num(raw.totalValueUsd);
  if (
    totalCards === null ||
    uniqueCards === null ||
    duplicateCards === null ||
    setsCount === null ||
    totalValueUsd === null
  ) {
    return null;
  }

  return {
    totalCards,
    uniqueCards,
    duplicateCards,
    setsCount,
    totalValueUsd,
    // El espejo en pesos es opcional: el valor crudo siempre es USD y lo
    // convierte el cliente (§9.3). Ausente es lo mismo que `null`.
    totalValueArs: num(raw.totalValueArs),
  };
}

/* ─── Colección pública compartida ─── */

/**
 * `PublicSharedCollection` o `null`, para `GET /s/:slug`.
 *
 * ## Por qué esto es todo o nada
 *
 * La versión anterior hacía `(await response.json()) as PublicSharedCollection`: un
 * `fetch` a mano devuelve `any`, el `as` le decía al compilador que era un DTO
 * y listo. `as` no valida nada — solo silencia al compilador— así que un backend
 * que cambiara un campo o un proxy que devolviera HTML de error aparecían en
 * pantalla como `undefined` en un `<h1>`, o como un crash de React.
 *
 * Si un solo item de los 500 viniera mal no se muestran 499 y se dice "500": la
 * colección es del usuario, y un conteo mentiroso es peor que un error con
 * botón de reintentar.
 */
export function toPublicSharedCollection(raw: unknown): PublicSharedCollection | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null;

  const ownerDisplayName = str(raw.ownerDisplayName);
  const collectionName = str(raw.collectionName);
  const stats = toCollectionStatsDto(raw.stats);
  const truncated = raw.truncated;
  const sharedAt = str(raw.sharedAt);
  if (!ownerDisplayName || !collectionName || !stats || !sharedAt) return null;
  if (typeof truncated !== 'boolean') return null;

  const items: CollectionItemDto[] = [];
  for (const entry of raw.items) {
    const item = toCollectionItemDto(entry);
    if (!item) return null;
    items.push(item);
  }

  return { ownerDisplayName, collectionName, items, stats, truncated, sharedAt };
}
