import type { Metadata } from 'next';

import { FaqSection } from '@/components/marketing';

export const metadata: Metadata = {
  title: 'Preguntas frecuentes',
  description:
    'Cómo funciona el escáner de PokéScan, de dónde salen los precios, qué requiere conexión y qué incluiría Pro.',
  alternates: { canonical: '/faq' },
};

export default function FaqPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <FaqSection fullPage />
    </main>
  );
}
