import type { Metadata } from 'next';

import { FaqSection } from '@/components/marketing';
import { acquisitionMetadata } from '@/lib/marketing/acquisition-metadata';

export const metadata: Metadata = acquisitionMetadata({
  title: 'Preguntas frecuentes',
  description:
    'Cómo funciona el reconocimiento visual, de dónde salen las referencias de mercado y qué está disponible sin suscripción.',
  canonical: '/faq',
});

export default function FaqPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <FaqSection fullPage />
    </main>
  );
}
