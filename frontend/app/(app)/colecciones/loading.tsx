import { ScreenContainer } from '@/components/layout/screen-container';
import { ScreenHeader } from '@/components/layout/screen-header';
import { CollectionsListSkeleton } from '@/components/collections';

/**
 * El skeleton de `/colecciones` mientras el Server Component vuela.
 *
 * Comparte `CollectionsListSkeleton` con el estado `loading` del cuerpo client en
 * vez de duplicarlo: son el mismo hueco visto desde los dos lados, y dos
 * versiones del mismo skeleton que no coinciden son un salto de layout
 * esperando a aparecer (es lo que hace `SearchFallback` en `/buscar`).
 *
 * El `aria-busy` va en el `<main>` y no en la raíz del skeleton: la región que
 * está ocupada es la pantalla entera. `ScreenContainer` reparte props al
 * elemento que renderiza, así que no hay que escribir un `<main>` propio
 * copiándole las clases de ancho y de padding. El anuncio vive en el
 * `role="status"` de adentro (§8.12).
 */
export default function CollectionsLoading() {
  return (
    <>
      <ScreenHeader title="Colecciones" />
      <ScreenContainer aria-busy="true">
        <CollectionsListSkeleton />
      </ScreenContainer>
    </>
  );
}
