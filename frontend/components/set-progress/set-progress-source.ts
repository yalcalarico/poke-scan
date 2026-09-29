import { getSets } from '@/lib/api';
import { getStats, listItems, type CollectionStatsResponse } from '@/lib/api/collections';
import { getSetCards, getSetProgress } from '@/lib/api/set-progress';
import type {
  CardDto,
  CollectionItemDto,
  SetCardsResponseDto,
  SetDto,
  SetProgressDto,
} from '@/types/api';

/**
 * De dónde salen los datos del progreso por set.
 *
 * ## Los dos endpoints
 *
 * | | Endpoint | Para qué |
 * |---|---|---|
 * | `set-progress` | `GET /api/collections/:id/set-progress` | el agregado por set (Vista 1) |
 * | `sets/:id/cards` | `GET /api/sets/:id/cards` | la lista completa de un set (Vista 2) |
 *
 * `set-progress` es un `$queryRaw` con `DISTINCT ON` que devuelve el agregado en
 * un solo request; `sets/:id/cards` evita las 3 páginas de
 * `/cards/search?setId=` que necesita el binder con un set de 300 cartas.
 *
 * ## Por qué este archivo todavía existe
 *
 * Porque **el binder necesita los items y no los puede pedir a `sets/:id/cards`**:
 * ese endpoint devuelve las cartas del set del catálogo, y para saber cuáles de
 * esas cartas tenés y cuántas copias hace falta
 * `/collections/:id/items?setId=`. Y los totales de la colección (para la
 * cabecera) siguen viniendo de `/collections/:id/stats`, que `set-progress` no
 * reemplaza. O sea: el archivo solo junta las tres requests que la pantalla
 * necesita y arma el snapshot.
 */

export type SetProgressSourceId = 'api';

/** Los totales de la colección. Vienen de `/collections/:id/stats`, que ya existe. */
export interface SetProgressStats {
  totalCards: number;
  uniqueCards: number;
  duplicateCards: number;
  setsCount: number;
  totalValueUsd: number;
  /** Cartas de la colección sin ninguna fila en `card_prices`. */
  cardsMissingPrice: number;
}

/**
 * Una fila de la Vista 1: el agregado de un set, ya juntado con los metadatos
 * del set (nombre, símbolo y logo).
 *
 * El join se hace **en el cliente** y no en el endpoint, a propósito: `GET
 * /api/sets` ya devuelve los 176 sets con `name`, `symbolUrl` y `logoUrl` en
 * una sola request, así que `set-progress` puede seguir siendo un único
 * `$queryRaw` de
 * números sin duplicar el `SetDto` en un cuarto endpoint.
 */
export interface SetProgressEntry {
  setId: string;
  /** `null` cuando el `setId` de un item no resuelve en `/api/sets`. */
  set: SetDto | null;
  /** Cartas **únicas** del set que tenés. */
  owned: number;
  /**
   * `null` = denominador desconocido: se muestra `—` y no se calcula porcentaje.
   *
   * `set-progress` manda `total: 0` cuando `card_sets.total` y `printedTotal`
   * son los dos `NULL` (no inventa un `COUNT(cards)`), y `toEntry` traduce ese
   * `0` a `null` con la misma regla que usaba el `SetDto`: un 0 real no puede ser un set de
   * cero cartas.
   */
  total: number | null;
  valueUsd: number;
  /** `total - owned` recortado en 0, o `null` si no hay denominador. */
  missingCount: number | null;
}

export interface SetProgressSnapshot {
  source: SetProgressSourceId;
  /** Todas las filas: las que tienen cartas y las sugeridas. Ya ordenadas. */
  entries: SetProgressEntry[];
  stats: SetProgressStats;
  /**
   * Cuántos sets quedaron sin denominador conocido. Es el "estado parcial" de
   * §9.1 #4: no es un error, pero la pantalla tiene que decirlo, porque el
   * porcentaje de esos sets no se puede calcular.
   */
  setsWithoutTotal: number;
  /**
   * Sets cuyo `setId` no aparece en `/api/sets`. No debería existir (hay
   * foreign key), pero si aparece se muestra igual, con el `setId` como título,
   * en vez de esconder una fila que el usuario tiene en su colección.
   */
  orphanSets: number;
  /**
   * Suma de las faltantes de **todos** los sets con denominador conocido, sea
   * que los tengas o no. Es el único número de la pantalla que ningún otro
   * endpoint puede dar: ni `/stats` (que solo mira los items) ni `GET /sets`
   * (que no sabe qué tenés).
   */
  missingTotal: number;
}

