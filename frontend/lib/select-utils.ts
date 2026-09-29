/**
 * Funciones puras del `Select` (docs/design-system.md §8.3).
 *
 * Viven acá y no adentro del componente por dos razones concretas:
 *
 * 1. Se testean sin jsdom. `vitest.config.ts` corre en `environment: 'node'` y
 *    solo incluye los `.test.ts` de `lib/`, así que una función dentro de un
 *    `'use client'` no tiene dónde testearse.
 * 2. El filtro corre sobre 176 opciones en cada tecla del buscador. Si fuera
 *    código del componente, la única forma de probarlo sería renderizando el
 *    componente entero.
 */

/** La forma mínima que el `Select` necesita de una opción. El componente agrega `icon`. */
export interface SelectOptionLike {
  value: string;
  label: string;
  disabled?: boolean;
}

const DIACRITICS = /\p{Diacritic}/gu;
const WHITESPACE = /\s+/g;

/**
 * Sin tildes, en minúsculas y sin espacios doubles.
 *
 * El NFD + borrado de diacríticos es lo que hace que "pikachu" encuentre
 * "Pikachu" y que "Gengar" encuentre "Gengar ex" (y al revés). Es el motivo por
 * el que la búsqueda de este componente no puede ser un `label.includes()`
 * pelado: la mitad de las etiquetas de la app llevan tilde.
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(WHITESPACE, ' ')
    .trim();
}

/**
 * Filtro del buscador interno. Match por `label` solamente: la `description`
 * es contexto secundario y buscar por ella esconde opciones que el usuario
 * encuentra obvias.
 *
 * Sin consulta devuelve la lista tal cual (misma referencia), así que un
 * `useMemo` no se invalida por escribir y borrar.
 */
export function filterOptions<T extends SelectOptionLike>(
  options: readonly T[],
  query: string,
): readonly T[] {
  const needle = normalizeText(query);
  if (!needle) return options;
  return options.filter((option) => normalizeText(option.label).includes(needle));
}

/**
 * Primer índice no deshabilitado caminando en una dirección desde
 * `fromIndex`, dando la vuelta al llegar al borde.
 *
 * Devuelve `-1` si no hay ninguna opción habilitada, para que el llamador
 * pueda distinguir "no hay nada que resaltar" de "está en la posición 0".
 */
export function findEnabledIndex<T extends SelectOptionLike>(
  options: readonly T[],
  fromIndex: number,
  step: 1 | -1,
): number {
  if (options.length === 0) return -1;
  let index = fromIndex;
  for (let attempt = 0; attempt < options.length; attempt += 1) {
    index += step;
    if (index >= options.length) index -= options.length;
    else if (index < 0) index += options.length;
    const option = options[index];
    if (option && !option.disabled) return index;
  }
  return -1;
}

export function firstEnabledIndex<T extends SelectOptionLike>(options: readonly T[]): number {
  return findEnabledIndex(options, -1, 1);
}

export function lastEnabledIndex<T extends SelectOptionLike>(options: readonly T[]): number {
  return findEnabledIndex(options, options.length, -1);
}

/**
 * Typeahead: índice de la opción que arranca con `buffer`, buscando desde la
 * opción activa hacia abajo y dando la vuelta.
 *
 * Buscar **desde la activa** y no desde el principio es lo que hace que "pp"
 *Serie fire una vez por letra y no se quede siempre en la primera coincidencia.
 */
export function matchTypeaheadIndex<T extends SelectOptionLike>(
  options: readonly T[],
  buffer: string,
  fromValue: string | null,
): number {
  const needle = normalizeText(buffer);
  if (!needle || options.length === 0) return -1;

  const current =
    fromValue === null ? -1 : options.findIndex((option) => option.value === fromValue);
  for (let attempt = 1; attempt <= options.length; attempt += 1) {
    // Sin opción activa se arranca por la primera; con opción activa se arranca
    // por la **siguiente**, así repetir la misma letra avanza en vez de clavar.
    const index = current < 0 ? attempt - 1 : (current + attempt) % options.length;
    const option = options[index];
    if (!option || option.disabled) continue;
    if (normalizeText(option.label).startsWith(needle)) return index;
  }
  return -1;
}

/**
 * Con qué opción se abre el popover: la seleccionada si sigue habilitada y
 * presente, si no el primer (o último, si se abrió con ↑) habilitado.
 *
 * Se calcula acá y no en el handler de apertura para que sea testeable, y
 * siempre sobre la lista **sin filtrar**: al abrir no hay consulta.
 */
export function resolveInitialActiveIndex<T extends SelectOptionLike>(
  options: readonly T[],
  value: string | null,
  fromEnd: boolean,
): number {
  if (value !== null) {
    const selected = options.findIndex((option) => option.value === value);
    if (selected >= 0 && !options[selected]?.disabled) return selected;
  }
  return fromEnd ? lastEnabledIndex(options) : firstEnabledIndex(options);
}

/**
 * Copy del estado vacío con consulta (§10.2): **repite el criterio**. "Sin
 * opciones" sin el criterio hace que el usuario piense que la app falló.
 */
export function noResultsMessage(query: string): string {
  const trimmed = query.trim();
  return trimmed.length > 0 ? `Sin resultados para «${trimmed}».` : 'Sin resultados.';
}

/** Estado vacío sin consulta: acá explica qué falta, no repite nada (§10.2). */
export function noOptionsMessage(): string {
  return 'No hay opciones para elegir.';
}

/** Timeout del typeahead, en ms. Es el valor que usa el patrón APG. */
export const TYPEAHEAD_TIMEOUT_MS = 600;

/** Debounce del buscador interno, en ms. */
export const SEARCH_DEBOUNCE_MS = 150;
