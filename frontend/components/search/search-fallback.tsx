import { CardGridSkeleton, Skeleton } from '@/components/ui';

import { CATALOG_PAGE_SIZE } from './catalog-options';

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
      {/*
        La barra primero, y con la **misma** forma que la real: el input
        `flex-1` y el botón al lado, del alto del input. Antes este skeleton
        dibujaba la pila vieja de controles (input, tres chips, una línea, dos
        filas de chips) y con la pantalla nueva el contenido se corría al
        cargar y la grilla saltaba dos veces. El `ChipRowSkeleton` ya no se usa
        acá: los filtros están dentro de un `Sheet` que no se abre solo.
      */}
      <div
        className="flex items-stretch gap-2"
        role="status"
        aria-label="Cargando el buscador"
      >
        <Skeleton variant="block" className="h-12 flex-1" />
        <Skeleton variant="block" className="h-12 w-28 shrink-0" />
      </div>

      <div className="flex items-center justify-between gap-3" aria-hidden="true">
        <Skeleton variant="text" className="w-24" />
        <Skeleton variant="text" className="w-28" />
      </div>

      <CardGridSkeleton count={CATALOG_PAGE_SIZE} />
    </div>
  );
}
