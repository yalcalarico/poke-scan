import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, Grid3x3, Layers } from 'lucide-react';

import { Money } from '@/components/cards/money';
import { Badge, Surface } from '@/components/ui';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';
import type { CollectionDto } from '@/types/api';

import { formatCount } from './collection-options';

/**
 * Una miniatura de la portada. Solo la imagen: el nombre de la carta no interesa
 * acá, y el nombre de la colección ya está en el texto de la tarjeta.
 *
 * ## Por qué el tipo es más angosto que el campo del backend
 *
 * `CollectionDto.cover` trae `{ imageSmall, cardId }`. Acá solo se declara
 * `imageSmall`: el `cardId` no se usa para pintar el mosaico, y un tipo más
 * angosto sigue aceptando el objeto más ancho (tipado estructural).
 */
export interface CollectionCoverItem {
  imageSmall: string;
}

export interface CollectionCardProps {
  collection: CollectionDto;
  /**
   * Portada de la colección, de `CollectionDto.cover`.
   *
   * El backend lo arma con **un** `$queryRaw` agregado sobre `collection_items`
   * (`DISTINCT ON (collectionId)` ordenado por `quantity DESC`) para todas las
   * colecciones del listado, así que traer la portada no es un N+1
   * (`AGENTS.md`, "Cero N+1"). Viene `[]` en una colección sin cartas, y ahí
   * entra el fallback de marca.
   */
  cover?: readonly CollectionCoverItem[];
  /** Solo para ubicación. La forma la decide el componente. */
  className?: string;
}

export function CollectionCard({ collection, cover, className }: CollectionCardProps) {
  const titleId = `coleccion-${collection.id}`;
  const images = (cover ?? []).slice(0, 4);
  const hasCover = images.length > 0;

  return (
    <Surface
      as="article"
      padded={false}
      interactive
      className={cn('flex flex-col overflow-hidden', className)}
    >
      <Link
        href={`/colecciones/${encodeURIComponent(collection.id)}`}
        aria-labelledby={titleId}
        className="flex flex-1 flex-col rounded-t-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
      >
        <div className="flex flex-1 flex-col gap-1 p-4">
          {/*
            `min-w-0` en el nombre y `shrink-0` en el badge: sin el primero el
            `<p>` no baja de su ancho de contenido y el `truncate` no recorta
            nada en un flex row.
          */}
          <div className="flex min-w-0 items-center gap-2">
            <p id={titleId} className="min-w-0 flex-1 break-words text-body-strong text-primary" title={collection.name}>
              {collection.name}
            </p>
            {collection.isDefault ? (
              <Badge tone="brand" className="shrink-0">
                Principal
              </Badge>
            ) : null}
          </div>

          <p className="text-caption text-tertiary tabular-nums">
            {formatCount(collection.itemCount)} {pluralize(collection.itemCount, 'carta', 'cartas')}
          </p>

          <p className="text-caption text-secondary tabular-nums">
            {formatCount(collection.uniqueCount)} únicas · {formatCount(collection.duplicateCount)} duplicadas
          </p>

          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <Money usd={collection.totalValueUsd} tone="positive" size="md" />
            <ChevronRight
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
              className="h-4 w-4 shrink-0 text-tertiary"
            />
          </div>
        </div>
        {hasCover ? <div className="flex h-40 items-center justify-center gap-2 bg-surface-2 p-3">
          {images.map((image, index) => <div key={`${image.imageSmall}-${index}`} className="relative h-full min-w-0 flex-1">
            <Image src={image.imageSmall} alt="" fill sizes="(max-width: 639px) 22vw, 10vw" className="object-contain" />
          </div>)}
        </div> : <div className="flex min-h-32 flex-col items-center justify-center gap-2 bg-brand-soft p-4 text-brand">
          <Layers aria-hidden="true" className="size-8" /><p className="text-caption text-secondary">Tus cartas van a aparecer acá</p>
        </div>}
      </Link>

      {/*
        El `p-2` no es decoración: son los 4 px de aire que el `outline` con
        `offset-2` necesita hacia afuera (§4.4). La `Surface` es
        `overflow-hidden`, así que sin ese padding el indicador del link de abajo
        se cortaría contra el borde de la tarjeta en los cuatro lados. Y el
        `min-h-11` son los 44 px de §0.5: es un destino propio, no una etiqueta.

        El `aria-label` arranca con el texto visible ("Progreso por set") y le
        suma el nombre de la colección, que es lo que le falta para distinguirse
        de los otros links de la grilla cuando un lector de pantalla los lista
        fuera de contexto.
      */}
      <div className="border-t border-line-subtle p-2">
        <Link href="/escanear" aria-label={`Sumar cartas a ${collection.name}`} className="mb-2 flex min-h-11 items-center justify-center gap-2 rounded-control border border-brand bg-brand-soft text-label text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]">Sumar cartas</Link>
        <Link
          href={`/colecciones/${encodeURIComponent(collection.id)}/sets`}
          aria-label={`Progreso por set de ${collection.name}`}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-control text-label text-secondary transition-colors duration-fast ease-standard hover:bg-surface-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
        >
          <Grid3x3 aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
          Progreso por set
        </Link>
      </div>
    </Surface>
  );
}
