import type { CardDto, SetCardsResponseDto, SetDto, SetProgressDto } from '@/types/api';
import { apiFetch } from './api-client';

/**
 * Cliente de los dos endpoints del progreso por set:
 * `GET /api/collections/:id/set-progress` y `GET /api/sets/:id/cards`.
 *
 * Los DTO de `types/api.ts` son el contrato real y están duplicados a mano con
 * los del backend en el mismo commit (`AGENTS.md` §1): `SetProgressDto` en
 * `collections.service.ts` y `SetCardsResponseDto` en `cards.service.ts`.
 *
 * ## Por qué acá hay guards y en los demás clientes no
 *
 * `apiFetch<T>` castea el body y el resto de `lib/api/` confía en eso. Estos dos
 * endpoints son los únicos donde el servidor puede devolver **200 con otra
 * forma** (un proxy que devuelve un objeto de error, o una versión del backend
 * que todavía no manda el campo), y la respuesta se usa para aritmética
 * (`owned / total`): un `undefined` ahí no da un error visible, da un
 * `NaN%` en pantalla. Por eso se valida la forma y se tira un error explícito
 * si no la tiene.
 */

/* ─── Guards ─── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Un entero no negativo, o `null`. Los conteos nunca son negativos ni fraccionarios. */
function count(value: unknown): number | null {
  const parsed = num(value);
  if (parsed === null || parsed < 0) return null;
  return Math.floor(parsed);
}

function parseSet(raw: unknown): SetDto | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    series: str(raw.series),
    printedTotal: count(raw.printedTotal),
    total: count(raw.total),
    releaseDate: str(raw.releaseDate),
    logoUrl: str(raw.logoUrl),
    symbolUrl: str(raw.symbolUrl),
  };
}

function parseCard(raw: unknown): CardDto | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  const setId = str(raw.setId);
  if (!id || !name || !setId) return null;
  return {
    id,
    name,
    supertype: str(raw.supertype) ?? 'Unknown',
    subtypes: Array.isArray(raw.subtypes)
      ? raw.subtypes.filter((item): item is string => typeof item === 'string')
      : [],
    hp: str(raw.hp),
    types: Array.isArray(raw.types)
      ? raw.types.filter((item): item is string => typeof item === 'string')
      : [],
    number: str(raw.number) ?? '—',
    rarity: str(raw.rarity),
    artist: str(raw.artist),
    setId,
    set: isRecord(raw.set) ? parseSet(raw.set) ?? undefined : undefined,
    imageSmall: str(raw.imageSmall) ?? '',
    imageLarge: str(raw.imageLarge) ?? '',
  };
}

/**
 * Una fila de `GET /collections/:id/set-progress`. `valueUsd` tolera `null` (un `SUM` sin `COALESCE` viene
 * `null` y es un número válido: cero); los conteos no toleran nada, porque sin
 * `owned` o `total` la fila no se puede dibujar.
 */
function parseSetProgress(raw: unknown): SetProgressDto | null {
  if (!isRecord(raw)) return null;
  const setId = str(raw.setId);
  const owned = count(raw.owned);
  const total = count(raw.total);
  if (!setId || owned === null || total === null) return null;

  return {
    setId,
    owned,
    total,
    valueUsd: num(raw.valueUsd) ?? 0,
    valueArs: num(raw.valueArs),
    missingCount: count(raw.missingCount) ?? Math.max(0, total - owned),
  };
}

class SetProgressContractError extends Error {
  constructor(what: string) {
    super(
      `El endpoint de ${what} respondió una forma que no coincide con el DTO de ` +
        '`types/api.ts`. Puede que el backend no mande el campo todavía.',
    );
    this.name = 'SetProgressContractError';
  }
}

/* ─── GET /api/collections/:id/set-progress ─── */

/**
 * El agregado por set de una colección.
 *
 * Devuelve el array pelado (no envuelto en `Paginated`): son, a lo sumo, los
 * sets en los que la colección tiene alguna carta, y `Paginated` implicaría
 * paginar algo que no lo necesita. `[]` si la colección está vacía.
 *
 * @param signal Cancela el fetch si el componente se desmonta. `apiFetch` lo
 * reenvía en el reintento post-refresh.
 */
export async function getSetProgress(
  collectionId: string,
  signal?: AbortSignal,
): Promise<SetProgressDto[]> {
  const raw: unknown = await apiFetch(
    `/collections/${encodeURIComponent(collectionId)}/set-progress`,
    signal ? { signal } : {},
  );

  if (!Array.isArray(raw)) throw new SetProgressContractError('set-progress');
  return raw.map(parseSetProgress).filter((row): row is SetProgressDto => row !== null);
}

/* ─── GET /api/sets/:id/cards ─── */

/**
 * La lista completa de un set, que es lo que necesita el binder.
 *
 * Sin paginación a propósito: el peor caso del catálogo son los sets de 300+
 * cartas (`swshp`, 304, son ~180 kB con el `set` embebido en cada carta), y son
 * una sola respuesta. Lo que no se puede es el N+1 de `/cards/:id` para traer
 * cada imagen o precio.
 *
 * Sigue siendo necesario `/collections/:id/items?setId=` al lado: esto devuelve
 * las cartas del **catálogo**, no las que tenés.
 */
export async function getSetCards(
  setId: string,
  signal?: AbortSignal,
): Promise<SetCardsResponseDto> {
  const raw: unknown = await apiFetch(
    `/sets/${encodeURIComponent(setId)}/cards`,
    signal ? { signal } : {},
  );

  if (!isRecord(raw)) throw new SetProgressContractError('sets/:id/cards');
  const set = parseSet(raw.set);
  if (!set || !Array.isArray(raw.cards)) throw new SetProgressContractError('sets/:id/cards');

  const cards = raw.cards
    .map(parseCard)
    .filter((card): card is CardDto => card !== null);

  return { set, cards, total: count(raw.total) ?? cards.length };
}
