'use client';

import { X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button, Chip, IconButton, Input, SegmentedControl } from '../ui';
import type { CardSort, CardSortDirection, SetDto } from '@/types/api';
import { RarityFilter } from './rarity-filter';
import { SearchOptionsCard, SearchWorkspace } from './search-page';
import { cn } from '@/lib/cn';
import styles from './search.module.css';

export type SearchMode = 'name' | 'number' | 'artist';
export const SEARCH_MODES = [
  { id: 'name', label: 'Nombre', available: true },
  { id: 'number', label: 'Número', available: true },
  { id: 'artist', label: 'Artista', available: true },
] as const satisfies readonly { id: SearchMode; label: string; available: boolean }[];

const SEARCH_PLACEHOLDERS: Record<SearchMode, string> = {
  name: 'Probá con Pikachu',
  number: 'Buscá por número: 4, 25/102, 4a…',
  artist: 'Buscá por artista: Sugimori, Ken…',
};
const MODE_LABELS: Record<SearchMode, string> = { name: 'nombre', number: 'número', artist: 'artista' };
const SORT_OPTIONS: readonly { value: CardSort; label: string }[] = [
  { value: 'name', label: 'Nombre' },
  { value: 'price', label: 'Precio' },
  { value: 'rarity', label: 'Rareza' },
  { value: 'number', label: 'Número' },
];

export interface SearchControlsProps {
  value: string;
  onValueChange: (value: string) => void;
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
  /** Con q el backend ignora orden y sentido: manda la relevancia. */
  hasQuery: boolean;
  sets: SetDto[];
  setsLoading?: boolean;
  setsError?: string | null;
  /** Restablece filtros y orden sin borrar el texto de búsqueda. */
  onClearFilters: () => void;
  className?: string;
  children?: ReactNode;
}

export function SearchControls({
  value, onValueChange, onSubmit, searchBy, onSearchByChange,
  setId, onSetIdChange, rarity, onRarityChange, sort, onSortChange,
  direction, onDirectionChange, hasQuery, sets, setsLoading = false,
  setsError = null, onClearFilters, className, children,
}: SearchControlsProps) {
  const id = useId();
  const setName = sets.find((set) => set.id === setId)?.name ?? setId;
  return (
    <SearchWorkspace className={className} results={children} sidebar={
      <SearchOptionsCard>
        <div className={styles.extraControls}>
          <SegmentedControl label="Campo de búsqueda" value={searchBy} className={styles.modes}
            options={SEARCH_MODES.map((mode) => ({ value: mode.id, label: mode.label }))} onChange={onSearchByChange} />
          <div><p className={styles.caption}>Rareza</p><RarityFilter value={rarity} onChange={onRarityChange} layout="wrap" className={styles.rarities} /></div>
        </div>
      </SearchOptionsCard>
    }>
      <div role="group" aria-label="Filtros del catálogo" className={cn(styles.panel, styles.filters)}>
        <form role="search" aria-label="Buscar cartas" className={styles.searchField}
          onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
          <label htmlFor={`${id}-q`}>Buscar por {MODE_LABELS[searchBy]}</label>
          <Input id={`${id}-q`} type="search" value={value}
            onChange={(event) => onValueChange(event.target.value)} placeholder={SEARCH_PLACEHOLDERS[searchBy]}
            enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={80}
            className={styles.input}
            trailingSlot={value ? <IconButton icon={X} label="Limpiar búsqueda" size="sm" onClick={() => onValueChange('')} /> : null} />
        </form>
        <label className={styles.fullRow} htmlFor={`${id}-set`}>Set / expansión
          <select id={`${id}-set`} value={setId} onChange={(event) => onSetIdChange(event.target.value)}
            disabled={setsLoading || setsError !== null} aria-describedby={setsLoading || setsError ? `${id}-sets-status` : undefined}>
            <option value="">Todos los sets</option>
            {sets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
          </select>
        </label>
        <label htmlFor={`${id}-sort`}>Ordenar por
          <select id={`${id}-sort`} disabled={hasQuery} value={hasQuery ? 'relevance' : sort}
            aria-describedby={hasQuery ? `${id}-relevance` : undefined}
            onChange={(event) => {
              const option = SORT_OPTIONS.find((item) => item.value === event.target.value);
              if (option) onSortChange(option.value);
            }}>
            {hasQuery ? <option value="relevance">Relevancia</option> : SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label htmlFor={`${id}-direction`}>Sentido
          <select id={`${id}-direction`} disabled={hasQuery} value={hasQuery ? 'relevance' : direction}
            aria-describedby={hasQuery ? `${id}-relevance` : undefined}
            onChange={(event) => { if (event.target.value === 'asc' || event.target.value === 'desc') onDirectionChange(event.target.value); }}>
            {hasQuery ? <option value="relevance">Por relevancia</option> : <><option value="asc">Menor a mayor / A–Z</option><option value="desc">Mayor a menor / Z–A</option></>}
          </select>
        </label>
        <Button variant="secondary" className={styles.reset} onClick={() => onClearFilters()}>Limpiar filtros</Button>
      </div>
      {setsLoading ? <p id={`${id}-sets-status`} className={styles.caption}>Cargando expansiones…</p> : null}
      {setsError ? <p id={`${id}-sets-status`} className={styles.caption}>No pudimos cargar las expansiones. Podés usar los demás filtros.</p> : null}
      {hasQuery ? <p id={`${id}-relevance`} className={styles.caption}>Por relevancia. Quitá el texto de búsqueda para elegir otro orden.</p> : null}
      {setId || rarity ? <div className={styles.chips} aria-label="Filtros activos">
        {setId ? <Chip mode="content" size="md" icon={X} iconPosition="end" className="max-w-full"
          aria-label={`Quitar filtro de expansión: ${setName}`} onClick={() => onSetIdChange('')}><span className="truncate">{setName}</span></Chip> : null}
        {rarity ? <Chip mode="content" size="md" icon={X} iconPosition="end" aria-label={`Quitar filtro de rareza: ${rarity}`}
          onClick={() => onRarityChange('')}>{rarity}</Chip> : null}
      </div> : null}
    </SearchWorkspace>
  );
}
