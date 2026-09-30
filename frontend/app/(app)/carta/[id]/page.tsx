import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { CardTile } from '@/components/cards/card-tile';
import { SetLogo, SetSymbol } from '@/components/cards/set-media';
import { ScreenContainer } from '@/components/layout/screen-container';
import { ScreenHeader } from '@/components/layout/screen-header';
import { CardPriceSection } from '@/components/prices';
import { Badge, Surface } from '@/components/ui';
import { getApiBaseUrl } from '@/lib/api/api-client';
import { toCardDto, toCardList } from '@/lib/api/schema';
import { formatCardNumber, formatDate, pluralize } from '@/lib/format';
import { subtypeLabels, supertypeLabel, typeLabel } from '@/lib/pokemon';
import type { CardDto } from '@/types/api';

import { CardActions } from './actions';

/** Los datos de la carta no cambian: 1 h de caché alcanza. */
const REVALIDATE = 3600;

/** Cuántas cartas del set se traen para el scroller de "otras de este set". */
const RELATED_LIMIT = 14;

/**
 * Los metadatos de cartas y sets pueden vivir una hora en Next. Los precios no
 * pasan por esta función: el cliente consulta su endpoint con la frescura propia
 * del backend, pero ese request no bloquea el HTML de la ficha.
 */
async function fetchJson<T>(
  path: string,
  parse: (raw: unknown) => T | null,
): Promise<T | null> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: REVALIDATE },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`El servidor respondió con ${response.status} para ${path}`);
  }

  return parse(await response.json());
}

/* ─── Guards ───
 *
 * El backend devuelve `unknown` en la práctica: `apiFetch` castea, pero un
 * Server Component no puede confiar en eso. Los guards viven en
 * `lib/api/schema.ts` —son los mismos que usan el catálogo, el binder y la
 * colección compartida— y acá solo se decide qué hacer con un `null`: "tratar
 * como 404" en la carta y "tratar como lista vacía" en el precio y en el
 * scroller de relacionadas. Cero `as` en el camino de los datos (`AGENTS.md`,
 * regla 9 del build guide).
 */

async function fetchCard(id: string): Promise<CardDto | null> {
  return fetchJson(`/cards/${encodeURIComponent(id)}`, toCardDto);
}

async function fetchRelated(setId: string, excludeId: string): Promise<CardDto[]> {
  const params = new URLSearchParams({ setId, pageSize: String(RELATED_LIMIT + 1) });
  try {
    const cards = await fetchJson(`/cards/search?${params.toString()}`, toCardList);
    if (!cards) return [];
    // Una carta más que el límite para poder cortar sin quedarnos a corto en el
    // medio de la tanda.
    return cards.filter((card) => card.id !== excludeId).slice(0, RELATED_LIMIT);
  } catch {
    // Es contenido complementario: si el scroller no se puede cargar, la ficha se
    // muestra igual. Perderlo no puede tumbar la pantalla.
    return [];
  }
}

