import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CatalogSearch } from '@/components/search/catalog-search';
import { SearchFallback } from '@/components/search/search-fallback';
import { SearchPage } from '@/components/search/search-page';

export const metadata: Metadata = {
  title: 'Buscar',
  description: 'Buscá una carta por nombre o por set y mirá su valor de mercado.',
  alternates: { canonical: '/buscar' },
};

export default function BuscarPage() {
  return (
    <SearchPage>
      {/* CatalogSearch usa useSearchParams: sólo el cuerpo espera la URL cliente. */}
      <Suspense fallback={<SearchFallback />}>
        <CatalogSearch />
      </Suspense>
    </SearchPage>
  );
}
