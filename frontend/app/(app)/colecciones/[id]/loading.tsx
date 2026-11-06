import Link from 'next/link';
import { buttonVariants } from '@/components/ui';
import { CollectionsFrame } from '@/components/collections/collections-layout';
import { CollectionDetailSkeleton } from '@/components/collections/collection-skeletons';

export default function CollectionDetailLoading() {
  return <CollectionsFrame
    label="Tu colección"
    title="Colección"
    actions={<Link href="/colecciones" className={buttonVariants({ variant: 'secondary' })}>Todas las colecciones</Link>}
    busy
  >
    <CollectionDetailSkeleton />
  </CollectionsFrame>;
}
