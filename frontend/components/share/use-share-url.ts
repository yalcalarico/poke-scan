'use client';

import { useCallback, useSyncExternalStore } from 'react';


/** El origen nunca cambia durante la vida de la pestaña: no hay nada a lo que suscribirse. */
function subscribeToOrigin(): () => void {
  return () => undefined;
}

function getOriginSnapshot(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/**
 * Snapshot de servidor vacío a propósito: si el server renderizara el origen,
 * el primer render del cliente no coincidiría y React pelearía con el
 * hydration. El mismo patrón que usa `ThemeProvider` (gotchas #5).
 */
function getServerOriginSnapshot(): string {
  return '';
}

/**
 * La URL pública de un enlace, lista para copiar y para mandar por WhatsApp.
 *
 * El origen se arma acá y no en el server porque el link se copia desde el
 * cliente, y en el server `window` no existe.
 */
export function useShareUrl(): (slug: string) => string {
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getOriginSnapshot,
    getServerOriginSnapshot,
  );

  return useCallback((slug: string) => `${origin}/share/${slug}`, [origin]);
}
