import type { Metadata } from 'next';

import { LandingPage } from '@/components/marketing';

export const metadata: Metadata = {
  title: { absolute: 'PokéScan — tu colección Pokémon, más clara' },
  description:
    'Escaneá cartas Pokémon, organizá tus sets y consultá estimaciones de mercado en USD o ARS. Probá PokéScan gratis.',
  openGraph: {
    title: 'PokéScan — tu colección Pokémon, más clara',
    description:
      'Escaneá cartas, organizá tus sets y consultá estimaciones en USD o ARS.',
    type: 'website',
  },
  alternates: { canonical: '/' },
};

export default function MarketingHomePage() {
  return <LandingPage />;
}
