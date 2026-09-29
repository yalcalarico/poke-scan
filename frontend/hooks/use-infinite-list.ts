'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Paginated } from '@/types/api';

/** Margen con el que se adelanta la carga: el sentinel no necesita verse. */
const ROOT_MARGIN_PX = 600;

export interface UseInfiniteListOptions {
  /** Página desde la que se arranca. La URL (`?page=3`) la puede setear. */
  initialPage?: number;
  /** `false` deja el hook en reposo: sirve para esperar filtros o sesión. */
  enabled?: boolean;
}

export interface UseInfiniteListResult<T> {
  items: T[];
  /** Última página cargada. */
  page: number;
  /** Items por página, para que el `Skeleton` de la grilla mida bien. */
  pageSize: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
  /** Primera carga: acá va el `Skeleton` de la grilla. */
  isLoading: boolean;
  /** Carga de una página más: se muestra al pie, sin sacar la grilla. */
  isLoadingMore: boolean;
  error: string | null;
  loadMore: () => void;
  /** Vuelve a pedir desde la primera página. */
  reload: () => void;
  /** Cambia la página actual desde afuera (deep link o botón atrás). */
  setPage: (page: number) => void;
  /**
   * Ref para el elemento centinela. Va **al final** de la lista; cuando entra en
   * el viewport (más 600 px) dispara la página siguiente.
   *
   * Si el browser no tiene `IntersectionObserver` no hay auto-carga: hay que
   * usar el `loadMore()` explícito (el botón "Cargar más").
   */
  sentinelRef: (element: HTMLElement | null) => void;
}

interface ListState<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
  pending: boolean;
  loadingMore: boolean;
  error: string | null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'No pudimos cargar la información. Revisá tu conexión y reintentá.';
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

const INITIAL_STATE: ListState<never> = {
  items: [],
  page: 0,
  totalPages: 0,
  total: 0,
  pending: true,
  loadingMore: false,
  error: null,
};

/**
 * Scroll infinito en vez de "Anterior / Siguiente"
 * (docs/design-system.md §8.13): mantiene la posición y no interrumpe el
 * scroll.
 *
 * La URL sigue siendo la fuente de verdad: `setPage` reinicia la lista en esa
 * página, que es lo que necesitan `/buscar?page=3` en un link o en el botón
 * atrás. Acumular páginas hacia atrás es un estado que la URL no puede
 * expresar.
 *
 * @example
 * const { items, hasMore, isLoadingMore, loadMore, sentinelRef, setPage } =
 *   useInfiniteList((page, signal) => searchCards({ page, signal }), 24);
 */
export function useInfiniteList<T>(
  fetchPage: (page: number, signal: AbortSignal) => Promise<Paginated<T>>,
  pageSize: number,
  { initialPage = 1, enabled = true }: UseInfiniteListOptions = {},
): UseInfiniteListResult<T> {
  const [state, setState] = useState<ListState<T>>(INITIAL_STATE);
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);

  /**
   * La página de arranque viaja en el estado, no en un ref: es lo que dispara
   * el efecto de carga, así que `setPage` y `reload` son la misma operación con
   * distinto número de página.
   */
  const [request, setRequest] = useState<{ startPage: number; token: number }>({
    startPage: initialPage,
    token: 0,
  });

  /**
   * Contador de corrida + un solo AbortController vivo (gotchas #1 y #9).
   * Cancelar el pedido anterior es lo que evita que una respuesta lenta de la
   * página 1 se pegue encima de la 2.
   */
  const runIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  // `fetchPage` es una closure inline: va en un ref para no ensuciar las deps
  // del efecto ni las de `loadMore`.
  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  });

  // `run` necesita leer los items actuales para anexar la página siguiente, y
  // no puede depender de `state`: `state` cambia en cada página y eso rearmaría
  // el `IntersectionObserver` y la identidad de `loadMore`.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const run = useCallback((page: number, append: boolean) => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState((prev) => ({
      ...prev,
      pending: !append,
      loadingMore: append,
      error: null,
    }));

    fetchPageRef
      .current(page, controller.signal)
      .then((result) => {
        if (runIdRef.current !== runId || controller.signal.aborted) return;
        setState((prev) => ({
          items: append ? [...prev.items, ...result.data] : result.data,
          page: result.page || page,
          totalPages: result.totalPages,
          total: result.total,
          pending: false,
          loadingMore: false,
          error: null,
        }));
      })
      .catch((error: unknown) => {
        if (isAbort(error) || runIdRef.current !== runId) return;
        setState((prev) => ({
          ...prev,
          pending: false,
          loadingMore: false,
          error: messageOf(error),
        }));
      });
  }, []);

  useEffect(() => {
    // `enabled: false` no toca el estado: `isLoading` se deriva de `enabled`
    // abajo. Poner `pending` en false desde el efecto sería un render en
    // cascada para algo que ya se sabe en el render.
    if (!enabled) return;

    let disposed = false;

    // En una microtask, no en el cuerpo del efecto: con el doble montaje de
    // StrictMode el fetch se dispararía dos veces (gotchas #9).
    queueMicrotask(() => {
      if (!disposed) run(request.startPage, false);
    });

    return () => {
      disposed = true;
      controllerRef.current?.abort();
    };
  }, [enabled, request, run]);

  const hasMore = useMemo(
    () => state.page > 0 && state.page < state.totalPages,
    [state.page, state.totalPages],
  );

  const loadMore = useCallback(() => {
    const current = stateRef.current;
    if (!enabled || current.pending || current.loadingMore) return;
    if (current.page <= 0 || current.page >= current.totalPages) return;
    run(current.page + 1, true);
  }, [enabled, run]);

  const startAt = useCallback((page: number) => {
    setRequest((prev) => ({
      startPage: Math.max(1, Math.floor(page)),
      token: prev.token + 1,
    }));
  }, []);

  const reload = useCallback(() => {
    startAt(1);
  }, [startAt]);

  const sentinelRef = useCallback((element: HTMLElement | null) => {
    setSentinel(element);
  }, []);

  useEffect(() => {
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: `${ROOT_MARGIN_PX}px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, loadMore]);

  return {
    items: state.items,
    page: state.page,
    pageSize,
    totalPages: state.totalPages,
    total: state.total,
    hasMore,
    isLoading: enabled && state.pending,
    isLoadingMore: state.loadingMore,
    error: state.error,
    loadMore,
    reload,
    setPage: startAt,
    sentinelRef,
  };
}