/** Un slot del binder: la carta del set y, si la tenés, tu item. */
export interface BinderSlot {
  card: CardDto;
  /** El item que se abre al tocar el slot, o `null` si no lo tenés. */
  item: CollectionItemDto | null;
  /** Suma de las cantidades de **todos** los items de esa carta. */
  quantity: number;
  /** `true` si esa carta tiene más de una copia (o más de un item). */
  isDuplicate: boolean;
}

export interface BinderSnapshot {
  setId: string;
  set: SetDto | null;
  /** Todas las cartas del set, ordenadas por número. */
  cards: CardDto[];
  /** Los items de la colección que pertenecen a este set. */
  items: CollectionItemDto[];
  /** El conteo real de cartas del set (`cards.length`). */
  total: number;
  valueUsd: number;
  missingCount: number;
  /** Cartas con más de una copia. */
  duplicateCards: number;
}

export interface SetProgressSource {
  readonly id: SetProgressSourceId;
  getProgress(collectionId: string, signal: AbortSignal): Promise<SetProgressSnapshot>;
  getBinder(collectionId: string, setId: string, signal: AbortSignal): Promise<BinderSnapshot>;
}

/* ─── Paginación de los endpoints que sí existen ─── */

/** Máximo de `pageSize` de `ListItemsDto`. */
const ITEMS_PAGE_SIZE = 200;
/**
 * Tope de páginas por request encadenado.
 *
 * 20 páginas son 4.000 items. No es un caso real hoy, pero sin tope un bug del
 * backend que devuelva `totalPages: Infinity` se come la API del usuario entero.
 * A las 20 cortamos con un error explícito en vez de seguir asking.
 */
const MAX_PAGES = 20;

/**
 * Todos los items de una colección, opcionalmente acotados a un set.
 *
 * El binder los necesita en los dos casos: `sets/:id/cards` trae las cartas del
 * catálogo y `set-progress` solo los números, así que la única forma de saber
 * **qué** carta de cada
 * slot tenés y cuántas copias tiene es `/collections/:id/items?setId=`.
 */
async function loadCollectionItems(
  collectionId: string,
  setId: string | null,
): Promise<CollectionItemDto[]> {
  const items: CollectionItemDto[] = [];
  let page = 1;

  for (;;) {
    const result = await listItems(collectionId, {
      setId: setId ?? undefined,
      page,
      pageSize: ITEMS_PAGE_SIZE,
    });
    items.push(...result.data);
    if (result.data.length === 0) break;
    if (page >= result.totalPages) break;
    if (page >= MAX_PAGES) {
      throw new Error(
        `La colección tiene más de ${MAX_PAGES * ITEMS_PAGE_SIZE} cartas únicas y el paginado se cortó.`,
      );
    }
    page += 1;
  }

  return items;
}

function toStats(response: CollectionStatsResponse): SetProgressStats {
  return {
    totalCards: response.totalCards,
    uniqueCards: response.uniqueCards,
    duplicateCards: response.duplicateCards,
    setsCount: response.setsCount,
    totalValueUsd: response.totalValueUsd,
    cardsMissingPrice: response.cardsMissingPrice ?? 0,
  };
}

/**
 * El denominador de un set.
 *
 * `card_sets.total` es el número de la fuente y `printedTotal` el impreso: no
 * son lo mismo, y el primero es el que usa el resto de la app. Va `total`
 * primero y `printedTotal` de segundo, que es el orden de `/carta/[id]`.
 *
 * `null` cuando la fuente no declara ninguno, o cuando es 0: se muestra `—`
 * (§9.2) y la fila cuenta como parcial, en vez de mentir con un 0 % o con un
 * 100 %.
 */
