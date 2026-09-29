'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown, Search, X } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { cn } from '@/lib/cn';
import {
  SEARCH_DEBOUNCE_MS,
  TYPEAHEAD_TIMEOUT_MS,
  filterOptions,
  findEnabledIndex,
  firstEnabledIndex,
  lastEnabledIndex,
  matchTypeaheadIndex,
  noOptionsMessage,
  noResultsMessage,
  resolveInitialActiveIndex,
} from '@/lib/select-utils';

import { SelectOptionList, selectOptionId, type SelectOptionItem } from './select-option-list';

export type SelectOption<T extends string> = SelectOptionItem<T>;

/** Más de esto y el buscador deja de ser decorativo: es obligatorio (§8.3). */
const SEARCHABLE_THRESHOLD = 12;

const POPOVER_MAX_HEIGHT = 288; // `max-h-72`
/** Piso del alto: por debajo de 160 px el popover tapa el trigger y no se puede usar. */
const POPOVER_MIN_HEIGHT = 160;
const POPOVER_GAP = 8;
const VIEWPORT_MARGIN = 8;

const selectVariants = cva(
  [
    'relative flex w-full items-center justify-between gap-2 rounded-control border text-left',
    'transition-[color,background-color,border-color,box-shadow] duration-fast ease-standard',
    'focus-visible:ring-2 focus-visible:ring-brand/20 dark:focus-visible:ring-brand/40',
  ],
  {
    variants: {
      size: {
        // Mismo padding y alto que el `Input`/`Button` (§4.1).
        sm: 'h-8 px-3.5 text-label',
        md: 'h-10 px-4 text-label',
        lg: 'h-12 px-5 text-body-strong',
      },
      isInvalid: {
        true: 'border-negative',
        false: 'border-line',
      },
      isDisabled: {
        true: 'cursor-not-allowed border-line bg-surface-2 text-disabled',
        false: 'bg-surface-2 text-primary',
      },
    },
    defaultVariants: { size: 'md', isInvalid: false, isDisabled: false },
  },
);

const triggerLabelVariants = cva(['min-w-0 flex-1 truncate', 'text-tertiary'], {
  variants: {
    tone: {
      placeholder: 'text-tertiary',
      value: 'text-primary',
      disabled: 'text-disabled',
    },
  },
  defaultVariants: { tone: 'value' },
});

/**
 * La fila del buscador. Vive como `cva` y no como JSX suelto porque el popover y
 * el search-sheet futuro la tienen que dibujar **idénticas**: si difieren, el
 * filtro de 176 opciones se siente como otra app.
 */
