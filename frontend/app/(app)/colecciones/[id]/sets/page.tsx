import type { Metadata } from 'next';
import { Suspense } from 'react';

import { SetProgressFallback } from '@/components/set-progress/set-progress-skeleton';
import { SetProgressScreen } from '@/components/set-progress/set-progress-screen';

export const metadata: Metadata = {
  title: 'Progreso por set',
  description: 'Cuántas cartas de cada set tenés, cuánto valen y cuáles te faltan.',
};

/**
 * `/colecciones/[id]/sets` — el progreso por set y el binder.
 *
 * ## Server Component a propósito
 *
 * No hay nada que pedir en el servidor: el `id` de la colección y el `setId` del
 * binder salen de la URL y los datos salen de la API en el cliente. La pantalla
 * entera es `'use client'` y por eso el `Suspense` no es decorativo:
 * `useSearchParams()` necesita la frontera para que Next pueda decidir en el
 * servidor qué HTML mandar.
 *
 * El `fallback` es el mismo componente que usa `loading.tsx`, por la misma razón
 * que en `/buscar`: dos skeletons de la misma pantalla que no coinciden son
 * un salto de layout esperando a aparecer.
 */
export default function SetProgressPage() {
  return (
    <Suspense fallback={<SetProgressFallback />}>
      <SetProgressScreen />
    </Suspense>
  );
}
