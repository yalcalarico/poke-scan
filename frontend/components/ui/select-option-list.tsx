'use client';

import { Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/cn';

/** Una opción del `Select`. El genérico va sobre `string` para que `onChange` reciba el literal del tipo. */
export interface SelectOptionItem<T extends string> {
  value: T;
  label: string;
  /** Segunda línea de contexto: año del set, significado de la abreviación. */
  description?: string;
  icon?: LucideIcon;
  /** No se puede elegir, pero **se ve**: el usuario tiene que entender que existe. */
  disabled?: boolean;
}

/** `id` estable de la opción `index` dentro del listbox `listboxId`. */
export function selectOptionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`;
}

export interface SelectOptionListProps<T extends string> {
  options: readonly SelectOptionItem<T>[];
  /** Opción elegida; la marca con el `Check`. */
  value: T | null;
  /** Opción resaltada; la marca con el fondo. Es la que sigue a `aria-activedescendant`. */
  activeValue: T | null;
  onActiveChange: (value: T) => void;
  onSelect: (value: T) => void;
  listboxId: string;
  /** Copy del estado vacío. Ya viene armado: tiene que repetir el criterio (§10.2). */
  emptyMessage: string;
  /** Nombre accesible del listbox. Sin él, hereda el del combobox. */
  label?: string;
  /** Nombre del `<label>` del `Field`, si el combobox no trae `aria-label`. */
  labelledBy?: string;
  /** Hint o error del `Field`: los mismos ids que usa el trigger. */
  describedBy?: string;
  className?: string;
}

/**
 * El `role="listbox"` y sus `role="option"`, sacados del `Select` para que el
 * popover y el futuro search-sheet compartan **una sola** copia del markup que
 * más riesgo de a11y tiene. Duplicarlo garantiza que uno de los dos se quede
 * sin `aria-activedescendant` funcionando.
 *
 * El resaltado de teclado y el de mouse llegan por el mismo estado
 * (`activeValue`), así que no hay dos verdades que puedan desincronizarse.
 */
export function SelectOptionList<T extends string>({
  options,
  value,
  activeValue,
  onActiveChange,
  onSelect,
  listboxId,
  emptyMessage,
  label,
  labelledBy,
  describedBy,
  className,
}: SelectOptionListProps<T>) {
  const nodeRefs = useRef(new Map<number, HTMLDivElement>());

  const activeIndex = activeValue === null ? -1 : options.findIndex((option) => option.value === activeValue);

  /**
   * El foco real nunca está en las opciones (vive en el trigger y se mueve con
   * `aria-activedescendant`), así que el scroll hay que hacerlo a mano. Con
   * `block: 'nearest'` no arrastra al scroll de la página.
   */
  useEffect(() => {
    if (activeIndex < 0) return;
    nodeRefs.current.get(activeIndex)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, options.length]);

  return (
    <div
      id={listboxId}
      role="listbox"
      aria-multiselectable={false}
      aria-label={label}
      /*
        El nombre del listbox no puede ser solo el `aria-label` que el consumidor
        escribe a mano. Cuando el `Select` está dentro de un `Field`, el nombre
        real lo aporta el `<label htmlFor>` —que no nombra al `<button>` del
        trigger, y por eso existe `aria-labelledby`— así que se lo reenviamos.
        Igual con la descripción: el error del campo tiene que seguir sonando
        mientras se recorre la lista, no solo con el trigger enfocado.
      */
      aria-labelledby={label ? undefined : labelledBy}
      aria-describedby={describedBy}
      className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain p-1', className)}
      // El foco se queda en el trigger: sin esto el click le saca el foco al
      // <body> y se pierde el `aria-activedescendant`.
      onPointerDown={(event) => event.preventDefault()}
    >
      {options.length === 0 ? (
        <p className="px-3 py-6 text-center text-caption text-tertiary">{emptyMessage}</p>
      ) : (
        options.map((option, index) => {
          const isSelected = option.value === value;
          const isActive = option.value === activeValue;
          const Icon = option.icon;

          return (
            <div
              key={option.value}
              id={selectOptionId(listboxId, index)}
              role="option"
              aria-selected={isSelected}
              aria-disabled={option.disabled === true}
              ref={(node) => {
                if (node) nodeRefs.current.set(index, node);
                else nodeRefs.current.delete(index);
              }}
              onMouseMove={() => {
                if (!option.disabled) onActiveChange(option.value);
              }}
              onClick={() => {
                if (option.disabled) return;
                onSelect(option.value);
              }}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 py-2',
                // Fondo de la activa y peso de la seleccionada: son dos señales
                // distintas y se pisan solas (la activa gana el fondo).
                isActive ? 'bg-surface-3' : 'bg-transparent',
                option.disabled
                  ? 'cursor-not-allowed text-disabled'
                  : isSelected
                    ? 'text-primary'
                    : isActive
                      ? 'text-primary'
                      : 'text-secondary',
              )}
            >
              {Icon ? (
                <Icon
                  aria-hidden="true"
                  focusable="false"
                  strokeWidth={1.75}
                  className="h-5 w-5 shrink-0"
                />
              ) : null}

              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('truncate', isSelected && 'font-semibold')}>{option.label}</span>
                {option.description ? (
                  <span className="truncate text-caption text-tertiary">{option.description}</span>
                ) : null}
              </span>

              {/*
                El `Check` marca la **seleccionada**, no la activa: si se pusiera
                en la activa, `aria-selected` quedaría sin señal visual y mover el
                resaltado con el teclado movería la "selección" que el usuario ve.
                El placeholder de acá está siempre para que el label no baile
                entre opciones con y sin check.
              */}
              <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center">
                {isSelected ? (
                  <Check strokeWidth={2.25} className="h-4 w-4 text-brand" />
                ) : null}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
