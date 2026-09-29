/**
 * API pública de `components/brand/`.
 *
 * Server-safe entero: la marca es un `next/image` sin estado, sin efecto y sin
 * handler, así que se puede usar tanto desde un Server Component como desde uno
 * client sin que la directiva `'use client'` aparezca en ningún lado.
 */
export { AppMark, type AppMarkProps } from './app-mark';
