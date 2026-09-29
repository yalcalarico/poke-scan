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
  /**
   * La celda está elegida en un modo de selección múltiple.
   *
   * Solo se usa en `/colecciones/[id]`, y solo cuando la fila activó el modo
   * (`showSelection`). Fuera de ese caso, la grilla es la de siempre: sin
   * casillas, sin overlay y sin un tabulador más de lo que ya había.
   *
   * El estado va en la entrada y no en un `Set` del `CardGrid`: la grilla no
   * sabe qué cartas existen ni qué significa "seleccionada", solo la pinta.
   */
  isSelected?: boolean;
  /**
   * Alterna la selección de esta celda. **Reemplaza** a `onSelect` cuando la
   * grilla está en modo selección (ver `showSelection`).
   *
   * Va en la entrada y no como prop del `CardGrid` porque la grilla no sabe qué
   * carta es cada celda: sabe el índice, y el índice no es un id.
   */
  onToggleSelect?: () => void;
  /**
   * Texto que se anuncia **cuando la celda está elegida**, y solo entonces.
   *
   * Es el nombre accesible del estado, no del tile: un lector de pantalla que
   * recorre 24 celdas necesita oír "elegida" en las que lo están, y no necesita
   * oír "no elegida" 24 veces. El `aria-pressed` del botón del tile ya cubre el
   * otro lado del estado, así que los dos no se anuncian duplicados.
   *
   * Viene del consumidor porque el texto que identifica una carta depende de la
   * pantalla: en la colección es la variante y la condición, en un selector sería
   * otra cosa.
   */
  selectionLabel?: string;
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
  /**
   * Modo selección: cada celda dibuja su estado de elegida y **deja de ser
   * activable por sí misma** (el `onSelect` se ignora).
   *
   * ## Por qué el click del tile cambia de significado y no desaparece
   *
   * En modo selección, tocar la casilla es lo que elige. Tocar el resto del tile
   * también la elige, porque una lista de casillas donde el resto del card es
   * área muerta es la forma más rápida de que un usuario选了 veinte cartas sin
   * querer: el objetivo grande es el card, y el dedo va al card.
   *
   * Y **no** queda el `onSelect` de abrir el `ItemSheet`: en modo selección
   * abrir un formulario por tocar una carta es una sorpresa, y el `Sheet` tiene
   * focus trap (§8.9), o sea que la lista quedaría detrás de un `inert` y el
   * usuario no puede seguir seleccionando sin cerrarlo primero. Volver atrás
   * cancela la selección y es lo que hace el botón "Cancelar".
   *
   * ## Por qué el control real no está en el tile
   *
   * El `Checkbox` de cada celda es **decorativo** (`aria-hidden`): es un
   * `<span>` dibujado en la esquina de la imagen, no un `<input>`. El control de
   * verdad es la fila de la colección (el "Seleccionar todas" con
   * `indeterminate`) y el hecho de que tocar el card alternate el estado.
   *
   * La razón es la que `card-tile.tsx` documenta al largo: un `<button>` o un
   * `<input>` adentro del `<button>`/`<Link>` del tile es HTML inválido, y en un
   * navegador real el toque dispara las dos cosas. Poner el checkbox **fuera**,
   * en el `action`, lo haría válido pero confuso (dos controles hermanos del
   * mismo card, uno de 20 px), y en una grilla de 8 columnas el `action` suma una
   * fila de alto por celda.
   *
   * El texto que acompaña al estado ("12 de 48 seleccionadas") es lo que le da
   * al conjunto su nombre, así que el estado individual no necesita anunciarse:
   * el lector de pantalla ya sabe cuántas hay y que está en modo selección.
   */
  showSelection?: boolean;
  /**
   * Nombre accesible de la grilla, cuando hay más de una en la pantalla.
   *
   * Solo se anuncia si el contenedor tiene semántica de lista, y las dos ramas
   * la tienen: `as="ul"` por el elemento nativo, `as="div"` por el `role="list"`
   * que agrega el componente. Ver el bloque del render.
   */
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
 * es un comportamiento que ningún amount of scroll restoration del browser
 * resuelve bien.
 *
 * ## Las dos ramas del `as`, y por qué difieren
 *
 * `as` no es solo el nombre del elemento: decide **cómo se nombra la grilla**.
 *
 * - `as="ul"` (la vista pública, `/share/[slug]`): el elemento ya es una lista,
 *   el `<li>` ya es un ítem de lista, y `aria-label` sobre `<ul>` sí se
 *   anuncia. No se le pone ningún `role`: sería redundante, y lo peor es que un
 *   `role="list"` explícito sobre un `<ul>` puede llegar a **deshabilitar** las
 *   listas navegables nativas del lector (VoiceOver lo respeta en el modo
 *   completo y anuncia la lista como un grupo plano). O sea, "arreglar" la
 *   variante `ul` rompiendo justamente lo que ya funcionaba.
 * - `as="div"` (todo lo demás, 3 de 4 call sites): un `div` es un elemento
 *   genérico y la spec ignora el `aria-label` salvo que haya un rol. "Resultados
 *   de la búsqueda" y "Cartas de la colección" no se anunciaban. Por eso esta
 *   rama se declara `role="list"` y cada celda `role="listitem"`: el `label`
 *   aterriza, y además la grilla pasa a ser navegable con la tecla de listas,
 *   que en 24 cartas es la diferencia entre recorrer la pantalla y saltar de a
 *   un ítem.
 *
 * Sigue siendo un Server Component: `role` es un atributo del DOM, no estado.
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
  showSelection = false,
  className,
}: CardGridProps) {
  const list: readonly CardGridEntry[] = entries ?? toCardGridEntries(cards ?? []);
  const resolvedPriority =
    priorityCount ?? (variant === 'catalog' ? DEFAULT_PRIORITY_COUNT : 0);

  /*
   * Las dos ramas explícitas, y no una interpolación condicional del rol: es lo
   * que deja claro que en `ul` los roles sobran (y estorban, ver el bloque del
   * JSDoc) y que en `div` son los que hacen que el `aria-label` exista.
   */
  const isNativeList = as === 'ul';
  const Tag = isNativeList ? 'ul' : 'div';
  const ItemTag = isNativeList ? 'li' : 'div';
  const listRole = isNativeList ? undefined : 'list';
  const itemRole = isNativeList ? undefined : 'listitem';

  if (list.length === 0) return null;

  return (
    <Tag
      role={listRole}
      aria-label={label}
      className={cn(GRIDS[variant], className)}
    >
      {list.map((entry, index) => {
        const isSelected = showSelection && entry.isSelected === true;

        const cell = (
          <CardTile
            card={entry.card}
            variant={variant}
            quantity={entry.quantity}
            priceUsd={entry.priceUsd}
            priority={index < resolvedPriority}
            action={entry.action}
            /*
              En modo selección el `onSelect` se ignora y lo que decide el estado
              es la fila: ver el bloque de `showSelection`. Pasarlo siempre
             fuera lo que hace que un toque abra un `Sheet` con focus trap en
              medio de una selección múltiple.
            */
            onSelect={showSelection ? entry.onToggleSelect : entry.onSelect}
            isSelected={isSelected}
            selectionLabel={isSelected ? entry.selectionLabel : undefined}
            sizes={entry.sizes ?? sizes}
          />
        );

        return (
          <ItemTag
            key={`${entry.card.id}-${entry.key ?? index}`}
            role={itemRole}
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
