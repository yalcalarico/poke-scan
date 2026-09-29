'use client';

import { useEffect } from 'react';

/**
 * Registra `/sw.js`. Solo en produccion: en dev el SW cachearia el HMR y las
 * paginas con el codigo viejo, hace imposible iterar.
 */
export function PwaServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err: unknown) => {
        console.warn('[pwa] no se pudo registrar el service worker', err);
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
