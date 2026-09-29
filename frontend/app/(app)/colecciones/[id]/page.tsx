import type { Metadata } from 'next';

import { CollectionDetailScreen } from '@/components/collections';

export const metadata: Metadata = {
  title: 'Colección',
  description: 'Las cartas de tu colección, sus duplicados y su valor de mercado.',
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
 */
export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <CollectionDetailScreen collectionId={id} />;
}
