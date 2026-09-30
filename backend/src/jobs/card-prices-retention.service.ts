import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cuántos días se conservan **en detalle** (una fila por consulta) antes de
 * colapsar a un punto por día.
 *
 * 90 días es tres ventanas de 30 y deja ver el seasonality de un trimestre. Es
 * un número de producto: nadie consulta el histórico de una carta con más
 * detalle que eso, y el costo de guardarlo es lineal en el tiempo.
 */
export const DETAIL_DAYS = 90;

/**
 * Hasta dónde llega el histórico, ya consolidado.
 *
 * La app permite ventanas de hasta **365** días
 * (`resolveHistoryWindow` recorta a 7..365), así que cualquier poda tiene que
 * dejar margen para eso. 730 días es el doble: un año de holgura para que un
 * cambio en el máximo de la ventana no venga con una pérdida de datos detrás.
 *
 * El objetivo de este número es acotar un crecimiento sin techo, no afinar la
 * respuesta del delta. Por eso es holgado y no 400.
 */
export const RETENTION_DAYS = 730;

export interface RetentionResult {
  /** Filas que la consolidación habría eliminado. */
  consolidated: number;
  /** Filas que la poda dura habría eliminado. */
  pruned: number;
  /** `true` si no se borró nada (dry run). */
  dryRun: boolean;
}

/**
 * La poda de `card_prices`, que es append-only y por lo tanto crece sin techo.
 *
 * ## Qué NO hace, y por qué no es "borrar lo viejo"
 *
 * Un `DELETE WHERE "fetchedAt" < now() - X` sería muy fácil de escribir y
 * rompería dos cosas que son las más valiosas de la ficha:
 *
 * 1. **El delta de 30 días.** `CardsService.referencePrices` toma *"la fila más
 *    reciente que ya era más vieja que la ventana"* como precio de referencia.
 *    No es un promedio ni una interpolación: es una fila real, y si se borra,
 *    el delta pasa a ser `null` y la píldora de variación desaparece de golpe
 *    para las cartas viejas. Es el bug más caro que podría producir una poda,
 *    y no se ve en los tests de la poda: se ve en la ficha.
 * 2. **El último precio conocido.** El fallback de una carta que solo tiene
 *    filas de otro proveedor (o de la etapa legacy) viene de acá. Borrar su
 *    última fila la convierte en "sin precio" en vez de "con precio viejo".
 *
 * Por eso la política es **consolidar, no borrar**: los días que quedan fuera de
 * la ventana de detalle se colapsan a un punto por día, que es exactamente lo
 * que el endpoint de histórico muestra igual. La forma de la serie no cambia;
 * solo deja de haber seis filas donde el gráfico iba a mostrar una.
 *
 * ## La regla de agrupación
 *
 * `(cardId, provider, source, currency, variant, día)`, y de cada grupo se
 * conserva **la última** del día. Es lo que el endpoint de histórico elige:
 * con `variant` toma la última cotización de esa variante del día, y sin
 * `variant` la de mayor `market` entre variantes —que sigue funcionando porque
 * cada variante conserva su propio punto del día.
 *
 * `provider` entra en la clave porque hay filas de más de una fuente y mezclar
 * dos procedencias en un mismo día produciría una serie que no existe.
 */
