/**
 * Constantes del tema y el script anti-flash.
 *
 * Vive en un módulo SIN `'use client'` a propósito: `lib/theme.tsx` es un
 * Client Module, así que si `app/layout.tsx` importara `THEME_SCRIPT` de ahí
 * Next le devolvería una *client reference* y el `__html` sería `[object
 * Object]`. El layout importa de este archivo.
 */

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Clave de `localStorage`. La preferencia es local al dispositivo, no del usuario. */
export const THEME_STORAGE_KEY = 'pokescan.theme';

export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/** Snapshot de servidor: nunca `dark`, para no llevar la clase al HTML. */
export const SERVER_THEME: Theme = 'system';
export const SERVER_RESOLVED_THEME: ResolvedTheme = 'light';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Andanada en `<head>` antes de cualquier stylesheet: es lo único que evita el
 * frame blanco de un usuario en dark. Va como string, no como componente, para
 * que no dependa del bundle de React.
 *
 * Se arma con `JSON.stringify` sobre las constantes de arriba para que la clave
 * y la media query no puedan quedar desincronizadas con el resto del tema.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})||'system';var d=t==='dark'||(t==='system'&&matchMedia(${JSON.stringify(
  DARK_MEDIA_QUERY,
)}).matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
