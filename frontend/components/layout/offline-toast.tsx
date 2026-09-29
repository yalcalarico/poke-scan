'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { useToast } from '@/components/ui';

function subscribeToConnection(onChange: () => void) {  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * `navigator.onLine` como store externo en vez de `useState` + efecto: no hay
 * estado de React que sincronizar, hay un valor del browser que ya existe
 * antes del primer render. Con `useState`+`efecto` el primer render afirmaría
 * que estamos online aunque no lo estuviéramos, y el toast aparecería un
 * frame tarde.
 */
function useIsOnline() {
  return useSyncExternalStore(
    subscribeToConnection,
    () => navigator.onLine,
    // En el server no hay `navigator`. Decir `true` es lo que mantiene la
    // hidratación estable: el server y el primer render del cliente coinciden.
    () => true,
  );
}

/**
 * El aviso de "estás sin conexión", como toast y no como banda fija.
 *
 * Referencia histórica: la app anterior tenía un `OfflineBanner` de 32 px
 * fijos, que empujaba el layout con un `padding-top` en `body` y un `top` en
 * cada `.sticky`: dos reglas CSS que había que mantener en sincronía con cada
 * header nuevo. Un toast no empuja nada, flota sobre el contenido y desaparece
 * solo.
 *
 * Sigue escribiendo `document.documentElement.dataset.offline` porque el service
 * worker lo consulta, y para lectores de pantalla hay un `role="status"` que
 * anuncia el corte una sola vez.
 */
export function OfflineToast() {
  const isOnline = useIsOnline();
  const toast = useToast();

  useEffect(() => {
    document.documentElement.dataset.offline = String(!isOnline);
  }, [isOnline]);

  useEffect(() => {
    if (!isOnline) toast.connection(true);
  }, [isOnline, toast]);

  if (isOnline) return null;

  return (
    <p role="status" className="sr-only">
      Estás sin conexión. Las funciones que necesitan red no van a funcionar.
    </p>
  );
}
