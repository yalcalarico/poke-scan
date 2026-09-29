'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Margen con el que se adelanta la carga, el mismo de `useInfiniteList`: el
 * centinela no necesita verse para disparar.
 */
const ROOT_MARGIN_PX = 600;

export interface ChunkedList<T> {
  /** Los primeros `visible` elementos. Es un slice, no una copia del array. */
  visible: readonly T[];
  hasMore: boolean;
  showMore: () => void;
  /** Ref del centinela, para el `IntersectionObserver`. */
  sentinelRef: (element: HTMLElement | null) => void;
}

/**
 * Paginación de **render** sobre un array que ya está en memoria.
 *
 * `useInfiniteList` pagina requests; esta pagina filas. Hace falta porque el
 * binder de un set de 300 cartas tiene las 300 en el cliente (el backend ya las
 * mandó) y pintarlas de golpe son 300 subárboles de `CardTile` — imagen, link y
 * badge cada uno — para un viewport que muestra 20.
 *
 * Es un hook y no un `useState` con un `slice` en el JSX por dos cosas:
 *
 * - el sentinel de `IntersectionObserver` necesita un ref y una limpieza, que
 *   es el mismo código que ya existe en `useInfiniteList`;
 * - `resetKey` resuelve el "volví a la vista anterior y seguís 200 filas más
 *   abajo" en el render y no en un efecto (gotchas #2: un `setState` en un
 *   efecto es un render en cascada).
 *
 * ## Por qué no `useInfiniteList`
 *
 * Porque el hook pide páginas por red y necesita un `Paginated<T>` de vuelta.
 * Acá la "página" es un trozado de un array que no se vuelve a pedir, y hacer
 * pasar un array por el hook sería mentirle sobre lo que hace.
 *
 * @example
 * const { visible, hasMore, showMore, sentinelRef } = useChunkedList(
 *   slots,
 *   BINDER_CHUNK,
 *   `${setId}|${mode}`,
 * );
 */
export function useChunkedList<T>(items: readonly T[], chunk: number, resetKey: string): ChunkedList<T> {
  const [visible, setVisible] = useState(chunk);
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);

  /*
   * El reset se ajusta en el render y no en un efecto, con el mismo patrón que
   * `ItemSheet`: si el criterio cambió (otra vista del binder, otro chip), la
   * lista arranca por el primer chunk. Es un render extra y no una cascada, y
   * garantiza que nunca se pinten 300 filas del set anterior.
   */
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setVisible(chunk);
  }

  // Si la lista se acortó (un filtro que deja menos filas que las pintadas), el
  // `slice` ya no alcanza y el botón de "cargar más" no tendría sentido.
  const limit = Math.min(visible, items.length);
  const hasMore = items.length > limit;

  const showMore = useCallback(() => {
    setVisible((current) => Math.min(items.length, current + chunk));
  }, [chunk, items.length]);

  useEffect(() => {
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) showMore();
      },
      { rootMargin: `${ROOT_MARGIN_PX}px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, showMore]);

  const sentinelRef = useCallback((element: HTMLElement | null) => {
    setSentinel(element);
  }, []);

  return { visible: items.slice(0, limit), hasMore, showMore, sentinelRef };
}
