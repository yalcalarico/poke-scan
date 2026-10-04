'use client';

import { useSyncExternalStore } from 'react';

export function isPhoneBrowser(userAgent: string): boolean {
  return /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(userAgent);
}

const subscribe = () => () => {};
const getSnapshot = () => isPhoneBrowser(navigator.userAgent);
const getServerSnapshot = () => false;

/** La cámara se ofrece sólo en teléfonos; achicar una ventana no habilita una webcam. */
export function useMobileCamera(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
