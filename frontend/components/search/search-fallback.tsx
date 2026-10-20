import { CardGridSkeleton, Skeleton } from '@/components/ui';

import { CATALOG_PAGE_SIZE } from './catalog-options';

/** Conserva la composición del buscador mientras llega la primera página. */
export function SearchFallback() {
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6" aria-busy="true">
      <div className="flex flex-col gap-3 lg:col-span-2" role="status" aria-label="Cargando el buscador">
        <Skeleton variant="block" className="h-12" />
        <Skeleton variant="block" className="h-11 w-64" />
      </div>
      <div className="hidden flex-col gap-5 rounded-panel border border-line bg-surface p-4 lg:flex" aria-hidden="true">
        <Skeleton variant="text" className="w-24" />
        <Skeleton variant="block" className="h-12" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 12 }, (_, index) => <Skeleton key={index} variant="block" className="h-11 w-24 rounded-full" />)}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Skeleton variant="text" className="w-24" />
        <CardGridSkeleton count={CATALOG_PAGE_SIZE} className="lg:grid-cols-3 xl:grid-cols-4" />
      </div>
    </div>
  );
}