function denominatorOf(set: SetDto | null): number | null {
  if (!set) return null;
  const total = set.total ?? set.printedTotal;
  if (total === null || !Number.isFinite(total) || total <= 0) return null;
  return total;
}

/* ─── Funciones puras (sin red) ─── */

/** El porcentaje de un set, o `null` si no hay denominador para calcularlo. */
export function progressPercent(entry: SetProgressEntry): number | null {
  if (entry.total === null || entry.total <= 0) return null;
  return Math.min(100, Math.max(0, (entry.owned / entry.total) * 100));
}

/**
 * El orden de la Vista 1. El criterio exacto, en este orden:
 *
 * 1. **Valor en USD, de más a menos.** Es la pantalla del dinero (§2.3:
 *    `positive` es plata) y el set donde ya tenés capital es el que más duele a
 *    medias.
 * 2. **Porcentaje, de más a menos.** Entre dos sets del mismo valor, el que
 *    está más cerca de completarse es el que sale más barato: faltan 2 cartas
 *    en vez de 40.
 * 3. **Faltantes, de menos a menos.** Desempata los dos anteriores y además hace
 *    el orden **total**: sin él, dos sets con 0 valor y 0 % dependerían del
 *    orden de llegada y se cambiarían de posición entre renders, que se ve
 *    como un salto bajo el dedo del usuario.
 * 4. **Nombre y `setId`.** Solo para que el orden sea determinista y no dependa
 *    de cómo llegó la respuesta.
 *
 * Los sets sin denominador (`total === null`) van **al final**: no se pueden
 * ordenar por porcentaje, y ponerlos al principio sería afirmar que un set sin
 * datos es el más caro del mundo.
 */
export function sortSetProgress(entries: readonly SetProgressEntry[]): SetProgressEntry[] {
  return [...entries].sort((a, b) => {
    if (a.total === null && b.total !== null) return 1;
    if (b.total === null && a.total !== null) return -1;

    if (b.valueUsd !== a.valueUsd) return b.valueUsd - a.valueUsd;

    const percentA = progressPercent(a) ?? -1;
    const percentB = progressPercent(b) ?? -1;
    if (percentB !== percentA) return percentB - percentA;

    const missingA = a.missingCount ?? Number.POSITIVE_INFINITY;
    const missingB = b.missingCount ?? Number.POSITIVE_INFINITY;
    if (missingA !== missingB) return missingA - missingB;

    const nameA = a.set?.name ?? a.setId;
    const nameB = b.set?.name ?? b.setId;
    return nameA.localeCompare(nameB, 'es') || a.setId.localeCompare(b.setId);
  });
}

export interface PartitionedSetProgress {
  /** Sets con al menos una carta. Es la sección que importa. */
  started: SetProgressEntry[];
  /** Sets con 0 cartas, para "Empezá por acá". */
  suggested: SetProgressEntry[];
}

/**
 * Parte la lista en las dos secciones de la Vista 1.
 *
 * Las sugerencias se ordenan al revés: primero la más cerca de completarse
 * (`missingCount` asc, después el denominador asc). Es lo que vuelve accionable
 * a la sección en vez de dejarla como una lista de 176 metas igual de lejanas.
 * Con el orden por valor de arriba, los sets vacíos (que valen 0) caen todos
 * juntos al final sin ningún criterio, y esa es exactamente la lista gris que
 * el diseño quiere evitar.
 */
export function partitionSetProgress(
  entries: readonly SetProgressEntry[],
): PartitionedSetProgress {
  const started: SetProgressEntry[] = [];
  const suggested: SetProgressEntry[] = [];

  for (const entry of entries) {
    if (entry.owned > 0) started.push(entry);
    else suggested.push(entry);
  }

  suggested.sort((a, b) => {
    const missingA = a.missingCount ?? Number.POSITIVE_INFINITY;
    const missingB = b.missingCount ?? Number.POSITIVE_INFINITY;
    if (missingA !== missingB) return missingA - missingB;
    const totalA = a.total ?? Number.POSITIVE_INFINITY;
    const totalB = b.total ?? Number.POSITIVE_INFINITY;
    if (totalA !== totalB) return totalA - totalB;
    const nameA = a.set?.name ?? a.setId;
    const nameB = b.set?.name ?? b.setId;
    return nameA.localeCompare(nameB, 'es') || a.setId.localeCompare(b.setId);
  });

  return { started, suggested };
}

