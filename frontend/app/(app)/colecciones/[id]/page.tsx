import type { Metadata } from 'next';

import { CollectionDetailScreen } from '@/components/collections';

export const metadata: Metadata = {
  title: 'Colección',
  description: 'Las cartas de tu colección, sus duplicados y su valor de mercado.',
  robots: { index: false, follow: false },
};

/**
 * `/colecciones/[id]` — el detalle de una colección.
 *
 * Server Component mínimo: `params` es una Promise en Next 16, así que se
 * espera acá y se le pasa el id ya desenrollado al cuerpo client. No se pide
 * nada en el servidor a propósito: el token vive en `sessionStorage`, así que
 * una request desde acá saldría sin credenciales, devolvería 401 y `apiFetch` no
 * está en juego para redirigir — pero el resultado sería el mismo error.
 *
 * Por eso el `metadata` es estático y no `generateMetadata` como en
 * `/carta/[id]`: el nombre de la colección no se conoce en el servidor. Además
 * esta pantalla responde 200 aunque la colección no exista (`docs/gotchas.md`
 * #10 y #12): el 404 de negocio se resuelve en el cliente con un `EmptyState`.
 *
 * ## Por qué la `key`
 *
 * El cuerpo client es un Client Component con estado propio —el encabezado, el
 * `lastGood` que evita vaciar la pantalla al refrescar, la selección, los
 * filtros— y `useAsync` **conserva** el `data` de la corrida anterior mientras
 * la nueva resuelve. Sin `key`, navegar de la colección A a la B mostraba el
 * nombre, los totales y las stats **de A** encima de la grilla de B hasta que
 * las tres requests de B terminaban: un flicker de la colección equivocada que
 * ningún estado de carga marca, porque para el hook la carga ya terminó.
 *
 * Montar de cero por colección es lo más simple que funciona y no necesita un
 * efecto que resetee nada: es el mismo patrón de `key` que usa la lista de
 * resultados de `/buscar` y el `CardPriceSection` de la ficha
 * (`docs/gotchas.md` #3).
 */
export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <CollectionDetailScreen key={id} collectionId={id} />;
}
