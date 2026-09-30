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
 * La tarjeta de `/colecciones`: portada, nombre, cantidad de cartas, valor
 * total y el acceso al progreso por set. Antes la misma tarjeta tenía tres
 * `Stat` con borde propio para mostrar el dato que hoy dice «24 cartas».
 *
 * ## El mosaico
 *
 * Es el salto visual más grande de la pantalla, y usa el `cover` que ya arma
 * `collections.service.ts::list` con **un** `$queryRaw` agregado para todas las
 * colecciones del listado. Traer la portada no es un N+1.
 *
 * El fallback de marca —`bg-brand-soft` con `Layers`— sigue existiendo para la
 * colección sin cartas, que es el único caso en que `cover` llega vacío. Se ve
 * deliberada en vez de rota.
 *
 * ## Por qué el `outline` del foco va hacia adentro
 *
 * El `Link` llega al borde de la `Surface` en los tres lados de arriba —arriba,
 * izquierda y derecha— y la `Surface` es `overflow-hidden` (para que el mosaic
 * respete el radio). Un `outline` con `offset-2` —el patrón de `Button`, `Chip`
 * y `Select`— se dibuja 4 px por fuera de la caja, o sea completamente afuera
 * de la `Surface`, y lo recorta el `overflow-hidden` de la propia `Surface`: el
 * indicador de foco no se vería.
 *
 * Por eso acá el offset va **negativo**. Es el mismo rodeo que ya usa la fila
 * del buscador del `Select` (`select.tsx:136`), que también vive dentro de un
 * `overflow-hidden`: se dibuja 2 px adentro del borde de la tarjeta, que es
 * justo donde el ojo lo espera en una card. El `rounded-t-surface` acompaña al
 * offset negativo: sin radio, el indicador de la parte de arriba saldría con
 * esquinas vivas contra una tarjeta de 16 px.
 *
 * El link del pie, en cambio, vive **adentro** con `p-2` alrededor, así que ahí
 * el `outline` va hacia afuera con los 4 px de aire de §4.4. El criterio es el
 * de §8.6: si el ancestro recorta, adentro; si no, afuera.
 *
 * ## La franja de abajo es la entrada al progreso por set
 *
 * `/colecciones/[id]/sets` —el progreso por set y el binder con el waffle— era
 * alcanzable **solo** desde el chip "Sets" que vive adentro del detalle de una
 * colección ya abierta. O sea: la ruta existía y no había forma de llegar sin
 * saber que existía. Agregar otro destino principal a la `BottomNav` no era la
 * decisión de esa feature (hoy Inicio más cuatro secciones en mobile), y una
 * pantalla nueva es una decisión de rutas.
 *
 * El pie de la tarjeta es el lugar donde el usuario ya está pensando en esa
 * colección concreta: es el único punto de `/colecciones` donde la respuesta a
 * "¿cuánto completé de este set?" se puede responder sin abrirla primero. Va
 * siempre, también con la colección vacía, porque la pantalla de destino tiene
 * su propio estado vacío y ahí es donde se explica.
 *
 * ## Por qué el `Link` principal no envuelve a este
 *
 * Un `<a>` dentro de otro `<a>` es HTML inválido y rompe la navegación por
 * teclado y el anuncio del lector de pantalla. Por eso la `Surface` se parte en
 * dos hermanos: el link grande (portada, nombre, cantidad y valor) y el link
 * chico del pie. Se pierde el "toda la card es el target", y a cambio el pie
 * puede ser un destino propio de 44 px —que es lo que §0.5 exige— en vez de un
 * punto de 20 px pegado al valor.
 */
export function CollectionCard({ collection, cover, className }: CollectionCardProps) {
  const titleId = `coleccion-${collection.id}`;
  const images = (cover ?? []).slice(0, MAX_COVER_ITEMS);
  const hasCover = images.length > 0;
  const layout = COVER_LAYOUT[images.length] ?? [];

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
