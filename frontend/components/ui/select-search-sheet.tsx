'use client';

import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';

import { cn } from '@/lib/cn';
import {
  SEARCH_DEBOUNCE_MS,
  filterOptions,
  findEnabledIndex,
  firstEnabledIndex,
  noOptionsMessage,
  noResultsMessage,
} from '@/lib/select-utils';

import { selectOptionId, type SelectOptionItem } from './select-option-list';
import {
  searchInputVariants,
  selectSearchRowVariants,
  type SelectOption,
  type SelectSize,
} from './select';

export type { SelectOption };

/**
 * Estado + input de búsqueda para un filtro con muchas opciones
 * (el de set: 176). Un popover anclado de 288 px con 176 filas es usable con
 * teclado y una molestia con el pulgar: en mobile esto quiere ser una pantalla
 * casi completa con buscador.
 *
 * ## Cómo se compone
 *
 * `useSelectSearch` no renderiza nada: devuelve el estado y lo reparte entre los
 * dos componentes que sí dibujan, `SelectSearchInput` y `SelectOptionList`. Los
 * dos comparten con el popover del `Select` las clases de la fila de búsqueda y
 * el markup del listbox, así que las dos formas de elegir se ven y se leen
 * igual.
 *
 * ```tsx
 * const filter = useSelectSearch(sets, { value: selectedSetId });
 *
 * <Sheet open={open} onClose={() => setOpen(false)} title="Elegí un set">
 *   <SelectSearchInput state={filter} />
 *   <SelectOptionList
 *     options={filter.filteredOptions}
 *     value={filter.value}
 *     activeValue={filter.activeValue}
 *     onActiveChange={filter.setActiveValue}
 *     onSelect={(next) => {
 *       onChange(next);
 *       setOpen(false);
 *     }}
 *     listboxId={filter.listboxId}
 *     emptyMessage={filter.emptyMessage}
 *   />
 * </Sheet>
 * ```
 *
 * ## Lo que este archivo NO hace
 *
 * - **No monta el overlay ni el portal.** Eso es del `Sheet`.
 * - **No atrapa el foco ni bloquea el scroll.** También del `Sheet` (§8.9).
 * - **No hace typeahead.** Acá el foco vive en el input de búsqueda y las
 *   letras filtran; el typeahead del `Select` es para el caso sin buscador.
 *
 * ## Ojo con `select` vs `onSelect`
 *
 * `SelectOptionList` pide un `onSelect` que recibe el **valor** ya elegido, y es
 * el que hay que cablear al commit. El `filter.select` que devuelve el hook es
 * otra cosa: toma la opción entera y solo mueve el resaltado, sin cerrar nada.
 * Es lo que usa el `onKeyDown` interno para el Enter, y no sirve para
 * confirmar. Conectar `onSelect={filter.select}` compila —los dos son
 * funciones— y no hace nada visible: el menú nunca se cierra.
 */

export interface UseSelectSearchOptions<T extends string> {
  /** Opción elegida. Es el ancla del resaltado al abrir. */
  value: T | null;
  /** Debounce del filtro. 150 ms es el default del sistema. */
  debounceMs?: number;
}

export interface SelectSearchState<T extends string> {
  listboxId: string;
  searchId: string;
  /** Texto crudo del input. Es el estado controlado por el usuario: nunca se
   *  deriva de otro estado en un efecto (docs/gotchas.md #2). */
  query: string;
  onQueryChange: (query: string) => void;
  /** Texto sobre el que se filtra de verdad (con debounce). */
  debouncedQuery: string;
  filteredOptions: readonly SelectOptionItem<T>[];
  value: T | null;
  activeValue: T | null;
  activeIndex: number;
  activeOptionId: string | null;
  /** Copy del estado vacío, con el criterio repetido (§10.2). */
  emptyMessage: string;
  setActiveValue: (value: T) => void;
  setActiveIndex: (index: number) => void;
  moveActive: (step: 1 | -1) => void;
  select: (option: SelectOptionItem<T>) => void;
  reset: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Todo el estado de un filtro buscable, sin renderizar nada. Se separa del
 * input (`SelectSearchInput`) y de la lista (`SelectOptionList`) para que la
 * pantalla pueda acomodarlos como quiera dentro del sheet.
 */
export function useSelectSearch<T extends string>(
  options: readonly SelectOptionItem<T>[],
  { value, debounceMs = SEARCH_DEBOUNCE_MS }: UseSelectSearchOptions<T>,
): SelectSearchState<T> {
  const generatedId = useId();
  const listboxId = `${generatedId}-listbox`;
  const searchId = `${generatedId}-search`;

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeValue, setActiveValue] = useState<T | null>(null);

