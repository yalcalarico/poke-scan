'use client';

import { CardGridSkeleton, Skeleton } from '@/components/ui';
import { RARITY_OPTIONS } from './rarity-filter';
import { SEARCH_MODES } from './search-controls';
import { CATALOG_PAGE_SIZE } from './catalog-options';
import { SearchOptionsCard, SearchWorkspace } from './search-page';
import { cn } from '@/lib/cn';
import styles from './search.module.css';

/** Mismas tarjetas y columnas, sin simular filtros utilizables durante la carga. */
export function SearchFallback() {
  return (
    <SearchWorkspace results={<CardGridSkeleton count={CATALOG_PAGE_SIZE} className="lg:grid-cols-3 xl:grid-cols-4" />} sidebar={
      <SearchOptionsCard>
        <div className={styles.extraControls} aria-hidden="true">
          <div className={cn(styles.modes, 'flex gap-0.5 rounded-control border border-line bg-surface-2 p-0.5')}>
            {SEARCH_MODES.map((mode) => <Skeleton key={mode.id} variant="block" className={styles.modeSkeleton} />)}
          </div>
          <div>
            <p className={styles.caption}>Rareza</p>
            <div className={cn(styles.rarities, 'flex flex-wrap gap-2 py-1')}>
              {['Todas', ...RARITY_OPTIONS].map((rarity) => (
                <Skeleton key={rarity} variant="block" className={styles.raritySkeleton}><span>{rarity}</span></Skeleton>
              ))}
            </div>
          </div>
        </div>
      </SearchOptionsCard>
    }>
      <div role="group" aria-label="Filtros del catálogo" className={cn(styles.panel, styles.filters)}>
        <div role="status" aria-label="Cargando el buscador" className={styles.searchField}>
          <span>Buscar por nombre</span>
          <Skeleton variant="block" className="h-11" />
        </div>
        {['Set / expansión', 'Ordenar por', 'Sentido'].map((label, index) => (
          <div key={label} className={cn('flex min-w-0 flex-col gap-2', index === 0 && styles.fullRow)} aria-hidden="true">
            <span>{label}</span><Skeleton variant="block" className="h-11" />
          </div>
        ))}
        <Skeleton variant="block" className="h-11" />
      </div>
    </SearchWorkspace>
  );
}
