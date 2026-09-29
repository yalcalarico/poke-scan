/**
 * Los números de `/buscar` en un solo lugar, y en un archivo que **no** es
 * `'use client'`.
 *
 * No es obsesivo: `page.tsx` y `search-fallback.tsx` son Server
 * Components y necesitan el mismo `pageSize` que usa la lista del cliente para
 * dibujar el skeleton con la cantidad correcta de cartas. Importar una constante
 * desde un módulo `'use client'` a un Server Component devuelve una *client
 * reference*, no el número: el render del skeleton se rompe con "Objects are
 * not valid as a React child". Los dos tienen que leer el mismo valor de un
 * módulo que los dos puedan importar.
 */

/** 24 = 4 filas justas de 6 en `xl:`. Un 20 deja una fila de 2 y se ve roto. */
export const CATALOG_PAGE_SIZE = 24;

/** Debounce del input. 300 ms es lo que no hace reclicar la URL. */
export const SEARCH_DEBOUNCE_MS = 300;
