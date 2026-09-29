import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, Layers } from 'lucide-react';

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
 * Cuando `CollectionDto` traiga `cover: [{ imageSmall, cardId }]`, con `cardId`
 * para poder enlazar a la ficha, acá solo se declara `imageSmall`: el `cardId` no
 * se usa para pintar el mosaic, y un tipo más angosto sigue aceptando el objeto
 * más ancho (tipado estructural). Cuando llegue, hay que **borrar el fallback de
 * marca** y nada más.
 */
export interface CollectionCoverItem {
  imageSmall: string;
}

export interface CollectionCardProps {
  collection: CollectionDto;
  /**
   * Portada de la colección. **Hoy siempre viene `undefined`**: `CollectionDto`
   * no expone `cover` y traer 4 items por colección sería un N+1, que
   * `AGENTS.md` prohíbe explícitamente.
   *
   * Cuando el DTO lo exponga: pasarlo desde el listado y **borrar el bloque
   * `hasCover ? mosaic : marca`** de abajo. El endpoint a tocar es
   * `GET /api/collections` (`collections.service.ts::list`, que ya hace **un**
   * `$queryRaw` agregado por `aggregateQuery`): el mosaic sale de un
   * `DISTINCT ON (collectionId)` sobre `collection_items` ordenado por
   * `quantity DESC`, sin una consulta por colección.
   */
  cover?: readonly CollectionCoverItem[];
  /** Solo para ubicación. La forma la decide el componente. */
  className?: string;
}

/**
 * Cuántas miniaturas y cómo se reparten en la grilla de 2×2.
 *
 * Los huecos se resuelven estirando la primera: con 1 no hay grilla (una sola
 * fila, la imagen toma todo), con 2 son dos mitades verticales, con 3 es la de la
 * izquierda completa y dos apiladas a la derecha, con 4 la grilla llena. Es el
 * collage que muestra la referencia y nunca deja un hueco negro.
 *
 * Los `col-span-2` de la fila 1 dependen de que el contenedor declare
 * `grid-rows-1` cuando hay una sola imagen: si declarara dos filas, el `span` de
 * columnas quedaría con la mitad del alto.
 */
const COVER_LAYOUT: Record<number, readonly string[]> = {
  1: ['col-span-2'],
  2: ['row-span-2', 'row-span-2'],
  3: ['row-span-2', '', ''],
  4: ['', '', '', ''],
};

const MAX_COVER_ITEMS = 4;

/**
 * La tarjeta de `/colecciones`: portada, nombre, cantidad de cartas y el
 * valor total. Antes la misma tarjeta tenía tres `Stat` con borde propio para
 * mostrar el dato que hoy dice «24 cartas».
 *
 * ## El mosaic
 *
 * Es el salto visual más grande de la pantalla y **todavía no se puede
 * construir**: `CollectionDto` no trae portada y pedir 4 items por colección es
 * un N+1 (`AGENTS.md`, "Cero N+1"). Con `cover` ausente se dibuja una superficie
 * de marca —`bg-brand-soft` con `Layers`— que se ve deliberada en vez de rota.
* El día que el DTO exponga el campo, se pasa el array y se borra el fallback;
 * la prop ya está escrita para eso.
 *
 * ## Por qué el `outline` del foco va hacia adentro
 *
 * El `Link` llena la `Surface` entera, y la `Surface` es `overflow-hidden` (para
 * que el mosaic respete el radio). Un `outline` con `offset-2` —el patrón de
 * `Button`, `Chip` y `Select`— se dibuja 4 px por fuera de la caja, o sea
 * completamente afuera de la `Surface`, y lo recorta el `overflow-hidden` de la
 * propia `Surface`: el indicador de foco no se vería.
 *
 * Por eso acá el offset va **negativo**. Es el mismo rodeo que ya usa la fila
 * del buscador del `Select` (`select.tsx:136`), que también vive dentro de un
 * `overflow-hidden`: se dibuja 2 px adentro del borde de la tarjeta, que es
 * justo donde el ojo lo espera en una card.
 */
export function CollectionCard({ collection, cover, className }: CollectionCardProps) {
  const titleId = `coleccion-${collection.id}`;
  const images = (cover ?? []).slice(0, MAX_COVER_ITEMS);
  const hasCover = images.length > 0;
  const layout = COVER_LAYOUT[images.length] ?? [];

  return (
    <Surface as="article" padded={false} interactive className={cn('overflow-hidden', className)}>
      <Link
        href={`/colecciones/${encodeURIComponent(collection.id)}`}
        aria-labelledby={titleId}
        className="flex h-full flex-col focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
      >
        {hasCover ? (
          <div
            className={cn(
              'grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-0.5 bg-surface-2',
              images.length === 1 && 'grid-rows-1',
            )}
          >
            {images.map((image, index) => (
              <div key={`${image.imageSmall}-${index}`} className={cn('relative', layout[index])}>
                <Image
                  src={image.imageSmall}
                  // El nombre de la colección ya está en el texto de abajo: un
                  // alt con la carta sería leer la misma pantalla dos veces.
                  alt=""
                  fill
                  sizes="(max-width: 639px) 92vw, (max-width: 1023px) 45vw, 30vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid aspect-[4/3] place-items-center bg-brand-soft text-brand">
            <Layers aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-8 w-8" />
          </div>
        )}

        <div className="flex flex-1 flex-col gap-1 p-4">
          {/*
            `min-w-0` en el nombre y `shrink-0` en el badge: sin el primero el
            `<p>` no baja de su ancho de contenido y el `truncate` no recorta
            nada en un flex row.
          */}
          <div className="flex min-w-0 items-center gap-2">
            <p id={titleId} className="min-w-0 truncate text-body-strong text-primary" title={collection.name}>
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
      </Link>
    </Surface>
  );
}
