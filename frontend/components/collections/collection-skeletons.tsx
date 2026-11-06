import { CardGridSkeleton, Skeleton } from '@/components/ui';
import { CollectionWorkspace } from './collections-layout';
import { COLLECTION_PAGE_SIZE } from './collection-options';
import styles from './collections.module.css';

/** El mismo cuerpo para la ruta y la espera de datos del cliente. */
export function CollectionsListSkeleton({ count = 3 }: { count?: number }) {
  return <div role="status" aria-label="Cargando tus colecciones" aria-busy="true" className={styles.stack}>
    <Skeleton variant="text" className="w-48" />
    <div className="flex flex-wrap gap-3" aria-hidden="true">
      <Skeleton variant="block" className="h-11 w-64" />
      <Skeleton variant="block" className="h-11 w-40" />
    </div>
    <div className={styles.albums}>
      {Array.from({ length: count }, (_, index) => <div key={index} className={styles.album}>
        <div className={styles.cover}>
          <Skeleton variant="block" className="h-24 w-16" />
          <Skeleton variant="block" className="h-24 w-16" />
        </div>
        <Skeleton variant="text" className="h-6 w-3/4" />
        <Skeleton variant="text" className="w-1/2" />
        <Skeleton variant="text" className="w-2/3" />
        <Skeleton variant="text" className="w-1/3" />
        <div className={styles.albumFooter}>
          {Array.from({ length: 4 }, (_, action) => <Skeleton key={action} variant="block" className="h-11 w-full" />)}
        </div>
      </div>)}
    </div>
  </div>;
}

/** Grilla a la izquierda y paneles a la derecha, sin nombres ni objetivos inventados. */
export function CollectionDetailSkeleton() {
  return <div role="status" aria-label="Cargando la colección" aria-busy="true">
    <CollectionWorkspace sidebar={<>
      {Array.from({ length: 3 }, (_, index) => <div key={index} className={styles.loadingPanel} aria-hidden="true">
        <Skeleton variant="text" className="h-6 w-3/4" />
        <Skeleton variant="block" className="h-24 w-full" />
        <Skeleton variant="text" className="w-2/3" />
      </div>)}
    </>}>
      <div className="grid grid-cols-4 gap-2" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="block" className="h-16" />)}
      </div>
      <Skeleton variant="block" className="h-11 w-full" />
      <div className="flex flex-wrap gap-2" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="block" className="h-11 w-20" />)}
      </div>
      <Skeleton variant="block" className="h-11 w-40" />
      <CardGridSkeleton count={COLLECTION_PAGE_SIZE} variant="catalog" className={styles.cards} label="Cargando las cartas de la colección" />
    </CollectionWorkspace>
  </div>;
}
