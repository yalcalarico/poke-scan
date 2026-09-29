/**
 * API pública de `components/home/` — la landing.
 *
 * Mezcla server y client a propósito, y por eso el import es explícito:
 * - `AppPreview`, `FeatureGrid` y `fetchPreviewCards` son server-safe (solo
 *   render y `fetch`).
 * - `HomeCta` es el único client component del módulo: es el que lee la
 *   sesión con `useAuth()`.
 *
 * Importar el barrel desde un Server Component no arrastra `HomeCta` al bundle
 * de cliente: la frontera la pone la directiva `'use client'` del archivo, no el
 * `index.ts`.
 *
 * `AppMark` no está acá: es de la app, no de la landing, y vive en
 * `@/components/brand`.
 */
export { AppPreview, type AppPreviewProps } from './app-preview';
export { FeatureGrid } from './feature-grid';
export { HomeCta } from './home-cta';
export { fetchPreviewCards, PREVIEW_LIMIT } from './preview-cards';
