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