  const filteredOptions = useMemo(
    () => filterOptions(options, debouncedQuery),
    [debouncedQuery, options],
  );

  /** Igual que en el `Select`: el resaltado se guarda como valor y el índice se
   *  deriva en render, así que cambiar el filtro no necesita un efecto. */
  const activeIndex = useMemo(() => {
    if (filteredOptions.length === 0) return -1;
    if (activeValue !== null) {
      const index = filteredOptions.findIndex((option) => option.value === activeValue);
      if (index >= 0) return index;
    }
    if (value !== null) {
      const index = filteredOptions.findIndex((option) => option.value === value);
      if (index >= 0) return index;
    }
    return firstEnabledIndex(filteredOptions);
  }, [activeValue, filteredOptions, value]);

  const setActiveIndex = useCallback(
    (index: number) => {
      const option = index >= 0 ? filteredOptions[index] : undefined;
      setActiveValue(option ? option.value : null);
    },
    [filteredOptions],
  );

  const moveActive = useCallback(
    (step: 1 | -1) => {
      const next = findEnabledIndex(filteredOptions, activeIndex, step);
      const option = next >= 0 ? filteredOptions[next] : undefined;
      if (option) setActiveValue(option.value);
    },
    [activeIndex, filteredOptions],
  );

  const select = useCallback((option: SelectOptionItem<T>) => {
    if (option.disabled) return;
    setActiveValue(option.value);
  }, []);

  const reset = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setActiveValue(null);
  }, []);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveActive(1);
          return;
        case 'ArrowUp':
          event.preventDefault();
          moveActive(-1);
          return;
        case 'Home':
          return; // Home/End son del cursor del input, no del listbox.
        case 'End':
          return;
        case 'Enter': {
          event.preventDefault();
          const option = activeIndex >= 0 ? filteredOptions[activeIndex] : undefined;
          if (option && !option.disabled) select(option);
          return;
        }
        default:
          break;
      }
    },
    [activeIndex, filteredOptions, moveActive, select],
  );

  // El `setState` va dentro del `setTimeout`: fuera del camino síncrono del
  // efecto, que es lo que pide `docs/gotchas.md` #9.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(timer);
  }, [debounceMs, query]);

  return {
    listboxId,
    searchId,
    query,
    onQueryChange: setQuery,
    debouncedQuery,
    filteredOptions,
    value,
    activeValue,
    activeIndex,
    activeOptionId: activeIndex >= 0 ? selectOptionId(listboxId, activeIndex) : null,
    emptyMessage: debouncedQuery.trim()
      ? noResultsMessage(debouncedQuery)
      : noOptionsMessage(),
    setActiveValue,
    setActiveIndex,
    moveActive,
    select,
    reset,
    onKeyDown,
  };
}

export interface SelectSearchInputProps<T extends string> {
  state: SelectSearchState<T>;
  size?: SelectSize;
  className?: string;
}

/**
 * La fila del buscador. Idéntica a la del popover del `Select`: el input es la
 * misma pieza en los dos lugares, y el filtro de 176 opciones no puede
 * sentirse como dos apps distintas.
 */
export function SelectSearchInput<T extends string>({
  state,
  size = 'md',
  className,
}: SelectSearchInputProps<T>) {
  const { searchId, query, onQueryChange, onKeyDown, listboxId } = state;

  return (
    <div className={cn(selectSearchRowVariants({ size }), className)}>
      <Search
        aria-hidden="true"
        focusable="false"
        strokeWidth={1.75}
        className="h-4 w-4 shrink-0 text-tertiary"
      />
      <input
        id={searchId}
        type="text"
        value={query}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onQueryChange(event.target.value)}
        onKeyDown={onKeyDown}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        aria-label="Buscar opción"
        aria-autocomplete="list"
        aria-controls={listboxId}
        placeholder="Buscá…"
        className={cn(searchInputVariants(), 'text-body')}
      />
      {query ? (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => onQueryChange('')}
          // Mismo tamaño que el del popover del `Select` (36 px, no 44) y por el
          // mismo motivo: es una acción redundante —el input se vacía con la
          // tecla de borrado— y a 44 px se comería media fila en 390 px. Lo que
          // **no** se replica es la falta de indicador: este botón y el de
          // `select.tsx` eran de los pocos elementos interactivos del set de
          // primitivas sin ninguno. Indicador de `Button`: `outline` a color
          // pleno por SC 1.4.11.
          className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-tertiary transition-colors duration-fast ease-standard hover:bg-surface-3 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
        >
          <X aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