async function RelatedCardsSection({
  setId,
  excludeId,
  setName,
}: {
  setId: string;
  excludeId: string;
  setName: string;
}) {
  // El fetch vive **adentro** de la frontera y no se le pasa la promesa ya
  // creada desde el padre: es el patrón de App Router para contenido
  // complementario. Con la promesa afuera, el cuerpo de la página la dispara
  // aunque la frontera nunca llegue a renderizarse —un `notFound()` o un error
  // más arriba— y queda una request al catálogo local sin nadie esperando su
  // respuesta.
  const related = await fetchRelated(setId, excludeId);
  if (related.length === 0) return null;

  return (
    <section aria-labelledby="otras-del-set" className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <h2 id="otras-del-set" className="text-h3 text-primary">
          Otras de este set
        </h2>
        <Link
          href={`/buscar?setId=${encodeURIComponent(setId)}`}
          className="inline-flex items-center gap-1 rounded-control text-label text-brand transition-colors duration-fast ease-standard hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
        >
          Ver el set
          <ArrowRight aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
        </Link>
      </div>

      <p className="mt-0.5 text-caption text-tertiary">
        {setName} · {pluralize(related.length, 'carta', 'cartas')}
      </p>

      {/*
        El scroller complementa la ficha; queda debajo de sus datos para que una
        respuesta lenta no bloquee la parte que el usuario vino a consultar.
        `py-1` conserva el aire del indicador de foco que overflow-x recorta.
      */}
      <ul role="list" className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
        {related.map((relatedCard) => (
          <li key={relatedCard.id} className="w-24 shrink-0">
            <CardTile card={relatedCard} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const card = await fetchCard(id);
  if (!card) return { title: 'Carta no encontrada' };

  const setName = card.set?.name ?? card.setId;
  const description = `${card.name} — ${setName} · ${card.rarity ?? 'rareza desconocida'}`;

  return {
    title: card.name,
    description,
    alternates: { canonical: `/carta/${encodeURIComponent(id)}` },
    openGraph: {
      title: card.name,
      description,
      images: card.imageLarge ? [{ url: card.imageLarge }] : undefined,
    },
  };
}

/**
 * Una fila del `dl` de datos. Es un `<div>` dentro del `<dl>`, que es lo que la
 * spec de HTML permite agrupar entre `dt` y `dd`. No es un `StatRow`: ese es una
 * fila de acción con chevron (§8.7) y estos datos no son clickeables.
 *
 * Sin prop `className` a propósito: `cn()` resolvería por grupos, y `text-body`
 * (utilidad propia de §3.1) cae en el mismo grupo que `text-primary`, así que
 * una clase de color que llegue por prop se comería el tamaño. El
 * `break-words` evita el desborde horizontal en los valores largos.
 */
function DataRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line-subtle py-2.5 last:border-0">
      <dt className="shrink-0 text-label text-tertiary">{label}</dt>
      <dd className="min-w-0 break-words text-right text-body text-primary">{value}</dd>
    </div>
  );
}

export default async function CardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const card = await fetchCard(id);
  if (!card) notFound();

  const set = card.set ?? null;
  const setTotal = set?.total ?? set?.printedTotal ?? null;
  const image = card.imageLarge || card.imageSmall;
  const setName = set?.name ?? card.setId;
  const alt = `Carta ${card.name}${card.rarity ? ` ${card.rarity}` : ''} del set ${setName}`;
  const types = card.types.map(typeLabel);
  const subtypes = subtypeLabels(card.subtypes);

  return (
    <>
      <ScreenHeader
        title={card.name}
        subtitle={setName}
        back={{ href: `/buscar`, label: 'el catálogo' }}
      />

      <ScreenContainer labelledBy="titulo-carta">
        {/*
          El nombre ya está en el `ScreenHeader` y ahí se trunca, así que el `h1`
          de la página es invisible: duplicarlo en pantalla sería leerlo dos veces
          seguidas. Lo que no puede faltar es el heading real, que es lo que
          ancla el `aria-labelledby` del `<main>` y el modo de lector de pantalla.
        */}
        <h1 id="titulo-carta" className="sr-only">
          {card.name}
        </h1>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          <div className="flex flex-col items-center gap-5">
            <div className="relative w-full max-w-xs">
              {image ? (
                <div className="overflow-hidden rounded-surface shadow-xl">
                  <Image
                    src={image}
                    alt={alt}
                    width={420}
                    height={588}
                    sizes="(max-width: 767px) 78vw, 40vw"
                    className="h-auto w-full"
                    priority
                  />
                </div>
              ) : (
                <div
                  role="img"
                  aria-label={alt}
                  className="grid aspect-[63/88] w-full place-items-center rounded-surface bg-surface-2 text-center text-caption text-tertiary"
                >
                  Sin imagen
                </div>
              )}

              {/*
                La píldora de la referencia. Va **encima** de la esquina, no
                tapando el número impreso de la carta: es chrome, no dato.
              */}
              <Badge tone="brand" className="absolute -top-2 right-2 shadow-md">
                En vivo
              </Badge>
            </div>

            {set ? <SetLogo logoUrl={set.logoUrl} name={set.name} className="max-w-40" /> : null}
          </div>

          <div className="flex flex-col gap-5">
            {/* La carga del precio vive en cliente: un refresh externo lento no
                retrasa el render de la carta, y el hero muestra su skeleton. */}
            <CardPriceSection key={`${card.id}:price`} cardId={card.id} />

            <CardActions key={`${card.id}:actions`} cardId={card.id} cardName={card.name} />

            <Surface as="section" padded={false} className="px-4 py-1">
              <h2 className="sr-only">Datos de la carta</h2>
              <dl>
                <DataRow
                  label="Set"
                  value={
                    set
                      ? `${set.name}${set.series ? ` · ${set.series}` : ''}`
                      : card.setId
                  }
                />
                {set?.symbolUrl ? (
                  <DataRow
                    label="Símbolo"
                    value={<SetSymbol symbolUrl={set.symbolUrl} name={set.name} />}
                  />
                ) : null}
                <DataRow label="Número" value={formatCardNumber(card.number, setTotal)} />
                <DataRow label="Rareza" value={card.rarity} />
                <DataRow label="Supertipo" value={supertypeLabel(card.supertype)} />
                <DataRow
                  label="Tipo"
                  value={types.length > 0 ? types.join(' · ') : null}
                />
                <DataRow label="HP" value={card.hp ? `${card.hp} HP` : null} />
                <DataRow
                  label="Subtipos"
                  value={subtypes.length > 0 ? subtypes.join(' · ') : null}
                />
                <DataRow label="Artista" value={card.artist} />
                <DataRow label="Lanzamiento" value={formatDate(set?.releaseDate)} />
              </dl>
            </Surface>
          </div>
        </div>

        {/*
          La frontera envuelve **solo** el scroller de relacionadas, que es
          contenido complementario: el nombre, la imagen, los datos y el precio
          no dependen de él. Por eso el fallback es `null` y no un skeleton —no
          hay un hueco que tapar—.

          El `key` no es decorativo: la navegación entre dos cartas es una
          transición, y React mantiene el contenido anterior en pantalla
          mientras el nuevo resuelve en vez de volver al fallback. Sin cambiar la
          key, las "otras de este set" de la carta A quedarían pegadas arriba de
          la carta B. Con la key, la frontera es un nodo nuevo: fallback primero
          y después el contenido de la carta que se está viendo.
        */}
        <Suspense key={card.id} fallback={null}>
          <RelatedCardsSection setId={card.setId} excludeId={card.id} setName={setName} />
        </Suspense>
      </ScreenContainer>
    </>
  );
}
