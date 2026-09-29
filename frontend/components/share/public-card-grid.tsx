'use client';

import { CardGrid, type CardGridEntry } from '@/components/cards/card-grid';
import { formatCount } from '@/components/collections/collection-options';
import { Button } from '@/components/ui';
import { useChunkedList } from '@/components/set-progress/use-chunked-list';
import { pluralize } from '@/lib/format';
import type { PublicSharedCollection } from '@/lib/api/share';

/**
 * Cuántas cartas se pintan por tanda.
 *
 * 60 es el mismo número que el binder, y el cálculo es el mismo: un viewport de
 * 390 × 844 muestra ~20 tiles de esta grilla (3 columnas en mobile, 8 en
 * `xl:`), así que 60 son dos pantallas y media de margen para que el sentinel con
 * 600 px de `rootMargin` traiga la tanda siguiente **antes** de que el usuario
 * llegue al final. Nunca ve un hueco.
 *
 * ## Por qué trocear y no `content-visibility: auto`
 *
 * El razonamiento es el que `binder-view.tsx` escribe para los 300 slots de un
 * set y que aplica igual acá:
 *
 * 1. `content-visibility: auto` con `contain-intrinsic-size` hace que el browser
 *    se salte layout y paint de lo que está fuera de pantalla, pero el grid deja
 *    de tener altura calculada hasta que cada celda entra en pantalla. Chrome y
 *    Safari recalculan el `scrollHeight` de a 20 celdas por vez y el scroll da
 *    saltos.
 * 2. Peor: el **find-in-page deja de encontrar** las cartas que no se pintaron.
 *    Una colección compartida de 500 cartas tiene que poder buscarse con Ctrl+F,
 *    y una búsqueda que devuelve cero resultados sin explicación es el peor
 *    resultado posible en una pantalla abierta desde un link de WhatsApp.
 * 3. Trocear resuelve lo mismo de forma predecible: el DOM nunca pasa de 120
 *    tiles y la altura de la grilla está siempre calculada.
 *
 * ## Por qué es acumulativo y no una ventana deslizante
 *
 * Una ventana que descarta las filas de arriba rompe el scroll de golpe, que es
 * peor que tener 500 nodos. Con 500 items el pico es de 120 tiles en el DOM, que
 * es lo que ya acepta `/colecciones/[id]` con 240.
 */
const PUBLIC_CHUNK = 60;

export interface PublicCardGridProps {
  items: PublicSharedCollection['items'];
  label: string;
}

/**
 * La grilla de cartas de una colección compartida, troceada.
 *
 * ## Por qué un wrapper client y no `CardGrid` directo
 *
 * `CardGrid` es un **Server Component** (no tiene estado, efectos ni handlers) y
 * `/share/[slug]` también lo es: la página lee el link con un `fetch` y no tiene
 * por qué hidratar para pintar 500 imágenes. Trocear necesita `useState` (cuántas
 * se pintan) y un `IntersectionObserver`, así que el troceo tiene que vivir en un
 * hijo.
 *
 * Es la misma separación que `CardResults` en `/buscar`: la pantalla decide qué
 * es una carta y el hijo decide cuántas se dibujan.
 */
export function PublicCardGrid({ items, label }: PublicCardGridProps) {
  /*
   * Las entradas se arman acá y no en el servidor, porque `useChunkedList` corta
   * un **array de entradas**, no un `CollectionItemDto`: lo que se pagina es lo
   * que se pinta.
   */
  const entries: CardGridEntry[] = items.map((item) => ({
    card: item.card,
    quantity: item.quantity,
    // La misma carta puede estar dos veces con variantes distintas (holofoil y
    // normal), y la `key` sola las confunde: React reusa el nodo y el primer
    // hover se queda pegado al equivocado. Es el mismo sufijo que usa
    // `collection-detail.tsx`.
    key: `${item.variant}-${item.condition}-${item.id}`,
  }));

  const { visible, hasMore, showMore, sentinelRef } = useChunkedList(
    entries,
    PUBLIC_CHUNK,
    // La `resetKey` es el slug implícito: la lista no cambia de identidad mientras
    // el visitante no navegue, y si mañana esta grilla se reusara con otro link
    // la key tiene que llevar el id. Hoy alcanza con la longitud.
    String(items.length),
  );

  const remaining = items.length - visible.length;

  return (
    <div className="flex flex-col gap-4">
      <CardGrid as="ul" variant="collection" label={label} entries={visible} />

      {hasMore ? (
        <div ref={sentinelRef} className="flex justify-center">
          {/*
            El botón y el `IntersectionObserver` del hook apuntan al mismo
            `showMore`: el observer adelanta 600 px y el botón es el que queda si
            el browser no tiene `IntersectionObserver`, y el que el usuario puede
            apretar a propósito.
          */}
          <Button variant="secondary" size="lg" onClick={showMore}>
            {formatCount(remaining)} {pluralize(remaining, 'carta más', 'cartas más')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
