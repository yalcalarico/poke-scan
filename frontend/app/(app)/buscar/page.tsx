import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ScreenHeader } from '@/components/layout/screen-header';
import { ScreenContainer } from '@/components/layout/screen-container';
import { CatalogSearch } from '@/components/search/catalog-search';
import { SearchFallback } from '@/components/search/search-fallback';

/**
 * Sin esto la ruta hereda el `title` global del layout y todas las pantallas
 * sin título propio se llaman igual en la pestaña, en el historial del
 * `BackNavigation` de Android y en el multitasking de iOS.
 */
export const metadata: Metadata = {
  title: 'Buscar',
  description: 'Buscá una carta por nombre o por set y mirá su valor de mercado.',
  alternates: { canonical: '/buscar' },
};

/**
 * `/buscar` — el catálogo.
 *
 * Server Component a propósito. Lo único que necesita el servidor es el chrome
 * —el `ScreenHeader` y el `ScreenContainer`, que son puros— y la pantalla es
 * toda de `useSearchParams`, así que el primer render no tiene nada que pedir
 * ni nada que esperar: los datos salen del catálogo espejado y del caché de la
 * API, no del render.
 *
 * El `Suspense` es obligatorio, no decorativo: `CatalogSearch` llama a
 * `useSearchParams()`, y sin la frontera Next no puede decidir en el servidor
 * quéHTML mandar y obliga a la página entera a renderizarse en el cliente.
 *
 * El header va **sin** `back` ni `action` a diferencia del wireframe: `/buscar`
 * es una raíz de la `BottomNav` y el punto de arranque del producto, así que no
 * hay a dónde volver ni qué cerrar. Un chevron a una pantalla hermana o una `X`
 * que no cierra nada serían dos controles que mienten (§0.1: un componente, una
 * decisión). Cuando la búsqueda se abra como modal sobre otra pantalla —que es
 * el contexto del wireframe— los dos vuelven y el componente ya los soporta.
 */
export default function BuscarPage() {
  return (
    <>
      <ScreenHeader title="Buscar" />

      <ScreenContainer>
        <Suspense fallback={<SearchFallback />}>
          <CatalogSearch />
        </Suspense>
      </ScreenContainer>
    </>
  );
}
