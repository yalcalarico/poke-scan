import type { Metadata } from 'next';

export { default } from '@/app/(app)/buscar/page';

export const metadata: Metadata = {
  title: 'Buscar',
  description: 'Buscá cartas y consultá su valor de mercado.',
  alternates: { canonical: '/buscar' },
  robots: { index: false, follow: true },
};
