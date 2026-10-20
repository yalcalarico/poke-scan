'use client';

import { PreviewSheet as Sheet } from '@/components/visual-preview/preview-sheet';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useId, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

import { RarityFilter } from './rarity-filter';

import {
  Badge,
  Button,
  Chip,
  IconButton,
  Input,
  SegmentedControl,
  Select,
  type SelectOptionItem,
} from '../ui';
import { cn } from '@/lib/cn';
import type { CardSort, CardSortDirection, SetDto } from '@/types/api';

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
 * Antes de que el backend tuviera los tres campos, `number` y `artist` estaban
 * `available: false` con un chip visible, tabulable y deshabilitado, y un
 * hint que decía que faltaban. Era preferible a un chip que fingiera
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

/**
 * Los cuatro criterios de orden que el backend acepta en `sort`.
 *
 * `price` es el que responde a "¿cuál de estas cartas vale más?", que es la
 * pregunta que hace volver a alguien a la pantalla. La fuente ya lo soporta
 * (`cards.service.ts::buildOrderBy`) y ordena por el mejor precio de mercado,
 * con las cartas sin precio al final en las dos direcciones.
 */
const SORT_OPTIONS: readonly { value: CardSort; label: string }[] = [
  { value: 'name', label: 'Nombre' },
  { value: 'price', label: 'Precio' },
  { value: 'rarity', label: 'Rareza' },
  { value: 'number', label: 'Número' },
];

const SORT_LABELS: Record<CardSort, string> = {
  name: 'Nombre',
  price: 'Precio',
  rarity: 'Rareza',
  number: 'Número',
};

const DIRECTION_OPTIONS: readonly { value: CardSortDirection; label: string }[] = [
  { value: 'asc', label: 'Ascendente' },
  { value: 'desc', label: 'Descendente' },
];

export interface SearchControlsProps {
  /** Valor controlado del input. Lo maneja `catalog-search`, no este bloque. */
  value: string;
  onValueChange: (value: string) => void;
  /** Enter en el input o submit del form: empuja la query ya, sin esperar el debounce. */
  onSubmit: () => void;
  searchBy: SearchMode;
  onSearchByChange: (value: SearchMode) => void;
  setId: string;
  onSetIdChange: (value: string) => void;
  rarity: string;
  onRarityChange: (value: string) => void;
  sort: CardSort;
  onSortChange: (value: CardSort) => void;
  direction: CardSortDirection;
  onDirectionChange: (value: CardSortDirection) => void;
  /**
   * Si hay texto en el input. El backend **ignora** `sort` y `direction` cuando
   * viene `q` (manda el score de relevancia), así que la UI lo dice en vez de
   * ofrecer un control que no hace nada.
   */
  hasQuery: boolean;
  sets: SetDto[];
  setsLoading?: boolean;
  setsError?: string | null;
  /** Limpia los tres filtros del `Sheet`. Lo provee `catalog-search`. */
  onClearFilters: () => void;
  className?: string;
  children?: ReactNode;
}

const DESKTOP_QUERY = '(min-width: 1024px)';
const subscribeDesktop = (listener: () => void) => {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};
const desktopSnapshot = () => window.matchMedia(DESKTOP_QUERY).matches;
const serverSnapshot = () => false;

