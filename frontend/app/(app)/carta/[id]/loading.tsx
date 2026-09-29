import { ArrowRight, BarChart3, FolderPlus, Share2 } from 'lucide-react';

import { ScreenHeader } from '@/components/layout/screen-header';
import { ScreenContainer } from '@/components/layout/screen-container';
import { Skeleton, Surface } from '@/components/ui';

/**
 * El esqueleto tiene **la forma real** de la ficha, no una aproximada (§9.1):
 * una imagen de carta, el panel del precio con su cifra grande, la fila de
 * administración, la de chips y el `dl` de datos. Un bloque genérico de líneas
 * hace que la pantalla salte de alto cuando entra el contenido, que es
 * exactamente lo que un skeleton tiene que evitar.
 *
 * ## Por qué un `<main>` propio y no `ScreenContainer`
 *
 * Ya no: `ScreenContainer` reparte props al elemento que renderiza, así que el
 * `aria-busy="true"` de §11 va directo en él y este archivo usa el componente en
 * vez de copiarle las clases de ancho y ritmo.
 */
export default function CardDetailLoading() {
  return (
    <>
      <ScreenHeader
        title={<span className="sr-only">Ficha de la carta</span>}
        back={{ href: `/buscar`, label: 'el catálogo' }}
      />

      <ScreenContainer aria-busy="true">
        <div role="status" aria-label="Cargando la ficha de la carta" className="flex flex-col gap-6 md:gap-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
            <div className="flex flex-col items-center gap-5">
              <Skeleton variant="card" className="w-full max-w-xs rounded-surface" />
              <Skeleton className="h-6 w-40" />
            </div>

            <div className="flex flex-col gap-5">
              <Surface padded={false} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-24" />
                  <BarChart3 aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5 text-disabled" />
                </div>
                <Skeleton className="mt-2 h-9 w-40" />
                <Skeleton className="mt-2 h-4 w-28" />
              </Surface>

              <Skeleton variant="stat" className="h-11 w-full" />

              <div className="-mx-4 flex gap-2 overflow-hidden px-4 sm:mx-0 sm:px-0">
                <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3.5">
                  <FolderPlus aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4 text-disabled" />
                  <Skeleton className="h-3 w-14" />
                </span>
                <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3.5">
                  <Share2 aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4 text-disabled" />
                  <Skeleton className="h-3 w-16" />
                </span>
              </div>

              <Surface className="px-4 py-1">
                {Array.from({ length: 7 }, (_, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-4 border-b border-line-subtle py-3 last:border-0"
                  >
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                ))}
              </Surface>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-36" />
              <span className="inline-flex items-center gap-1 text-label text-disabled">
                <ArrowRight aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
              </span>
            </div>
            <div className="-mx-4 flex gap-3 overflow-hidden px-4 sm:mx-0 sm:px-0">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} variant="card" className="w-24 shrink-0" />
              ))}
            </div>
          </div>
        </div>
      </ScreenContainer>
    </>
  );
}