const NUMBER_CHUNKS = /(\d+)/g;

function isNumericChunk(chunk: string): boolean {
  return chunk.length > 0 && /^\d+$/.test(chunk);
}

/**
 * Orden natural de números de carta.
 *
 * `CardDto.number` es un string: `"4"`, `"25"`, `"102"`, `"TM01"`, `"GG01"`,
 * `"4a"`. Un `localeCompare` con números pone `"10"` antes que `"4"`, y en un
 * binder eso es directamente incorrecto: los slots tienen que ir en el orden en
 * que se imprimen.
 *
 * Se comparan los trozos de izquierda a derecha: los numéricos como número y
 * los textuales como texto. Cuando se mezclan, **el numérico va primero**: en un
 * set, la corrida principal son números y las promos (`TM01`, `SV01`) se
 * imprimen al final, así que `"102"` tiene que ir antes que `"TM01"`.
 */
export function compareCardNumbers(a: string, b: string): number {
  const left = a.trim().split(NUMBER_CHUNKS).filter((chunk) => chunk !== '');
  const right = b.trim().split(NUMBER_CHUNKS).filter((chunk) => chunk !== '');

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const chunkA = left[index] ?? '';
    const chunkB = right[index] ?? '';

    const numericA = isNumericChunk(chunkA);
    const numericB = isNumericChunk(chunkB);
    if (numericA && numericB) {
      const diff = Number.parseInt(chunkA, 10) - Number.parseInt(chunkB, 10);
      if (diff !== 0) return diff;
      continue;
    }
    if (numericA !== numericB) return numericA ? -1 : 1;

    const textDiff = chunkA.localeCompare(chunkB, 'es');
    if (textDiff !== 0) return textDiff;
  }

  return 0;
}

/**
 * Cruza las cartas del set con los items de la colección y arma los slots.
 *
 * Un slot por **carta** y no por item: la misma carta puede tener dos items
 * (variante y condición distintas) y en el binder es un slot con dos copias. El
 * item que se abre al tocar el slot es el de mayor cantidad y, a empate, el
 * primero: el que el usuario probablemente está por tocar.
 */
export function buildBinderSlots(
  cards: readonly CardDto[],
  items: readonly CollectionItemDto[],
): BinderSlot[] {
  const byCard = new Map<string, CollectionItemDto[]>();
  for (const item of items) {
    const list = byCard.get(item.card.id);
    if (list) list.push(item);
    else byCard.set(item.card.id, [item]);
  }

  return cards
    .map((card): BinderSlot => {
      const cardItems = byCard.get(card.id) ?? [];
      let quantity = 0;
      let main: CollectionItemDto | null = null;
      for (const item of cardItems) {
        quantity += item.quantity;
        if (!main || item.quantity > main.quantity) main = item;
      }
      return { card, item: main, quantity, isDuplicate: quantity > 1 || cardItems.length > 1 };
    })
    .sort(
      (a, b) =>
        compareCardNumbers(a.card.number, b.card.number) || a.card.id.localeCompare(b.card.id),
    );
}

function toEntry(
  setId: string,
  set: SetDto | null,
  owned: number,
  valueUsd: number,
  /** El denominador de `set-progress`. `0` significa "la fuente no lo declara". */
  backendTotal: number,
): SetProgressEntry {
  // El denominador que manda es el de `set-progress` (sale de `card_sets`), no el
  // `SetDto.total` que viene textualmente de la fuente. Cuando `set-progress` dice
  // 0 se cae al `SetDto` para no perder un dato: puede ser un set sin `total` en
  // `card_sets` pero con `printedTotal` en el `SetDto`, o al revés.
  const declared = backendTotal > 0 ? backendTotal : denominatorOf(set);
  return {
    setId,
    set,
    owned,
    total: declared,
    valueUsd,
    missingCount: declared === null ? null : Math.max(0, declared - owned),
  };
}

