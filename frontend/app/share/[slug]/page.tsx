import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { PublicCollectionView } from '@/components/share/public-collection-view';
import { Button, ErrorState } from '@/components/ui';
import { getApiBaseUrl } from '@/lib/api/api-client';
import { toPublicSharedCollection } from '@/lib/api/schema';
import type { PublicSharedCollection } from '@/lib/api/share';
import { formatPrice, pluralize } from '@/lib/format';

/**
 * 60 s. El backend ya cachea `/s/:slug` en Redis y el dato cambia recién cuando
 * el dueño edita la colección o cuando alguien la mira, así que bajar de 60 s no
 * aporta nada y sube la carga de la ruta pública, que es la que más tráfico
 * tiene.
 */
const REVALIDATE_SECONDS = 60;

type FetchResult =
  | { kind: 'ok'; data: PublicSharedCollection }
  /** Slug que no existe, revocado o vencido: los tres son la misma 404. */
  | { kind: 'missing' }
  /** El backend no respondió, o respondió algo que no es un DTO. */
  | { kind: 'error' };

/**
 * `cache()` de React deduplica el `fetch` entre la página y `generateMetadata`:
 * sin esto, cada render de la ruta hace **dos** requests al backend público.
 */
const fetchSharedCollection = cache(async (slug: string): Promise<FetchResult> => {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/s/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: REVALIDATE_SECONDS },
    });
  } catch {
    return { kind: 'error' };
  }

  // 410 también: hoy el backend devuelve 404 para revocado y vencido, pero si
  // mañana los distingue, la 410 tiene que seguir significando "no va a volver".
  if (response.status === 404 || response.status === 410) return { kind: 'missing' };
  if (!response.ok) return { kind: 'error' };

  const parsed = toPublicSharedCollection(await response.json().catch(() => null));
  return parsed ? { kind: 'ok', data: parsed } : { kind: 'error' };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await fetchSharedCollection(slug);
  if (result.kind !== 'ok') return { title: 'Colección compartida' };

  const { collectionName, ownerDisplayName, stats } = result.data;

  /*
   * Esto no es SEO: es el *unfurl* de WhatsApp, iMessage y Slack, que es donde
   * se abre de verdad un enlace compartido. Por eso el título lleva el nombre
   * de la colección y el del dueño, y la description el resumen con las cartas
   * y el valor: es lo único que se ve antes de entrar.
   */
  const description = `Colección de cartas Pokémon de ${ownerDisplayName}: ${stats.totalCards} cartas en ${stats.setsCount} ${pluralize(stats.setsCount, 'set', 'sets')}, valor total ${formatPrice(stats.totalValueUsd, 'USD')}.`;

  return {
    title: `${collectionName} · ${ownerDisplayName}`,
    description,
    openGraph: {
      title: `${collectionName} · ${ownerDisplayName}`,
      description,
      type: 'website',
    },
  };
}

export default async function SharedCollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await fetchSharedCollection(slug);

  if (result.kind === 'missing') notFound();

  if (result.kind === 'error') {
    return (
      <main
        id="contenido"
        className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-10 sm:px-6"
      >
        {/*
          Sin `onRetry`: no hay reintento en el lugar porque la data se pide en
          el server, y un botón que recarga la página desde cero no es un
          reintento. Lo que sí se ofrece es una salida (§10.2: qué pasó + qué
          hacer).
        */}
        <ErrorState
          className="w-full max-w-md"
          title="No pudimos cargar esta colección"
          message="Puede ser que el servidor no esté respondiendo. Probá de nuevo en un rato."
          supportingAction={
            <Link href={"/buscar"}>
              <Button variant="secondary">Ir al catálogo</Button>
            </Link>
          }
        />
      </main>
    );
  }

  return <PublicCollectionView data={result.data} />;
}
