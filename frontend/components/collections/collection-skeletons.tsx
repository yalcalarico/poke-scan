import { CardGridSkeleton, Skeleton, Surface } from '@/components/ui';
import { cn } from '@/lib/cn';

import { COLLECTION_PAGE_SIZE } from './collection-options';

/**
 * Los skeletons de las dos pantallas, con **la forma real** del contenido
 * (§9.1). Server Component: no tienen estado ni handlers, así que ni el
 * `loading.tsx` ni los cuerpos client los obligan a arrastrar `'use client'`.
 *
 * Viven acá y no duplicados en los `loading.tsx` porque los dos lados del mismo
 * hueco —el `loading.tsx` del segmento y el `status === 'loading'` del cuerpo
 * client— tienen que medir exactamente lo mismo: dos skeletons de la misma
 * pantalla que no coinciden son un salto de layout esperando a aparecer (es lo
 * que hace `SearchFallback` en `/buscar`).
 */

function CardSkeleton() {
  return (
    <Surface padded={false} className="overflow-hidden">
      <Skeleton variant="block" className="aspect-[4/3] rounded-none" />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton variant="text" className="h-3.5 w-3/5" />
        <Skeleton variant="text" className="w-1/3" />
        <Skeleton variant="text" className="mt-2 w-2/5" />
      </div>
      {/*
        La franja del link "Progreso por set" que la `CollectionCard` real
        agrega abajo. Sin esta línea el skeleton mide 60 px menos que la tarjeta
        y la grilla salta justo cuando llegan los datos, que es lo que §9.1
        prohíbe. Mismo `p-2` que el link real; el alto va fijo en 44 y no en el
        `min-h-11` del link porque acá no hay texto que pueda partirse en dos
        líneas, y `h-11` además pisa el `h-24` del `variant="block"`.
      */}
      <div className="border-t border-line-subtle p-2">
        <Skeleton variant="block" className="h-11 w-full rounded-control" />
      </div>
    </Surface>
  );
}

/**
 * El skeleton de `/colecciones`: la línea del contador, tres tarjetas con
 * mosaic, nombre, cantidad y valor, y la línea del total combinado.
 */
export function CollectionsListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div role="status" aria-label="Cargando tus colecciones" className="flex flex-col gap-4">
        <Skeleton variant="text" className="w-40" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {Array.from({ length: count }, (_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>

        <div className="flex justify-center">
          <Skeleton variant="text" className="w-48" />
        </div>
      </div>
    </div>
  );
}

function ChipSkeleton({ width }: { width: string }) {
  return <Skeleton variant="text" className={cn('h-9 shrink-0 rounded-full', width)} />;
}

/**
 * El skeleton de `/colecciones/[id]`: la `CollectionSummary` de dos
 * columnas, las cinco métricas, la fila de cuatro chips y la grilla densa de 3
 * columnas.
 *
 * La quinta métrica lleva `col-span-2` a propósito: es la misma regla que
 * aplica `StatGrid` cuando el conteo de stats es impar, y el skeleton tiene que
 * medir lo que va a aparecer, no una versión "provisoria" que después se
 * acomode.
 */
export function CollectionDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div role="status" aria-label="Cargando la colección" className="flex flex-col gap-5">
        <Surface className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton variant="block" className="size-11 shrink-0 rounded-control" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <Skeleton variant="text" className="h-4 w-40" />
              <Skeleton variant="text" className="w-28" />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Skeleton variant="text" className="w-14" />
            <Skeleton variant="block" className="h-7 w-28 rounded-control" />
          </div>
        </Surface>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton
              key={index}
              variant="block"
              className={cn(
                'h-[4.5rem] rounded-control',
                index === 4 && 'col-span-2 md:col-span-1',
              )}
            />
          ))}
        </div>
      </div>

      {/*
        Scroller de la fila de filtros, con la misma forma que
        `collection-filters.tsx`. **Sin `py-1` a propósito, y no es un olvido:**
        acá no hay `Chip`s reales sino `Skeleton`s que no son enfocables, así que
        no hay `outline` que se recorte. Y el alto de esta fila tiene que
        *matchear* la fila real de filtros: si el skeleton mide 4 px menos, la
        grilla de cartas salta cuando llega el contenido (§9.1). El `py-1` que
        necesita el `outline` se lo pone el componente real, no el skeleton.
      */}
      <div className="-mx-4 flex gap-2 overflow-hidden px-4 sm:mx-0 sm:px-6" aria-hidden="true">
        <ChipSkeleton width="w-16" />
        <ChipSkeleton width="w-24" />
        <ChipSkeleton width="w-32" />
        <ChipSkeleton width="w-14" />
      </div>

      <CardGridSkeleton
        count={COLLECTION_PAGE_SIZE}
        variant="collection"
        label="Cargando las cartas de la colección"
      />
    </div>
  );
}
