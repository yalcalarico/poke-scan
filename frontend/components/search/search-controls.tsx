'use client';

import { Search, X } from 'lucide-react';
import { useId } from 'react';

import { Chip, IconButton, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { SetDto } from '@/types/api';

import { RarityFilter } from './rarity-filter';
import { SetFilterSheet } from './set-filter-sheet';

export type SearchMode = 'name' | 'number' | 'artist';

/**
 * Los campos contra los que el backend puede matchear `q`
 * (`SearchCardsDto.searchBy`, espejado en `CardSearchField`).
 *
 * `available` no es "existe en el backend" sino "el usuario puede activarlo
 * desde acá". Hoy los tres existen, así que los tres están disponibles; el
 * campo queda igual porque es el que evita tener que tocar la pantalla entera
 * si uno vuelve a quedar deshabilitado.
 *
 * Antes de que el backend tuviera los tres campos, `number` y `artist`
 * estaban `available: false` con un chip visible, tabulable y deshabilitado, y
 * un hint que decía que faltaban. Era preferible a un chip que fingiera
 * filtrar y devolviera resultados por nombre — pero ahora que el backend
 * responde de verdad, mostrar un control apagado es un defecto: la función
 * existe y la app no la ofrece.
 */
export const SEARCH_MODES = [
  { id: 'name', label: 'Nombre', available: true },
  { id: 'number', label: 'Número', available: true },
  { id: 'artist', label: 'Artista', available: true },
] as const satisfies readonly { id: SearchMode; label: string; available: boolean }[];

/**
 * Placeholder por modo. Un input que dice "Buscá por nombre" mientras el chip
 * activo es "Artista" hace dudar de los dos: de si el chip cambió algo y de qué
 * se espera que escribas.
 */
const SEARCH_PLACEHOLDERS: Record<SearchMode, string> = {
  name: 'Buscá por nombre: Charizard, Pikachu…',
  number: 'Buscá por número: 4, 25/102, 4a…',
  artist: 'Buscá por artista: Sugimori, Ken…',
};

/** Para el `sr-only` del label, que no lleva punto y coma. */
const MODE_LABELS: Record<SearchMode, string> = {
  name: 'Nombre',
  number: 'Número',
  artist: 'Artista',
};

export interface SearchControlsProps {
  /** Valor controlado del input. Lo maneja `catalog-search`, no este bloque. */
  value: string;
  onValueChange: (value: string) => void;
  /** Enter en el input o submit del form: empuja la query ya, sin esperar el debounce. */
  onSubmit: () => void;

  /** Campo contra el que matchea `q`. */
  searchBy: SearchMode;
  onSearchByChange: (searchBy: SearchMode) => void;

  /** `setId` activo, o `''`. */
  setId: string;
  onSetIdChange: (setId: string) => void;
  /** Rareza activa, o `''`. */
  rarity: string;
  onRarityChange: (rarity: string) => void;

  sets: readonly SetDto[];
  setsLoading?: boolean;
  setsError?: string | null;
  className?: string;
}

/**
 * El bloque de controles de `/buscar`: input grande, modo de búsqueda y los
 * dos filtros. Antes eran dos `<select>` nativos.
 *
 * ## El input no se borra al navegar
 *
 * `value` es estado controlado y vive en `catalog-search`, con debounce de
 * 300 ms y un ref que marca "este cambio de la URL es mío" (`docs/gotchas.md`
 * #3). Acá no hay ningún efecto que sincronice nada: el componente pinta
 * exactamente lo que le pasaron. Toda la sincronización está en un solo lugar,
 * que es donde se puede romper y donde se puede testear.
 */
export function SearchControls({
  value,
  onValueChange,
  onSubmit,
  searchBy,
  onSearchByChange,
  setId,
  onSetIdChange,
  rarity,
  onRarityChange,
  sets,
  setsLoading = false,
  setsError = null,
  className,
}: SearchControlsProps) {
  const generatedId = useId();
  const inputId = `${generatedId}-q`;
  const hintId = `${generatedId}-hint`;

  const unavailableModes = SEARCH_MODES.filter((mode) => !mode.available);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <form
        role="search"
        aria-label="Buscar cartas"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Buscar cartas por {MODE_LABELS[searchBy].toLowerCase()}
        </label>

        {/*
          `type="search"` por la semántica y por el teclado virtual, con el
          botón de limpiar de WebKit escondido: el nuestro va en el
          `trailingSlot`, y tener dos "x" en el mismo input es un bug, no una
          consecuencia de usar la plataforma.
        */}
        <Input
          id={inputId}
          size="lg"
          type="search"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={SEARCH_PLACEHOLDERS[searchBy]}
          leadingIcon={Search}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={80}
          className="[&_input::-webkit-search-cancel-button]:appearance-none"
          trailingSlot={
            value ? (
              <IconButton
                icon={X}
                label="Limpiar búsqueda"
                size="sm"
                onClick={() => onValueChange('')}
              />
            ) : null
          }
        />
      </form>

      <div role="group" aria-label="Campo de búsqueda" className="flex flex-wrap gap-2">
        {SEARCH_MODES.map((mode) => (
          <SearchModeChip
            key={mode.id}
            label={mode.label}
            selected={mode.id === searchBy}
            available={mode.available}
            hintId={hintId}
            onSelect={() => onSearchByChange(mode.id)}
          />
        ))}
      </div>

      {/*
        El hint solo aparece cuando hay algo que avisar. Con los tres campos
        disponibles no dice nada: una línea de texto que reitera lo que el chip
        activo ya muestra, en cada carga, es ruido.
      */}
      {unavailableModes.length > 0 ? (
        <p id={hintId} className="text-caption text-tertiary">
          Buscar por {unavailableModes.map((m) => m.label.toLowerCase()).join(' y por ')}{' '}
          llega más adelante.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <SetFilterSheet
          sets={sets}
          value={setId}
          onChange={onSetIdChange}
          isLoading={setsLoading}
          error={setsError}
        />
        <RarityFilter value={rarity} onChange={onRarityChange} />
      </div>
    </div>
  );
}

/**
 * Un chip del modo de búsqueda.
 *
 * Los no disponibles usan `aria-disabled` y **no** el atributo `disabled`: un
 * botón con `disabled` no es tabulable, así que el usuario de teclado no
 * llegaría nunca al chip ni al hint que explica por qué. Con `aria-disabled`
 * sigue siendo alcanzable, se anuncia como deshabilitado y el `Enter` no hace
 * nada, que es exactamente el contrato de un control deshabilitado.
 *
 * ─── Por qué NO se usa el `disabled` nuevo del `Chip` ───
 *
 * El `Chip` ganó una apariencia real de apagado, y podría parecer que este
 * call site quedó viejo. No: el `disabled` del `Chip` trae `pointer-events-none`
 * y el atributo nativo, o sea **justo las dos cosas que este chip no puede
 * tener** —dejarse de hover y perder el tab order—. Por eso el apagado de acá
 * está escrito a mano con `className`, que es lo que el `Chip` deja pasar al
 * final del `cn()` y por lo tanto gana.
 *
 * Lo que sí queda es que el apagado real del `Chip` nunca se activa en esta
 * pantalla, porque `disabled` es `false`. Revisado: no hay doble tratamiento.
 * El `onClick` sigue siendo un no-op y el `hover` está neutralizado, así que el
 * chip se ve y se anuncia como no disponible sin hacer nada.
 *
 * Un detalle que sí queda, y es preexistente: el `Chip` en modo `filter` le
 * pone `aria-pressed`, así que el chip announces "no disponible, no
 * seleccionado". Es correcto —`aria-pressed="false"` en un toggle apagado— y no
 * se toca.
 */
function SearchModeChip({
  label,
  selected,
  available,
  hintId,
  onSelect,
}: {
  label: string;
  selected: boolean;
  available: boolean;
  hintId: string;
  onSelect: () => void;
}) {
  return (
    <Chip
      active={selected}
      onClick={available ? onSelect : () => undefined}
      aria-disabled={available ? undefined : true}
      aria-describedby={available ? undefined : hintId}
      title={available ? undefined : 'Todavía no está disponible'}
      className={
        available
          ? undefined
          : 'cursor-not-allowed text-disabled hover:bg-surface hover:text-disabled'
      }
    >
      {label}
    </Chip>
  );
}
