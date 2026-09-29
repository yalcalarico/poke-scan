import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import type { CardDto } from '@/types/api';

import { CardTile, type CardTileVariant } from './card-tile';

export type CardGridVariant = CardTileVariant;

/**
 * Las dos grillas de §7.2. Son las mismas que usa el `CardGridSkeleton`, y
 * están duplicadas acá a propósito: el skeleton no puede importar de un
 * componente de `cards/` sin que un placeholder knowea del dominio de la carta.
 */
const GRIDS: Record<CardGridVariant, string> = {
  // 2 col en mobile porque el tile lleva nombre, set y precio (§7.2).
  catalog: 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  // 3 col y `gap-2`: el tile de colección es solo la imagen.
  collection: 'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8',
};

/** Cuántas celdas cargan con `priority`. 5 es lo que dice la referencia; lo que
 *  importa es que no sean todas: `priority` en una grilla entera mata el
 *  beneficio de `next/image` y adelanta el LCP a la última carta. */
const DEFAULT_PRIORITY_COUNT = 5;

export interface CardGridEntry {
  card: CardDto;
  /** Cantidad de esa carta. Solo se pinta si es > 1. */
  quantity?: number;
  /** Se pasa tal cual al `CardTile`. Omitido = la fila de precio no se dibuja. */
  priceUsd?: number | null;
  /**
   * Sufijo de la `key` cuando la misma carta aparece más de una vez.
   *
   * Hace falta en la colección: la misma carta con dos variantes (holofoil y
   * normal) son dos ítems con el mismo `card.id`, y con la `key` sola React
   * los confunde, reusa el nodo y el primer hover se queda pegado al
   * equivocado. La clave completa es `` `${card.id}-${index}` `` y con esto
   * pasa a ser `` `${card.id}-${key ?? index}` ``.
   */
  key?: string;
  action?: ReactNode;
  /**
   * Convierte la celda en activable sin navegar (abre el detalle del ítem en vez
   * de ir a la ficha). Se reenvía tal cual al `CardTile`.
   *
   * La alternativa era un `action` con un `IconButton` por celda, que además de
   * ser un objetivo de toque chico, se lleva un nodo por carta: en la colección
   * con 24 items por página son 24 botones que no hacen falta.
   */
  onSelect?: () => void;
  /** Piso del `sizes` de `next/image`, para grillas que no son las de §7.2. */
  sizes?: string;
}

/** Azúcar para el caso común: una lista de `CardDto` pelada. */
export function toCardGridEntries(cards: readonly CardDto[]): CardGridEntry[] {
  return cards.map((card) => ({ card }));
}

export interface CardGridProps {
  /**
   * Entradas explícitas. Tiene prioridad sobre `cards` cuando viene.
   *
   * Para catálogo, `cards` alcanza. Para colección, `entries`: cada ítem es su
   * propia entrada porque la cantidad y la variante son suyas, no de la carta.
   */
  entries?: readonly CardGridEntry[];
  /** Azúcar para `entries`: solo catálogo. */
  cards?: readonly CardDto[];
  variant?: CardGridVariant;
  /** Cuántas celdas van con `priority` (LCP). Default 5, o 0 en laColección. */
  priorityCount?: number;
  /** `ul`/`li` para vistas públicas (`/share/[slug]`), `div` para la app. */
  as?: 'div' | 'ul';
  /** Nombre accesible de la grilla, cuando hay más de una en la pantalla. */
  label?: string;
  /**
   * `sizes` por defecto de todas las celdas. Una entrada puede pisarlo con el
   * suyo; hace falta cuando la grilla no es una de §7.2.
   */
  sizes?: string;
  className?: string;
}

/**
 * La grilla de cartas. No es una lista de tarjetas con borde: es un **grid**,
 * y lo único que hace es elegir la grilla de §7.2 y delegar cada celda en el
 * `CardTile`.
 *
 * Cada celda lleva `data-card-index`. No es decorativo: `/buscar` lo usa para
 * bajarse a la primera carta nueva cuando carga una página más (§8.13), que
 * es un comportamiento que ningún amount de scroll restoration del browser
 * resuelve bien.
 *
 * @example
 * <CardGrid cards={cards} />
 *
 * @example
 * <CardGrid
 *   variant="collection"
 *   entries={items.map((item) => ({
 *     card: item.card,
 *     quantity: item.quantity,
 *     key: `${item.variant}-${item.condition}`,
 *   }))}
 * />
 */
export function CardGrid({
  entries,
  cards,
  variant = 'catalog',
  priorityCount,
  as = 'div',
  label,
  sizes,
  className,
}: CardGridProps) {
  const list: readonly CardGridEntry[] = entries ?? toCardGridEntries(cards ?? []);
  const resolvedPriority =
    priorityCount ?? (variant === 'catalog' ? DEFAULT_PRIORITY_COUNT : 0);
  const Tag = as === 'ul' ? 'ul' : 'div';
  const ItemTag = as === 'ul' ? 'li' : 'div';

  if (list.length === 0) return null;

  return (
    <Tag aria-label={label} className={cn(GRIDS[variant], className)}>
      {list.map((entry, index) => {
        const cell = (
          <CardTile
            card={entry.card}
            variant={variant}
            quantity={entry.quantity}
            priceUsd={entry.priceUsd}
            priority={index < resolvedPriority}
            action={entry.action}
            onSelect={entry.onSelect}
            sizes={entry.sizes ?? sizes}
          />
        );

        return (
          <ItemTag
            key={`${entry.card.id}-${entry.key ?? index}`}
            data-card-index={index}
            className="min-w-0"
          >
            {cell}
          </ItemTag>
        );
      })}
    </Tag>
  );
}