export function SearchControls({
  value, onValueChange, onSubmit, searchBy, onSearchByChange,
  setId, onSetIdChange, rarity, onRarityChange, sort, onSortChange,
  direction, onDirectionChange, hasQuery, sets, setsLoading = false,
  setsError = null, onClearFilters, className, children,
}: SearchControlsProps) {
  const generatedId = useId();
  const inputId = `${generatedId}-q`;
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const isDesktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverSnapshot);
  const setOptions = useMemo<SelectOptionItem<string>[]>(() => [
    { value: '', label: 'Todas las expansiones' },
    ...sets.map((set) => ({ value: set.id, label: set.name, description: set.series ?? undefined })),
  ], [sets]);
  const activeCount = Number(Boolean(setId)) + Number(Boolean(rarity));
  const setName = setId ? (sets.find((set) => set.id === setId)?.name ?? setId) : null;
  const orderSummary = hasQuery ? 'Relevancia' : `${SORT_LABELS[sort]} · ${direction === 'asc' ? 'ascendente' : 'descendente'}`;

  // Se monta una sola versión del panel: mismos valores, handlers y nombres accesibles.
  const filters = (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="flex min-w-0 flex-col gap-3" aria-labelledby={`${generatedId}-collection`}>
        <h3 id={`${generatedId}-collection`} className="text-label text-primary">Colección</h3>
        <div className="flex min-w-0 flex-col gap-2">
          <p id={`${generatedId}-set`} className="text-caption text-secondary">Expansión</p>
          <Select options={setOptions} value={setId} onChange={onSetIdChange}
            disabled={setsLoading || setsError !== null}
            aria-labelledby={`${generatedId}-set`} placeholder="Todas las expansiones" />
          {setsLoading ? <p className="text-caption text-secondary">Cargando expansiones…</p> : null}
          {setsError ? <p className="text-caption text-secondary">No pudimos cargar las expansiones. Podés usar los demás filtros.</p> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-caption text-secondary">Rareza</p>
          <RarityFilter value={rarity} onChange={onRarityChange} layout="wrap" />
        </div>
      </section>
      <fieldset className="flex min-w-0 flex-col gap-3 border-t border-line pt-5">
        <legend className="text-label text-primary">Ordenar resultados</legend>
        {hasQuery ? <p className="text-caption text-secondary">Por relevancia. Quitá el texto de búsqueda para elegir otro orden.</p> : (
          <>
            <Select aria-label="Ordenar resultados por" value={sort} options={SORT_OPTIONS.map((option) => ({ ...option }))} onChange={onSortChange} />
            <SegmentedControl label="Sentido del orden" value={direction}
              options={DIRECTION_OPTIONS.map((option) => ({ ...option }))} onChange={onDirectionChange} />
          </>
        )}
      </fieldset>
      {activeCount > 0 || sort !== 'name' || direction !== 'asc' || searchBy !== 'name' ? (
        <Button variant="ghost" onClick={onClearFilters}>Restablecer filtros</Button>
      ) : null}
    </div>
  );

  return (
    <div className={cn('grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6', className)}>
      <div className="flex min-w-0 flex-col gap-3 lg:col-span-2">
        <div className="flex items-stretch gap-2">
          <form role="search" aria-label="Buscar cartas" className="min-w-0 flex-1"
            onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
            <label htmlFor={inputId} className="sr-only">Buscar cartas por {MODE_LABELS[searchBy].toLowerCase()}</label>
            <Input id={inputId} size="lg" type="search" value={value}
              onChange={(event) => onValueChange(event.target.value)} placeholder={SEARCH_PLACEHOLDERS[searchBy]}
              leadingIcon={Search} enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={80}
              className="[&_input::-webkit-search-cancel-button]:appearance-none"
              trailingSlot={value ? <IconButton icon={X} label="Limpiar búsqueda" size="sm" onClick={() => onValueChange('')} /> : null} />
          </form>
          <Button type="button" variant="secondary" size="lg" aria-haspopup="dialog"
            aria-label={activeCount ? `Filtros: ${activeCount} activos` : 'Filtros'}
            onClick={() => setIsFiltersOpen(true)} className="shrink-0 lg:hidden">
            <SlidersHorizontal aria-hidden="true" className="size-5" strokeWidth={1.75} />
            <span className="hidden min-[380px]:inline">Filtros</span>
            {activeCount > 0 ? <Badge tone="brand" aria-hidden="true">{activeCount}</Badge> : null}
          </Button>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <SegmentedControl label="Campo de búsqueda" value={searchBy}
            options={SEARCH_MODES.map((mode) => ({ value: mode.id, label: mode.label }))} onChange={onSearchByChange} />
          <p className="text-caption text-secondary lg:hidden">Orden: {orderSummary}</p>
        </div>
        {activeCount > 0 ? <div className="flex flex-wrap gap-2" aria-label="Filtros activos">
          {setId ? <Chip mode="content" size="md" icon={X} iconPosition="end" className="max-w-full"
            aria-label={`Quitar filtro de expansión: ${setName}`} onClick={() => onSetIdChange('')}><span className="truncate">{setName}</span></Chip> : null}
          {rarity ? <Chip mode="content" size="md" icon={X} iconPosition="end" aria-label={`Quitar filtro de rareza: ${rarity}`}
            onClick={() => onRarityChange('')}>{rarity}</Chip> : null}
        </div> : null}
      </div>
      {isDesktop ? (
        <aside aria-label="Filtros del catálogo" className="sticky top-36 max-h-[calc(100dvh-10rem)] min-w-0 overflow-y-auto rounded-panel border border-line bg-surface p-4">
          <h2 className="mb-5 text-h3 text-primary">Filtros</h2>
          {filters}
        </aside>
      ) : (
        <Sheet open={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} title="Filtros del catálogo"
          subtitle="Los cambios se aplican al elegirlos." size="lg"
          footer={<Button size="lg" className="w-full" onClick={() => setIsFiltersOpen(false)}>Ver resultados</Button>}>
          {filters}
        </Sheet>
      )}
      <div className="min-w-0 lg:col-start-2">{children}</div>
    </div>
  );
}
