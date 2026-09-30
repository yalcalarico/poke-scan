// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Paginated } from '@/types/api';
import { useInfiniteList } from '../use-infinite-list';

/**
 * Lo que se testea acá es la **carrera entre corridas** de `useInfiniteList`,
 * que es la clase de bug que no se ve leyendo `/buscar` ni la colección:
 *
 * - Si el `signal` no llega al `fetch`, el request viejo sigue vivo y su
 *   respuesta puede pintarse encima de la nueva. El síntoma en pantalla es
 *   "escribo rápido y aparece la lista del filtro anterior".
 * - Un `AbortError` es una corrida vieja, no un error: si entra al estado de
 *   error, cambiar de filtro muestra un `ErrorState` por el hecho de cancelar.
 * - Y el número de corrida es la última defensa para el caso en que el
 *   transporte **no** soporte cancelación (una respuesta cacheada, un polyfill):
 *   el contador descarta la respuesta vieja igual.
 *
 * Por eso el doble de pruebas: con y sin `abortable`.
 */

interface RecordedCall {
  page: number;
  signal: AbortSignal;
  resolve: (page: Paginated<string>) => void;
  reject: (error: unknown) => void;
}

function page(items: string[], pageNumber = 1): Paginated<string> {
  return { data: items, page: pageNumber, pageSize: 24, totalPages: 3, total: 60 };
}

/**
 * Un fetcher que registra cada llamada y queda en manos del test.
 *
 * `abortable: true` imita a `fetch`: al abortar, la promesa **rechaza** con
 * `AbortError`. `abortable: false` imita a un transporte que no se puede
 * cancelar: la promesa sigue pendiente y puede resolver cuando quiera, que es
 * justo el peor caso para la respuesta vieja.
 */
function createFetcher(options: { abortable?: boolean } = {}) {
  const calls: RecordedCall[] = [];
  const { abortable = true } = options;

  const fetchPage = (requestedPage: number, signal: AbortSignal) =>
    new Promise<Paginated<string>>((resolve, reject) => {
      if (abortable) {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      calls.push({ page: requestedPage, signal, resolve, reject });
    });

  return { calls, fetchPage };
}

describe('useInfiniteList: el signal llega al fetcher y cancela la corrida anterior', () => {
  it('pasa un AbortSignal al fetcher y aborta el pedido anterior al recargar', async () => {
    const { calls, fetchPage } = createFetcher();
    const { result } = renderHook(() => useInfiniteList(fetchPage, 24));

    // La primera corrida arranca en una microtask, no en el cuerpo del efecto
    // (gotchas #9).
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]!.signal.aborted).toBe(false);

    act(() => result.current.reload());

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(calls[1]!.signal.aborted).toBe(false);
  });

  it('aborta el request en vuelo cuando el componente se desmonta', async () => {
    const { calls, fetchPage } = createFetcher();
    const { unmount } = renderHook(() => useInfiniteList(fetchPage, 24));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.signal.aborted).toBe(false);

    unmount();

    expect(calls[0]!.signal.aborted).toBe(true);
  });

  it('un AbortError no enciende el estado de error de la lista', async () => {
    const { calls, fetchPage } = createFetcher();
    const { result } = renderHook(() => useInfiniteList(fetchPage, 24));

    await waitFor(() => expect(calls).toHaveLength(1));
    act(() => result.current.reload());
    await waitFor(() => expect(calls).toHaveLength(2));

    // La corrida vieja muere por abort: es una corrida vieja, no un error.
    await waitFor(() => expect(result.current.error).toBeNull());

    act(() => calls[1]!.resolve(page(['nueva'])));
    await waitFor(() => expect(result.current.items).toEqual(['nueva']));
    expect(result.current.error).toBeNull();
  });

  it('un error real (no abort) sí aparece en el estado de error', async () => {
    const { calls, fetchPage } = createFetcher();
    const { result } = renderHook(() => useInfiniteList(fetchPage, 24));

    await waitFor(() => expect(calls).toHaveLength(1));
    act(() => calls[0]!.reject(new Error('Se cayó la conexión')));

    await waitFor(() => expect(result.current.error).toBe('Se cayó la conexión'));
  });
});

describe('useInfiniteList: la respuesta vieja nunca pisa a la nueva', () => {
  it('descarta la respuesta de una corrida vieja aunque el transporte no se pueda abortar', async () => {
    const { calls, fetchPage } = createFetcher({ abortable: false });
    const { result } = renderHook(() => useInfiniteList(fetchPage, 24));

    await waitFor(() => expect(calls).toHaveLength(1));

    // Cambió el filtro: arranca la segunda corrida antes de que responda la
    // primera. Es el "escribo rápido" de `/buscar`.
    act(() => result.current.reload());
    await waitFor(() => expect(calls).toHaveLength(2));

    // Responde primero la **nueva**.
    await act(async () => {
      calls[1]!.resolve(page(['filtro nuevo']));
    });
    await waitFor(() => expect(result.current.items).toEqual(['filtro nuevo']));

    // Y ahora llega la vieja, tarde, con los datos del filtro anterior.
    await act(async () => {
      calls[0]!.resolve(page(['filtro viejo']));
    });

    expect(result.current.items).toEqual(['filtro nuevo']);
  });

  it('paginar no pisa las páginas que ya estaban cargadas', async () => {
    const { calls, fetchPage } = createFetcher();
    const { result } = renderHook(() => useInfiniteList(fetchPage, 24));

    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => {
      calls[0]!.resolve(page(['a', 'b']));
    });
    await waitFor(() => expect(result.current.page).toBe(1));

    act(() => result.current.loadMore());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.page).toBe(2);

    await act(async () => {
      calls[1]!.resolve(page(['c'], 2));
    });

    await waitFor(() => expect(result.current.items).toEqual(['a', 'b', 'c']));
    expect(result.current.page).toBe(2);
  });

  it('con enabled: false no pide nada y no reporta loading', () => {
    const { calls, fetchPage } = createFetcher();
    const { result } = renderHook(() => useInfiniteList(fetchPage, 24, { enabled: false }));

    expect(calls).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.items).toEqual([]);
  });
});
