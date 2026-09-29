/**
 * API pública de `components/home/` — la landing.
 *
 * Mezcla server y client a propósito, y por eso el import es explícito:
 * - `AppPreview`, `FeatureGrid` y `fetchPreviewCards` son server-safe (solo
 *   render y `fetch`).
 * - `HomeCta` y `ScanSessionResume` son los client components del módulo: los
 *   dos leen algo que solo existe en el navegador (la sesión de auth y la sesión
 *   de escaneo).
 *
 * Importar el barrel desde un Server Component no arrastra los client components
 * al bundle: la frontera la pone la directiva `'use client'` de cada archivo, no
 * el `index.ts`.
 *
 * `AppMark` no está acá: es de la app, no de la landing, y vive en
 * `@/components/brand`.
 */
export { AppPreview, type AppPreviewProps } from './app-preview';
export { FeatureGrid } from './feature-grid';
export { HomeCta } from './home-cta';
export { fetchPreviewCards, PREVIEW_LIMIT } from './preview-cards';
export { ScanSessionResume } from './scan-session-resume';
