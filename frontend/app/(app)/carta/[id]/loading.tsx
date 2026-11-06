import { FolderPlus, Share2 } from 'lucide-react';
import { CardDetailLayout } from '@/components/cards/card-detail-layout';
import styles from '@/components/cards/card-detail.module.css';
import { Skeleton, Surface } from '@/components/ui';

/** Comparte encabezado, columnas y paneles con la ficha sin anunciar datos ficticios. */
export default function CardDetailLoading() {
  return (
    <CardDetailLayout
      busy
      title={<><span className="sr-only">Ficha de la carta</span><Skeleton className="h-[34px] w-60 max-w-full" /></>}
      subtitle={<Skeleton className="h-[22px] w-72 max-w-full" />}
      backHref="/buscar"
      image={<><div className={styles.art}><Skeleton className="aspect-[420/588] w-full rounded-surface" /></div><Skeleton className="h-10 w-40" /></>}
      prices={<Surface as="section" padded={false} className="p-4"><Skeleton className="h-4 w-40" /><Skeleton className="mt-2 h-9 w-40" /><Skeleton className="mt-2 h-4 w-28" /></Surface>}
      actions={<div className="flex flex-col gap-4">
        <Skeleton variant="stat" className="h-11 w-full" />
        <div className="flex flex-wrap gap-2" aria-hidden="true">
          <span className="inline-flex h-11 items-center gap-2 rounded-full bg-surface-2 px-4"><FolderPlus className="h-4 w-4 text-disabled" /><Skeleton className="h-3 w-14" /></span>
          <span className="inline-flex h-11 items-center gap-2 rounded-full bg-surface-2 px-4"><Share2 className="h-4 w-4 text-disabled" /><Skeleton className="h-3 w-16" /></span>
        </div>
      </div>}
      data={<div aria-hidden="true">{Array.from({ length: 10 }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-4 border-b border-line-subtle py-3 last:border-0">
          <Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-28" />
        </div>
      ))}</div>}
    />
  );
}