/* ─── La implementación ─── */

/**
 * Corta antes de gastar requests si la pantalla ya se desmontó.
 *
 * `getSets` y `loadCollectionItems` (que van por `/collections/:id/items`) no
 * aceptan `AbortSignal`, así que no se pueden abortar una vez emitidos; lo que
 * sí se puede es no emitirlos. El `AbortError` lo ignora `useAsync` (es una
 * corrida vieja, no un error de pantalla).
 */
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('La pantalla se cerró antes de pedir los datos.', 'AbortError');
}

/**
 * `set-progress` + `sets/:id/cards`. Tres requests: el agregado, los 176 sets
 * (para el nombre y el símbolo) y los totales de la colección.
 *
 * El re-ordenado local por `sortSetProgress` no es redundante con el `ORDER BY`
 * de `set-progress`: el del backend es el contrato del endpoint y el del cliente
 * mete los sets sin denominador al final mirando `total === null`, que el SQL no
 * puede ver (allá `total` ya viene recortado a `0`).
 */
const API_SET_PROGRESS_SOURCE: SetProgressSource = {
  id: 'api',

  async getProgress(collectionId, signal) {
    throwIfAborted(signal);
    const [rows, sets, statsResponse] = await Promise.all([
      getSetProgress(collectionId, signal),
      getSets(),
      getStats(collectionId),
    ]);

    const byId = new Map(sets.map((set) => [set.id, set]));
    const entries = rows.map((row: SetProgressDto) =>
      // `row.total` es el denominador que calculó el backend y manda sobre el
      // `SetDto.total`, que viene textualmente de la fuente. `valueArs` no se
      // mapea: el valor crudo es siempre USD y la conversión la hace el cliente
      // con `useCurrency().formatMoney` (§9.3).
      toEntry(row.setId, byId.get(row.setId) ?? null, row.owned, row.valueUsd, row.total),
    );

    return summarize('api', entries, toStats(statsResponse));
  },

  async getBinder(collectionId, setId, signal) {
    throwIfAborted(signal);
    const [response, items] = await Promise.all([
      getSetCards(setId, signal),
      loadCollectionItems(collectionId, setId),
    ]);
    return buildBinderSnapshot(response, items);
  },
};

function buildBinderSnapshot(
  response: SetCardsResponseDto,
  items: readonly CollectionItemDto[],
): BinderSnapshot {
  const total = response.total > 0 ? response.total : response.cards.length;
  let valueUsd = 0;
  for (const item of items) {
    valueUsd += (item.price?.market ?? 0) * item.quantity;
  }

  const slots = buildBinderSlots(response.cards, items);
  const owned = slots.reduce((count, slot) => count + (slot.item ? 1 : 0), 0);
  const duplicateCards = slots.filter((slot) => slot.isDuplicate).length;

  return {
    setId: response.set.id,
    set: response.set.name === '' ? null : response.set,
    cards: response.cards,
    items: [...items],
    total,
    valueUsd,
    missingCount: Math.max(0, total - owned),
    duplicateCards,
  };
}

function summarize(
  source: SetProgressSourceId,
  entries: SetProgressEntry[],
  stats: SetProgressStats,
): SetProgressSnapshot {
  let setsWithoutTotal = 0;
  let orphanSets = 0;
  let missingTotal = 0;
  for (const entry of entries) {
    if (entry.total === null) {
      setsWithoutTotal += 1;
    } else {
      missingTotal += entry.missingCount ?? 0;
    }
    if (entry.set === null) orphanSets += 1;
  }

  return {
    source,
    entries: sortSetProgress(entries),
    stats,
    setsWithoutTotal,
    orphanSets,
    missingTotal,
  };
}

/**
 * La fuente que usa la pantalla. Antes elegía entre 'api' y 'fallback' con una
 * constante; con el fallback eliminado queda una sola fuente y elegir sería un
 * no-op. El nombre de la constante se conserva para que los hooks y las
 * pantallas no tengan que cambiar.
 */
export const SET_PROGRESS_SOURCE: SetProgressSource = API_SET_PROGRESS_SOURCE;
