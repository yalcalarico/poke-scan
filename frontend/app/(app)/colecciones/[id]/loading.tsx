import { ScreenContainer } from '@/components/layout/screen-container';
import { ScreenHeader } from '@/components/layout/screen-header';
import { CollectionDetailSkeleton } from '@/components/collections';

/**
 * El skeleton de `/colecciones/[id]` mientras el Server Component vuela.
 *
 * El título del header es un `sr-only` en vez de un `Skeleton`: el
 * `ScreenHeader` lo trunca en los dos lados y lo centra, así que una barra de
 * shimmer ahí se vería como un texto que se está escribiendo. "Colección" a secas
 * ocupa el lugar justo y no dice nada falso.
 *
 * Comparte `CollectionDetailSkeleton` con el estado `loading` del cuerpo client
 * —misma regla que en `/colecciones`: los dos lados del mismo hueco tienen
 * que medir lo mismo.
 */
export default function CollectionDetailLoading() {
  return (
    <>
      <ScreenHeader
        title={<span className="sr-only">Colección</span>}
        back={{ href: `/colecciones`, label: 'las colecciones' }}
      />
      <ScreenContainer aria-busy="true">
        <CollectionDetailSkeleton />
      </ScreenContainer>
    </>
  );
}
