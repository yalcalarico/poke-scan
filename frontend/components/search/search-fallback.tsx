import { CardGridSkeleton, Skeleton } from '@/components/ui';

import { CATALOG_PAGE_SIZE } from './catalog-options';

/** Ancho de un chip de filtro, para que la fila de placeholders mida como la real. */
const CHIP_WIDTHS = ['w-16', 'w-32', 'w-28'] as const;

function ChipRowSkeleton({ count }: { count: number }) {
  return (
    // El `py-1` copia el de `rarity-filter.tsx` y es por el mismo motivo, al
    // revés: sin él, la fila real del scroller de rarezas es 8 px más alta que
    // su placeholder y el salto cae justo en el momento en que la pantalla
    // aparece, que es el peor lugar para un salto de layout.
    <div className="-mx-4 flex gap-2 overflow-hidden px-4 py-1 sm:-mx-6 sm:px-6">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton
          key={index}
          variant="text"
          className={`h-9 shrink-0 rounded-full ${CHIP_WIDTHS[index % CHIP_WIDTHS.length]}`}
        />
      ))}
    </div>
  );
}

/**
 * La forma real de la pantalla mientras el cliente hidrata y la primera página
 * de resultados llega: input del alto de un control `lg`, fila de modos, fila
 * de sets, scroller de rarezas, contador y grilla de 24 cartas.
 *
 * Server Component: no tiene estado ni handlers, así que no arrastra `'use
 * client'` a `page.tsx` ni a `loading.tsx`.
 *
 * Se usa en los dos lados del mismo hueco —el `fallback` del `Suspense` y el
 * `loading.tsx`— y por eso vive acá y no duplicado: dos skeletons de la misma
 * pantalla que no coinciden son un salto de layout esperando pasar.
 */
export function SearchFallback() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      {/*
        `role="status"` + un único label: los `Skeleton` son `aria-hidden` por
        diseño, así que el aviso lo da el contenedor (§8.12). La grilla ya lo
        trae ella con `CardGridSkeleton`.
      */}
      <div className="flex flex-col gap-3" role="status" aria-label="Cargando el buscador">
        <Skeleton variant="block" className="h-12" />

        <div className="flex gap-2">
          <Skeleton variant="text" className="h-9 w-20 rounded-full" />
          <Skeleton variant="text" className="h-9 w-24 rounded-full" />
          <Skeleton variant="text" className="h-9 w-20 rounded-full" />
        </div>

        <Skeleton variant="text" className="w-4/5" />

        <ChipRowSkeleton count={3} />
        <ChipRowSkeleton count={6} />
      </div>

      <div className="flex items-center justify-between gap-3" aria-hidden="true">
        <Skeleton variant="text" className="w-24" />
        <Skeleton variant="text" className="w-28" />
      </div>

      <CardGridSkeleton count={CATALOG_PAGE_SIZE} />
    </div>
  );
}