@Injectable()
export class CardPricesRetentionService {
  private readonly logger = new Logger(CardPricesRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Colapsa a un punto por día todo lo que está más viejo que la ventana de
   * detalle.
   *
   * Es idempotente: correrla dos veces no cambia nada la segunda vez, porque
   * después de la primera cada día ya tiene una sola fila por grupo.
   */
  async consolidate(detailDays: number = DETAIL_DAYS): Promise<number> {
    const cutoff = new Date(Date.now() - detailDays * DAY_MS);
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM card_prices p
      WHERE p."fetchedAt" < ${cutoff}
        AND p.id NOT IN (
          SELECT DISTINCT ON (
            p2."cardId", p2.provider, p2.source, p2.currency, p2.variant,
            (p2."fetchedAt" AT TIME ZONE 'UTC')::date
          )
            p2.id
          FROM card_prices p2
          WHERE p2."fetchedAt" < ${cutoff}
          ORDER BY
            p2."cardId", p2.provider, p2.source, p2.currency, p2.variant,
            (p2."fetchedAt" AT TIME ZONE 'UTC')::date,
            p2."fetchedAt" DESC
        )
    `;
    if (deleted > 0) {
      this.logger.log(
        `card_prices: ${deleted} filas consolidadas a un punto por día (más viejas de ${detailDays} días)`,
      );
    }
    return deleted;
  }

  /**
   * Borra el histórico más allá del horizonte, y solo de a un día por grupo.
   *
   * La condición de "un punto por día" es lo que hace esto seguro: como la
   * consolidación corrió antes, lo que hay para borrar son días completos, así
   * que la poda no puede dejar una serie con un hueco en medio.
   *
   * Nunca borra **la última fila** de su grupo, con lo que una carta cuyo único
   * precio es de hace un año conserva ese precio viejo y sigue mostrando
   * fallback en vez de quedarse sin nada.
   */
  async prune(
    horizonDays: number = RETENTION_DAYS,
    dryRun = false,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - horizonDays * DAY_MS);
    if (dryRun) {
      return this.countPrunable(cutoff);
    }
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM card_prices p
      WHERE p."fetchedAt" < ${cutoff}
        AND p.id NOT IN (
          SELECT DISTINCT ON (
            p2."cardId", p2.provider, p2.source, p2.currency, p2.variant
          )
            p2.id
          FROM card_prices p2
          ORDER BY
            p2."cardId", p2.provider, p2.source, p2.currency, p2.variant,
            p2."fetchedAt" DESC
        )
    `;
    if (deleted > 0) {
      this.logger.log(
        `card_prices: ${deleted} filas podadas (más viejas de ${horizonDays} días)`,
      );
    }
    return deleted;
  }

  /** Consolida y después poda, que es el orden único que tiene sentido. */
  async run(
    options: { detailDays?: number; horizonDays?: number; dryRun?: boolean } = {},
  ): Promise<RetentionResult> {
    const dryRun = options.dryRun ?? false;
    const consolidated = dryRun
      ? await this.countConsolidatable(new Date(Date.now() - (options.detailDays ?? DETAIL_DAYS) * DAY_MS))
      : await this.consolidate(options.detailDays);
    const pruned = await this.prune(options.horizonDays, dryRun);
    return { consolidated, pruned, dryRun };
  }

  /** Resumen para decidir sin borrar nada. */
  async stats(): Promise<{
    rows: number;
    days: number;
    bytes: number;
    byProvider: { provider: string | null; rows: number }[];
  }> {
    const [summary] = await this.prisma.$queryRaw<
      { rows: number; days: number }[]
    >(Prisma.sql`
      SELECT COUNT(*)::int AS rows,
             COUNT(DISTINCT (p."fetchedAt" AT TIME ZONE 'UTC')::date)::int AS days
      FROM card_prices p
    `);
    const byProvider = await this.prisma.$queryRaw<{ provider: string | null; rows: number }[]>(
      Prisma.sql`
        SELECT provider, COUNT(*)::int AS rows
        FROM card_prices
        GROUP BY provider
        ORDER BY rows DESC
      `,
    );
    const [size] = await this.prisma.$queryRaw<{ bytes: number }[]>(Prisma.sql`
      SELECT pg_total_relation_size('card_prices')::bigint AS bytes
    `);
    return {
      rows: summary?.rows ?? 0,
      days: summary?.days ?? 0,
      bytes: Number(size?.bytes ?? 0),
      byProvider,
    };
  }

  private async countConsolidatable(cutoff: Date): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM card_prices p
      WHERE p."fetchedAt" < ${cutoff}
        AND p.id NOT IN (
          SELECT DISTINCT ON (
            p2."cardId", p2.provider, p2.source, p2.currency, p2.variant,
            (p2."fetchedAt" AT TIME ZONE 'UTC')::date
          )
            p2.id
          FROM card_prices p2
          WHERE p2."fetchedAt" < ${cutoff}
          ORDER BY
            p2."cardId", p2.provider, p2.source, p2.currency, p2.variant,
            (p2."fetchedAt" AT TIME ZONE 'UTC')::date,
            p2."fetchedAt" DESC
        )
    `);
    return row?.count ?? 0;
  }

  private async countPrunable(cutoff: Date): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM card_prices p
      WHERE p."fetchedAt" < ${cutoff}
        AND p.id NOT IN (
          SELECT DISTINCT ON (
            p2."cardId", p2.provider, p2.source, p2.currency, p2.variant
          )
            p2.id
          FROM card_prices p2
          ORDER BY
            p2."cardId", p2.provider, p2.source, p2.currency, p2.variant,
            p2."fetchedAt" DESC
        )
    `);
    return row?.count ?? 0;
  }
}
