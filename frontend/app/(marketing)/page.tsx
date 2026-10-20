import type { Metadata } from 'next';

import { LandingPage } from '@/components/marketing';
import { acquisitionMetadata } from '@/lib/marketing/acquisition-metadata';

export const metadata: Metadata = acquisitionMetadata({
  title: 'Tu colección Pokémon, ordenada carta por carta',
  description:
    'Buscá cartas, organizá tus sets y tené a mano tus duplicadas. Consultá referencias en USD o convertidas a ARS cuando hay datos.',
  canonical: '/',
});

export default function MarketingHomePage() {
  return <LandingPage />;
}
