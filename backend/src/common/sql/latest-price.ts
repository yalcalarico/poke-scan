import { Prisma } from '@prisma/client';

export interface CurrentPricePolicy {
  id: string;
  defaultSource: string;
  defaultCurrency: string;
}

/**
 * `LEFT JOIN` del **último** precio de mercado de cada item.
 *
 * ## Por qué un `LATERAL` y no un `DISTINCT ON` global
 *
 * La forma anterior —`LEFT JOIN (SELECT DISTINCT ON ("cardId", variant) ... FROM
 * card_prices ORDER BY "cardId", variant, "fetchedAt" DESC) lp ON ...`— parece
 * más barata por lo poco que se escribe, pero su subquery **no sabe qué cartas
 * se van a usar**: materializa una fila por (carta, variante) de *toda* la tabla
 * y después une eso con los items. `card_prices` es append-only y **no tiene job
 * de poda**, así que el costo de un `GET /api/collections` crece con la historia
 * global de precios y no con las colecciones del usuario. Medido con 142.379
 * filas y un usuario de 5 colecciones / 200 items: **9.755 buffers y 14 ms**,
 * de los cuales el 99 % no tiene que ver con las colecciones.
 *
 * Acá el lateral se ancla en el item (`p."cardId" = i."cardId"`), así que cada
 * lookup es un `Index Cond` sobre `card_prices(cardId, variant, fetchedAt)` que
 * corta en la primera fila: **774 buffers y 1,9 ms** para lo mismo, y el costo
 * queda atado a la cantidad de items. Ver `docs/gotchas.md` §26.
 *
 * ## Semántica
 *
 * `DISTINCT ON ("cardId", variant) ... ORDER BY "fetchedAt" DESC` equivale a
 * `ORDER BY "fetchedAt" DESC LIMIT 1` sobre la fila que se está buscando, así
 * que el número que sale es **el mismo**: la última cotización guardada de esa
 * variante. No hay interpolación ni promedio.
 *
 * ## El alias
 *
 * Espera que la tabla de items de la consulta que la incluye esté **aliaseada
 * `i`**. Es el alias que usan `collections.service.ts` y
 * `friends.service.ts`; si alguno cambia, el error de Postgres es explícito
 * ("missing FROM-clause entry"), no un resultado silenciosamente distinto. No se
 * interpola el alias porque eso obligaría a meter `Prisma.raw` en un helper que
 * hoy tiene dos call sites con literales.
 *
 * Proyecta **solo** `market`: es la única columna que consumen el `totalValueUsd`
 * de los agregados y el `valueUsd` del progreso por set.
 */
export function latestMarketPriceJoin(policy: CurrentPricePolicy): Prisma.Sql {
  return Prisma.sql`
    LEFT JOIN LATERAL (
      SELECT p.market AS "market"
      FROM card_prices p
      WHERE p."cardId" = i."cardId"
        AND p.variant = i.variant
        AND p.provider = ${policy.id}
        AND p.source = ${policy.defaultSource}
        AND p.currency = ${policy.defaultCurrency}
      ORDER BY p."fetchedAt" DESC
      LIMIT 1
    ) lp ON true
  `;
}
