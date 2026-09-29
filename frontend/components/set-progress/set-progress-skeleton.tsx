import { Layers } from 'lucide-react';

import { ScreenContainer } from '@/components/layout/screen-container';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Skeleton } from '@/components/ui';

/**
 * El esqueleto de `/colecciones/[id]/sets`, con **la forma real** del
 * contenido (§9.1): la tira de totales, los títulos de sección, las tarjetas de
 * set con su símbolo y su barra, y el botón de "Ver más sets".
 *
 * ## Por qué solo la Vista 1
 *
 * Porque `loading.tsx` no recibe `searchParams` y esta pantalla tiene dos vistas
 * dentro de la misma ruta (`?set=` abre el binder). Dibujar las dos duplicaría
 * el esqueleto y no coincidiría con ninguna: el skeleton tiene que medir lo que
 * entra, y lo que entra primero es siempre la Vista 1, porque el usuario todavía
 * no eligió un set.
 *
 * ## Por qué el `back` apunta a la lista y no a la colección
 *
 * Porque el skeleton no sabe el `id` de la colección (`loading.tsx` tampoco
 * recibe `params`). Apunta a `/colecciones`, que es la misma sección de
 * navegación: la forma del header —chevron a la izquierda, título centrado— no
 * cambia cuando entra el contenido real, así que no hay salto de layout
 * (el riesgo de skeletons desalineados que anota el plan).
 *
 * ## `aria-busy`
 *
 * Va en el cuerpo del skeleton y no en el `<main>`, y ahora por un motivo
 * real y no por una limitación: `SetProgressFallbackBody` se usa **dentro** de
 * un `ScreenContainer` que ya está montado (es el `Suspense` fallback de
 * `page.tsx` y el estado de carga de la pantalla), así que el `<main>` no le
 * pertenece y no puede cobrarle un atributo. El `role="status"` del aviso alcanza
 * para anunciar la carga; el `aria-busy` del body acota la región que se está
 * reemplazando.
 */
export function SetProgressFallback() {
  return (
    <>
      <ScreenHeader
        title="Progreso por set"
        back={{ href: `/colecciones`, label: 'las colecciones' }}
      />

      <ScreenContainer>
        <SetProgressFallbackBody />
      </ScreenContainer>
    </>
  );
}

/**
 * Solo el cuerpo, sin header ni `ScreenContainer`.
 *
 * Es lo que pinta la pantalla cuando **ya está montada** y lo que falta pedir son
 * los datos: ahí el header es real (y su título depende de la vista, que el
 * skeleton no puede saber) y el `ScreenContainer` ya está montado. Reusar el
 * `SetProgressFallback` entero acá pondría un segundo `<main id="contenido">` en
 * la página, que es exactamente lo que el skip link y el modo de lector de
 * pantalla no pueden tener.
 */
export function SetProgressFallbackBody() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div role="status" aria-label="Cargando el progreso por set" className="flex flex-col gap-6">
        {/* La tira de totales: 3 números y una línea de valor. */}
        <div className="rounded-surface border border-line bg-surface px-4 py-3 shadow-sm">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex flex-col gap-1">
                <Skeleton variant="text" className="h-2.5 w-14" />
                <Skeleton variant="text" className="h-5 w-10" />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-line-subtle pt-3">
            <Layers
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
              className="h-3.5 w-3.5 text-disabled"
            />
            <Skeleton variant="text" className="h-3 w-24" />
          </div>
        </div>

        <SectionPlaceholder />

        {[0, 1, 2].map((index) => (
          <SetCardPlaceholder key={index} percentWidth="w-12" footerWidth="w-24" />
        ))}

        <SectionPlaceholder />

        {[0, 1].map((index) => (
          <SetCardPlaceholder key={index} percentWidth="w-10" footerWidth="w-32" />
        ))}

        <Skeleton variant="text" className="mx-auto h-12 w-40 rounded-full" />
      </div>
    </div>
  );
}

function SectionPlaceholder() {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton variant="text" className="h-5 w-32" />
      <Skeleton variant="text" className="h-3 w-52" />
    </div>
  );
}

function SetCardPlaceholder({
  percentWidth,
  footerWidth,
}: {
  percentWidth: string;
  footerWidth: string;
}) {
  return (
    <div className="rounded-surface border border-line bg-surface p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <Skeleton variant="text" className="size-10 rounded-control" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton variant="text" className="h-3.5 w-2/5" />
          <Skeleton variant="text" className="h-3 w-1/4" />
        </div>
        <Skeleton variant="text" className={`h-5 ${percentWidth}`} />
      </div>
      <Skeleton variant="text" className="mt-3 h-3.5 w-20" />
      <Skeleton variant="text" className="mt-2 h-1.5 w-full rounded-full" />
      <Skeleton variant="text" className={`mt-2 h-3.5 ${footerWidth}`} />
    </div>
  );
}
