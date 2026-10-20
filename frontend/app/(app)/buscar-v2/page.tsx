import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ScreenHeader } from '@/components/layout/screen-header';
import { ScreenContainer } from '@/components/layout/screen-container';
import { CatalogSearch } from '@/components/search/catalog-search';
import { SearchFallback } from '@/components/search/search-fallback';

export const metadata: Metadata = {
  title: 'Buscar',
  description: 'Buscá cartas y consultá su valor de mercado.',
  alternates: { canonical: '/buscar' },
  robots: { index: false, follow: true },
};

export default function BuscarV2Page() {
  return <>
    <ScreenHeader title="Buscar" subtitle="Tu catálogo, con otra energía" />
    <ScreenContainer>
      <Suspense fallback={<SearchFallback />}><CatalogSearch /></Suspense>
    </ScreenContainer>
  </>;
}
