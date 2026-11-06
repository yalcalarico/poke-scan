import { CollectionsFrame } from '@/components/collections/collections-layout';
import { CollectionsListSkeleton } from '@/components/collections/collection-skeletons';

export default function CollectionsLoading() {
  return <CollectionsFrame
    label="Tus colecciones"
    title="Coleccioná a tu manera."
    description="Cada colección tiene su propio nombre. Armá tus álbumes con las cartas que quieras."
    busy
  >
    <CollectionsListSkeleton />
  </CollectionsFrame>;
}
