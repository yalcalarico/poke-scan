/**
 * Los números de la colección, en un solo lugar.
 *
 * `Intl.NumberFormat` en el módulo y no en el render: el constructor es caro y
 * se puede cachear una vez para toda la sesión. Va acá y no en `lib/format.ts`
 * porque el de acá solo formatea conteos de items, no moneda.
 */
const COUNT_FORMAT = new Intl.NumberFormat('es-AR');

/** Formatea un conteo con separador de miles: `1.204`. */
export function formatCount(value: number): string {
  return COUNT_FORMAT.format(value);
}

/**
 * Página de la grilla de cartas del detalle. 24 = 8 filas de 3 columnas, que es
 * lo que entra en dos pantallas de iPhone sin que el botón "Cargar más" quede
 * por encima del pliegue.
 *
 * Es el mismo número que usa `CollectionDetailSkeleton` para el placeholder: si
 * se cambian uno hay que cambiar el otro, y por eso viven en el mismo archivo.
 */
export const COLLECTION_PAGE_SIZE = 24;

/**
 * Cuántas cartas se **pintan** por tanda, una vez que ya están en memoria.
 *
 * Es independiente de `COLLECTION_PAGE_SIZE` (que pagina requests), y el mismo
 * criterio que el binder: el viewport de 390 × 844 muestra ~20 tiles de la grilla
 * de colección (3 columnas en mobile, 8 en `xl:`), así que 60 deja tres pantallas
 * de margen para que el sentinel de 600 px traiga la tanda siguiente antes de que
 * el usuario llegue al final.
 *
 * A la décima página el pico del DOM son 120 tiles en vez de los 240 que había sin
 * troceo, con los mismos `data-card-index` (el corte es un prefijo) y sin tocar el
 * scroll a la primera carta nueva.
 */
export const COLLECTION_CHUNK = 60;
