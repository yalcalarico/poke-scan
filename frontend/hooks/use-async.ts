'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncStatus = 'loading' | 'ready' | 'error';

export interface AsyncState<T> {
  status: AsyncStatus;
  data: T | null;
  error: string | null;
}

export interface UseAsyncResult<T> extends AsyncState<T> {
  reload: () => void;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'No pudimos cargar la información. Revisá tu conexión y reintentá.';
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * El patrón único de estados de carga y error (docs/design-system.md §9.1).
 * "Inline status" + `reloadToken` reimplementados pantalla por pantalla
 * terminou en seis copias con seis bugs distintos.
 *
 * `fn` recibe el `AbortSignal` para que el fetch se cancele de verdad: el
 * componente que se desmonta no deja la request viva. `deps` es la lista de
 * dependencias del fetch, con las mismas reglas que un `useEffect`.
 *
 * @example
 * const { status, data, error, reload } = useAsync(
 *   (signal) => getCollection(id, signal),
 *   [id],
 * );
 */
export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): UseAsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({
    status: 'loading',
    data: null,
    error: null,
  });

  /**
   * Contador de corrida (gotchas #1 y #9). Un flag booleano no alcanza: el
   * usuario puede disparar `reload()` dos veces y volver a montar el
   * componente, así que lo que distingue "esta es la corrida vigente" de "esta
   * la canceló otra" es un número, no un true/false.
   */
  const runIdRef = useRef(0);
  const [reloadToken, setReloadToken] = useState(0);

  // `fn` casi siempre es una closure inline: guardarla en un ref es lo que
  // permite NO ponerla en las deps del efecto sin mentirle al linter.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    const controller = new AbortController();
    let disposed = false;

    // El arranque del fetch va en una microtask: llamar al setter sincrónico
    // desde el cuerpo del efecto dispara un render en cascada, y el doble
    // montaje de StrictMode lo convertiría en un fetch duplicado (gotchas #9).
    queueMicrotask(() => {
      if (disposed || runIdRef.current !== runId) return;

      fnRef
        .current(controller.signal)
        .then((data) => {
          if (disposed || runIdRef.current !== runId) return;
          setState({ status: 'ready', data, error: null });
        })
        .catch((error: unknown) => {
          // Un abort es una corrida vieja: no es un error de la pantalla.
          if (isAbort(error) || disposed || runIdRef.current !== runId) return;
          setState({ status: 'error', data: null, error: messageOf(error) });
        });
    });

    return () => {
      disposed = true;
      controller.abort();
    };
    // `deps` lo pasa el caller, así que el linter no puede verificarlo
    // estáticamente: es la API del hook, no una dependencia olvidada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, ...deps]);

  const reload = useCallback(() => {
    setState({ status: 'loading', data: null, error: null });
    setReloadToken((token) => token + 1);
  }, []);

  return { ...state, reload };
}
