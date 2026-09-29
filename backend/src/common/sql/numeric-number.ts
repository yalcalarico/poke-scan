import { Prisma } from '@prisma/client';

/**
 * La parte **numérica** de `cards.number`, para poder ordenar por el número
 * impreso y no alfabeticamente.
 *
 * `number` es texto y viene con todo: `"4"`, `"4a"`, `"TG02"`, `"4/102"`. Ordenado
 * como texto, `"10"` queda antes que `"4"` y `"TG02"` antes que `"4a"`, que es al
 * revés de como está impreso en la carta. El `regexp_replace` saca los no dígitos
 * y el `CAST` lo vuelve número; lo que no tiene dígitos se vuelve `NULL` y sale
 * al final con `NULLS LAST`.
 *
 * ## Por qué es un literal compartido
 *
 * El orden por número aparece en dos endpoints con reglas distintas si se
 * escribe dos veces: el catálogo (`/cards/search?sort=number`) y el listado de
 * items de una colección (`/collections/:id/items?sort=number`). Los dos tienen
 * que decir "4 antes que 10 antes que 4a", así que la expresión vive acá una
 * sola vez.
 *
 * ## El alias
 *
 * Espera que la tabla de cartas esté **aliaseada `c`**, igual que
 * `latestMarketPriceJoin` espera la de items como `i`. No se interpola el alias
 * porque los dos call sites ya usan `c` y meter `Prisma.raw` en un helper que es
 * una constante no aporta nada.
 */
export const NUMERIC_CARD_NUMBER = Prisma.sql`CAST(NULLIF(regexp_replace(c.number, '\\D', '', 'g'), '') AS INTEGER)`;
