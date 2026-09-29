'use client';

import { Plus, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import {
  Alert,
  Button,
  Chip,
  SelectOptionList,
  SelectSearchInput,
  Sheet,
  SheetBody,
  Skeleton,
  useSelectSearch,
  type SelectOptionItem,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import type { SetDto } from '@/types/api';

/**
 * Valor centinela de "sin filtro de set".
 *
 * `useSelectSearch` es genérico sobre `string` y su `value` es `string | null`,
 * así que "no hay filtro" no se puede expresar como una opción. Un id de set
 * real es `base1`, `sv3pt5` o `sword-shield` — nunca empieza con `__`.
 */
const ALL_SETS = '__all__';

export interface SetFilterSheetProps {
  sets: readonly SetDto[];
  /** `setId` activo, o `''`. */
  value: string;
  /** Recibe `''` para limpiar el filtro. */
  onChange: (setId: string) => void;
  /** Los sets todavía no llegaron: el sheet lo dice en vez de mostrar una lista vacía. */
  isLoading?: boolean;
  /** Falló la carga de los sets. Estado parcial, no error de pantalla (§9.1 #4). */
  error?: string | null;
  className?: string;
}

/**
 * Filtro de set: un chip que abre un `Sheet` con buscador (§8.3, §8.9).
 *
 * ## Por qué un `Sheet` y no el `Select`
 *
 * Hay 176 opciones. El popover del `Select` mide 288 px de alto y está anclado
 * al chip: en mobile, con la `BottomNav` abajo y el teclado virtual a medio
 * abrir, "abajo" son 120 px y el popover se abre para arriba, tapando los
 * filtros que estás tratando de cambiar. En `sm:` el `Select` está perfecto,
 * pero mantener las dos formas en paralelo son dos conjuntos de a11y que se
 * desincronizan.
 *
 * El `Sheet` es una sola forma para las dos: en `sm:` es un diálogo centrado
 * (§8.9) y ya está testeado. `SelectSearchInput` + `SelectOptionList` son los
 * del `Select`, así que el buscador se ve y se lee igual.
 *
 * El buscador es cliente y sin debounce extra: son 176 strings en memoria y
 * `useSelectSearch` ya debouncea a 150 ms. Escribir "base" encuentra los sets
 * en el frame siguiente.
 */
export function SetFilterSheet({
  sets,
  value,
  onChange,
  isLoading = false,
  error = null,
  className,
}: SetFilterSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);

  const options = useMemo<SelectOptionItem<string>[]>(
    () => [
      { value: ALL_SETS, label: 'Todas las sets' },
      // Orden alfabético con `es`: los sets llevan años en el nombre
      // ("Base 2", "Neo Destiny") y con `en` no es el orden que lee un
      // jugador.
      ...[...sets]
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        .map((set) => ({ value: set.id, label: set.name, description: set.series ?? undefined })),
    ],
    [sets],
  );

  const filter = useSelectSearch(options, { value: value === '' ? null : value });

  const select = useCallback(
    (next: string) => {
      onChange(next === ALL_SETS ? '' : next);
      close();
    },
    [close, onChange],
  );

  const setName = value ? (sets.find((set) => set.id === value)?.name ?? 'Set') : null;

  return (
    <>
      <div className={cn('flex shrink-0 items-center gap-2', className)}>
        <Chip active={value === ''} onClick={() => onChange('')}>
          Todas
        </Chip>

        {/*
          El nombre del set va en el chip y la `X` de afordancia al final. El
          `aria-label` no puede ser "Quitar filtro de set": el nombre
          accesible tiene que **contener** el texto visible (WCAG 2.5.3), o
          pasa a ser otro botón con otro nombre que se ve igual.
        */}
        {setName ? (
          <Chip
            active
            onClick={() => onChange('')}
            icon={X}
            iconPosition="end"
            title="Quitar filtro de set"
          >
            {setName}
          </Chip>
        ) : null}

        <Chip
          icon={Plus}
          onClick={() => setIsOpen(true)}
          disabled={isLoading}
          title={isLoading ? 'Cargando sets…' : undefined}
        >
          Elegir set
        </Chip>
      </div>

      <Sheet
        open={isOpen}
        onClose={close}
        title="Elegí un set"
        size="lg"
        footer={
          setName ? (
            <Button variant="ghost" size="md" onClick={() => select('')}>
              Quitar filtro de set
            </Button>
          ) : null
        }
      >
        <SheetBody bleed>
          {/*
            `sticky` en el buscador: sin esto se va con el scroll de las 176
            filas y a mitad de búsqueda ya no se puede cambiar lo que se
            escribió. `z-base` es para que la lista pase por debajo del borde
            de la fila y no lo tape.
          */}
          <div className="sticky top-0 z-base bg-surface">
            <SelectSearchInput state={filter} size="lg" />
          </div>

          {error ? (
            <div className="p-4">
              <Alert tone="warning" size="sm" title="No pudimos cargar los sets">
                {error} Podés buscar por nombre y filtrar por rareza igual.
              </Alert>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col gap-2 p-4" role="status" aria-label="Cargando sets">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} variant="text" className="h-9" />
              ))}
            </div>
          ) : (
            <SelectOptionList
              options={filter.filteredOptions}
              value={filter.value}
              activeValue={filter.activeValue}
              onActiveChange={filter.setActiveValue}
              onSelect={select}
              listboxId={filter.listboxId}
              emptyMessage={filter.emptyMessage}
              label="Sets disponibles"
            />
          )}
        </SheetBody>
      </Sheet>
    </>
  );
}