const selectSearchRowVariants = cva(
  [
    'flex shrink-0 items-center gap-2 border-b border-line-subtle p-2',
    'focus-within:ring-2 focus-within:ring-inset focus-within:ring-brand/20 dark:focus-within:ring-brand/40',
  ],
  {
    variants: {
      size: {
        sm: 'text-caption',
        md: 'text-body',
        lg: 'text-body-strong',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

const searchInputVariants = cva([
  'min-w-0 flex-1 bg-transparent text-primary placeholder:text-tertiary',
  // Sin `focus:ring` propio: el anillo lo pone la fila con `focus-within`.
  // Sacar el outline acá está permitido justamente porque hay reemplazo visible.
  'focus:outline-none',
]);

export type SelectSize = NonNullable<VariantProps<typeof selectVariants>['size']>;

export interface SelectProps<T extends string> {
  options: readonly SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Se muestra cuando `value` es `null` o ya no está en `options`. */
  placeholder?: string;
  /** Por defecto `options.length > 12`. */
  searchable?: boolean;
  disabled?: boolean;
  size?: SelectSize;
  /** Solo para ubicación (ancho, margen). La forma la decide `size`. */
  className?: string;
  /** `id` del trigger, para que el `<label htmlFor>` del `Field` apunte acá. */
  id?: string;
  /** Renderiza un `<input type="hidden">` para poder reemplazar un `<select name>` sin romper el submit. */
  name?: string;
  invalid?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  /**
   * Hint o error del `Field`, según lo que devuelva `useFieldA11y`.
   *
   * Antes no existía y el `Select` quedaba mudo: como el trigger es un
   * `<button>`, el `<label htmlFor>` no lo nombra, así que el lector de pantalla
   * no anunciaba ni el hint ("Máximo 999") ni el error del campo, y el
   * consumidor terminaba metiendo un `aria-label` con el texto del label a mano
   * para compensar eso. Es el mismo contrato que el `Input` y el `Textarea`.
   */
  'aria-describedby'?: string;
}

interface TriggerRect {
  top: number;
  left: number;
  width: number;
}

/**
 * Posiciona el popover desde el rect del trigger.
 *
 * Es una función suelta y sin estado a propósito: se escribe directo sobre el
 * nodo en un `useLayoutEffect`. Medir y guardar en `useState` provocaría un
 * segundo render sin propósito en el frame exacto en que el popover aparece,
 * que es cuando el ojo detecta el parpadeo.
 *
 * Abre para arriba cuando no entra abajo. En un viewport de 390 px con la
 * `BottomNav` y el teclado virtual abiertos, "abajo" suele ser 120 px.
 */
function positionPopover(trigger: HTMLElement, popover: HTMLElement): void {
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - POPOVER_GAP - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - POPOVER_GAP - VIEWPORT_MARGIN;
  const openUp = spaceBelow < Math.min(POPOVER_MAX_HEIGHT, spaceAbove) && spaceAbove > spaceBelow;
  const maxHeight = Math.max(
    POPOVER_MIN_HEIGHT,
    Math.min(POPOVER_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow),
  );

  const width = Math.min(rect.width, window.innerWidth - VIEWPORT_MARGIN * 2);
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN),
  );

  popover.style.left = `${Math.round(left)}px`;
  popover.style.width = `${Math.round(width)}px`;
  popover.style.maxHeight = `${Math.round(maxHeight)}px`;
  popover.dataset.placement = openUp ? 'top' : 'bottom';

  if (openUp) {
    // Anclar por `bottom` y no por `top`: el alto real depende de cuántas
    // opciones haya, y anclar arriba dejaría el popover flotando si es corto.
    popover.style.top = 'auto';
    popover.style.bottom = `${Math.round(window.innerHeight - rect.top + POPOVER_GAP)}px`;
  } else {
    popover.style.bottom = 'auto';
    popover.style.top = `${Math.round(rect.bottom + POPOVER_GAP)}px`;
  }
}

/**
 * Listbox propio, no un `<select>` nativo (§8.3).
 *
 * Motivo: hay 8 selects en la app y el de set tiene 176 opciones; el dropdown
 * del sistema en iOS rompe la sensación de producto.
 *
 * Dos decisiones que no son obvias y conviene no volver a discutir:
 *
 * - **El foco real nunca sale del trigger.** Se usa `aria-activedescendant` para
 *   mover el resaltado. Es el patrón de combobox y evita el scrollbelado de
 *   llevar el foco a la opción: con 176 filas, `focus()` + `scrollIntoView` se
 *   pelean con el `overflow-anchor` del navegador.
 * - **No hay animación de salida.** La de entrada es `pop-in` (240 ms). Agregar
 *   una de 160 ms con `ease-exit` obligaría a conservar el nodo montado hasta
 *   que termina, y mientras está montado hay que seguir contestando teclado y
 *   hover de una lista que ya no se ve. El menú se desvanece en un frame, que es
 *   lo que hace el dropdown del sistema también.
 * - **`max-h-72` va en el popover y `overflow-y-auto` en la lista.** El cap es
 *   del popover entero para que el buscador no se vaya de pantalla; el scroll va
 *   en la sublista para que el input quede siempre visible mientras se recorren
 *   las 176 opciones.
 */
export function Select<T extends string>({
  options,
  value,
  onChange,
  placeholder = 'Elegí una opción',
  searchable,
  disabled = false,
  size = 'md',
  className,
  id,
  name,
  invalid = false,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-labelledby': ariaLabelledBy,
}: SelectProps<T>) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listboxId = `${generatedId}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const [activeValue, setActiveValue] = useState<T | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef<{ buffer: string; timer: ReturnType<typeof setTimeout> | null }>({
    buffer: '',
    timer: null,
  });

  const isSearchable = searchable ?? options.length > SEARCHABLE_THRESHOLD;

  const filteredOptions = useMemo(
    () => filterOptions(options, debouncedQuery),
    [debouncedQuery, options],
  );

  /**
   * El resaltado activo se guarda como **valor**, no como índice: cambiar el
   * filtro no necesita un `useEffect` que lo reinicie, se recalcula acá. Un
   * índice queda apuntando a otra opción en cuanto la lista cambia de largo, y
   * sincronizarlo con un efecto es exactamente el anti-patrón de
   * `docs/gotchas.md` #2.
   */
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

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const activeOptionId = activeIndex >= 0 ? selectOptionId(listboxId, activeIndex) : null;
  const SelectedIcon = selectedOption?.icon;

  const clearTypeahead = useCallback(() => {
    const state = typeaheadRef.current;
    if (state.timer !== null) clearTimeout(state.timer);
    typeaheadRef.current = { buffer: '', timer: null };
  }, []);

  const close = useCallback(
    (restoreFocus: boolean) => {
      setIsOpen(false);
      setQuery('');
      setDebouncedQuery('');
      clearTypeahead();
      // El foco vuelve al trigger salvo que el cierre venga de un click afuera
      // o de un Tab: en esos casos robarle el foco al click es lo que el
      // usuario está pidiendo.
      if (restoreFocus) triggerRef.current?.focus();
    },
    [clearTypeahead],
  );

  const open = useCallback(
    (fromEnd = false) => {
      if (disabled) return;
      const index = resolveInitialActiveIndex(options, value, fromEnd);
      const option = index >= 0 ? options[index] : undefined;
      setActiveValue(option ? option.value : null);
      setIsOpen(true);
    },
    [disabled, options, value],
  );

  const moveActive = useCallback(
    (step: 1 | -1) => {
      const next = findEnabledIndex(filteredOptions, activeIndex, step);
      const option = next >= 0 ? filteredOptions[next] : undefined;
      if (option) setActiveValue(option.value);
    },
    [activeIndex, filteredOptions],
  );

  const commit = useCallback(() => {
    const option = activeIndex >= 0 ? filteredOptions[activeIndex] : undefined;
    if (option && !option.disabled) onChange(option.value);
    close(true);
  }, [activeIndex, close, filteredOptions, onChange]);

  const pushTypeahead = useCallback(
    (char: string) => {
      const state = typeaheadRef.current;
      if (state.timer !== null) clearTimeout(state.timer);
      state.buffer += char;
      state.timer = setTimeout(() => {
        state.buffer = '';
        state.timer = null;
      }, TYPEAHEAD_TIMEOUT_MS);

      const index = matchTypeaheadIndex(filteredOptions, state.buffer, activeValue);
      const option = index >= 0 ? filteredOptions[index] : undefined;
      if (option) setActiveValue(option.value);
    },
    [activeValue, filteredOptions],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement | HTMLInputElement>, inSearch: boolean) => {
      if (disabled) return;

      if (!isOpen) {
        const opens = ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key);
        if (!opens) return;
        // `preventDefault` en Enter/Espacio evita que el click sintético del
        // `<button>` se dispare después y vuelva a cerrar lo que acabamos de abrir.
        event.preventDefault();
        open(event.key === 'ArrowUp');
        return;
      }

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
          // Con el foco en el input, Home/End son del cursor, no del listbox.
          if (inSearch) return;
          event.preventDefault();
          setActiveValue(fallbackValue(filteredOptions, firstEnabledIndex(filteredOptions)));
          return;
        case 'End':
          if (inSearch) return;
          event.preventDefault();
          setActiveValue(fallbackValue(filteredOptions, lastEnabledIndex(filteredOptions)));
          return;
        case 'Enter':
          event.preventDefault();
          commit();
          return;
        case ' ':
          // Con el foco en el buscador, el espacio es un espacio: si cayera acá
          // it'd commitearía la opción resaltada y cerraría el popover.
          if (inSearch) return;
          event.preventDefault();
          commit();
          return;
        case 'Escape':
          event.preventDefault();
          close(true);
          return;
        case 'Tab':
          // Devolver el foco al trigger ANTES de cerrar, sin `preventDefault`:
          // el input se desmonta en el mismo flush, y si el foco se quedara en
          // el elemento que desaparece el Tab siguiente no tendría dónde ir.
          // Con el foco ya en el trigger, el default del navegador sigue su
          // curso normal hacia el próximo control.
          triggerRef.current?.focus();
          close(false);
          return;
        default:
          break;
      }

      // Typeahead: tiene que quedar fuera cuando hay buscador, porque ahí las
      // letras van a filtrar, no a saltar de opción.
      if (inSearch || isSearchable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length !== 1) return;
      pushTypeahead(event.key);
    },
    [close, commit, disabled, filteredOptions, isOpen, isSearchable, moveActive, open, pushTypeahead],
  );

  // Debounce del buscador. El `setState` vive adentro de un `setTimeout`, o sea
  // fuera del camino síncrono del efecto: sin esto dispara el doble render en
  // cascada que avisa `docs/gotchas.md` #9.
  useEffect(() => {
    if (!isSearchable) return;
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isSearchable, query]);

  // El timer del typeahead no puede quedar colgado en un unmount.
  useEffect(() => clearTypeahead, [clearTypeahead]);

  // Click afuera. Va en `pointerdown` y en fase de captura: cuando este
  // listener existe, el `pointerdown` del click que ABRIÓ ya terminó de
  // propagar, así que no lo cierra en la misma interacción. Con `click` el
  // cierre dependería de si el efecto corrió antes o después del dispatch.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as globalThis.Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [close, isOpen]);

  /**
   * Posicionamiento y reposicionado.
   *
   * `useLayoutEffect` y no `useEffect`: medir después del paint deja ver un
   * frame del popover en 0,0 con `w-0`, que es el parpadeo más visible de todo
   * el componente. Los estilos se escriben directo en el nodo, así que no hay
   * ningún `setState` en el camino síncrono del efecto.
   */
  useLayoutEffect(() => {
    if (!isOpen) return;
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;

    // Última rect aplicada: en cada scroll se llama al handler y casi siempre el
    // trigger no se movió. Comparar evita escribir estilos 60 veces por segundo.
    let lastRect: TriggerRect | null = null;

    const apply = () => {
      const rect = trigger.getBoundingClientRect();
      if (
        lastRect &&
        lastRect.top === rect.top &&
        lastRect.left === rect.left &&
        lastRect.width === rect.width
      ) {
        return;
      }
      lastRect = { top: rect.top, left: rect.left, width: rect.width };
      positionPopover(trigger, popover);
    };

    const handleViewportChange = () => {
      const rect = trigger.getBoundingClientRect();
      // Si el trigger se fue de la pantalla (scroll de una lista larga), el
      // popover queda flotando sobre contenido que ya no le corresponde.
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
        close(false);
        return;
      }
      apply();
    };

    apply();
    window.addEventListener('resize', handleViewportChange);
    // `true` = captura, para que también se vea el scroll de los contenedores
    // internos de la página, no solo el de la ventana.
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [close, isOpen]);

  const emptyMessage = debouncedQuery.trim() ? noResultsMessage(debouncedQuery) : noOptionsMessage();
  const labelTone = disabled ? 'disabled' : selectedOption ? 'value' : 'placeholder';

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        // `aria-controls` solo mientras existe el listbox: apuntar a un id que no
        // está en el DOM es un `aria-controls` colgando.
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen ? (activeOptionId ?? undefined) : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        // El hint y el error del `Field`. Sin esto el lector de pantalla
        // anuncia "combobox, 2 de 5" y nada más: ni la ayuda ni el motivo por el
        // que el campo está marcado como inválido.
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => {
          if (isOpen) close(false);
          else open();
        }}
        onKeyDown={(event) => {
          handleKeyDown(event, false);
        }}
        className={selectVariants({ size, isInvalid: invalid, isDisabled: disabled })}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {SelectedIcon ? (
            <SelectedIcon
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
              className="h-4 w-4 shrink-0 text-secondary"
            />
          ) : null}
          <span className={cn(triggerLabelVariants({ tone: labelTone }), 'flex-1 truncate text-left')}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          focusable="false"
          strokeWidth={1.75}
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-fast ease-standard',
            disabled ? 'text-disabled' : 'text-tertiary',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Reemplaza un `<select name=...>` sin romper el submit (§8.3). */}
      {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              // `w-0` evita que el popover se dibuje a lo ancho del documento
              // antes de que el `useLayoutEffect` lo mida. Y como ese efecto
              // corre antes del paint, no llega a verse.
              className="animate-pop-in fixed z-sheet flex max-h-72 w-0 flex-col overflow-hidden rounded-control border border-line bg-surface shadow-lg"
            >
              {isSearchable ? (
                <div className={selectSearchRowVariants({ size })}>
                  <Search
                    aria-hidden="true"
                    focusable="false"
                    strokeWidth={1.75}
                    className="h-4 w-4 shrink-0 text-tertiary"
                  />
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      handleKeyDown(event, true);
                    }}
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    aria-label="Buscar opción"
                    aria-autocomplete="list"
                    aria-controls={listboxId}
                    // El buscador es el mismo campo: si el `Field` tiene hint o
                    // error, también se anuncian acá, que es donde el usuario
                    // está tipeando cuando busca la variante.
                    aria-describedby={ariaDescribedBy}
                    // El input también lleva `aria-activedescendant` (ARIA 1.2 lo
                    // permite en `textbox`): con buscador el foco real está acá,
                    // y sin esto el lector de pantalla no anuncia por dónde va
                    // el resaltado.
                    aria-activedescendant={activeOptionId ?? undefined}
                    placeholder="Buscá…"
                    className={cn(searchInputVariants(), 'text-body')}
                  />
                  {query ? (
                    <button
                      type="button"
                      aria-label="Limpiar búsqueda"
                      onClick={() => setQuery('')}
                      // 36 px, no 44 (§0.5): es una acción redundante —el input
                      // se vacía con la tecla de borrado— y a 44 px se comería
                      // media fila del buscador en 390 px.
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-tertiary transition-colors duration-fast ease-standard hover:bg-surface-3 hover:text-primary"
                    >
                      <X aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ) : null}

              <SelectOptionList
                options={filteredOptions}
                value={value}
                activeValue={activeValue}
                onActiveChange={setActiveValue}
                onSelect={(next) => {
                  onChange(next);
                  close(true);
                }}
                listboxId={listboxId}
                emptyMessage={emptyMessage}
                label={ariaLabel}
                labelledBy={ariaLabelledBy}
                describedBy={ariaDescribedBy}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** Traduce un índice a valor, tolerando `-1` (lista vacía o toda deshabilitada). */
function fallbackValue<T extends string>(options: readonly SelectOptionItem<T>[], index: number): T | null {
  const option = index >= 0 ? options[index] : undefined;
  return option ? option.value : null;
}

export { selectSearchRowVariants, searchInputVariants, selectVariants };
