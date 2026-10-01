import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  PRICE_PROVIDER,
  type PriceProvider,
} from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PriceQueueService } from './price-queue.service.js';

/**
 * Cuántas cartas encola una corrida del backfill, por omisión.
 *
* El número no es un detalle de performance: es **presupuesto de requests**.
 * Cada carta encolada termina en un request a TCGdex, y el ritmo global son
 * 26/min. 300 cartas son ~12 minutos de cola, que es lo que un proceso que
 * corre una vez por día puede absorber sin jorobarle la latencia a nadie.
 *
 * Con la cola persistente el costo de pasarse es bajo —la cola simplemente tarda
 * más—, así que el límite existe para que una corrida accidental no se cargue con
 * las 20.670 cartas y deprive al usuario de precios frescos durante horas.
 */
export const BACKFILL_BATCH = 300;

/**
 * Rango de frescura para considerar que una carta "no necesita precio".
 *
 * Es el mismo `MAX_AGE_MS` de `SyncPricesService` (24 h), no uno nuevo: si el
 * backfill usara un umbral más permisivo, dejaría cartas "frescas" para el
 * backfill y viejas para la lectura, y cada carta tendría dos verdades.
 */
const FRESH_MS = 24 * 60 * 60 * 1000;

export interface BackfillResult {
  /** Cartas encoladas en esta corrida. */
  enqueued: number;
  /** Cuántas quedaban pendientes en total, para diagnóstico. */
  pending: number;
}

export interface BackfillOptions {
  /** Máximo de cartas a encolar. Por omisión, `BACKFILL_BATCH`. */
  limit?: number;
  /**
   * Restringir a un subconjunto de cartas.
   *
   * Sin esto el job mira **todo** el catálogo, que es lo correcto para el cron y
   * lo que lo hace avanzar solo. Un subconjunto tiene dos usos reales: el
   * endpoint de admin para recargar las cartas de un set, y los tests, que no
   * pueden depender de qué hay en el catálogo de la base en la que corren.
   */
  cardIds?: readonly string[];
}

/**
 * Pide precios de las cartas que todavía no tienen uno vigente del proveedor
 * activo.
 *
 * ## Por qué existe
 *
 * Cuando se migró `card_prices.provider`, las 180 filas que ya había quedaron con
 * `provider = NULL` —no se les puede atribuir procedencia— y el proveedor activo
 * empezó a escribir desde cero. Como los rankings y los totales leen **solo** el
 * proveedor activo (ver `pricing.md` §"La política de proveedor"), hasta que se
 * llene el catálogo activo esos números dan cero.
 *
 * Es la última pieza de la migración de proveedores: la maquinaria de
 * coexistencia ya está, lo que faltaba era que la fuente nueva escribiera.
 *
 * ## Por qué encola en vez de llamar al proveedor
 *
 * Porque este job **no puede** saltarse el ritmo. Si pidiera precios directo
 * detrás de sí, sería un segundo reloj y duplicaría el ritmo hacia TCGdex con
 * dos instancias, que es exactamente el bug que `ProviderRateGate` arregló. Encolando pasa por la misma cola que las lecturas públicas, así que compite con ellas en el mismo reloj y el presupuesto se respeta por construcción.
 *
 * ## Por qué es idempotente y autolimitado
 *
 * Cada corrida encola las N cartas **más viejas** (o sin precio), no las
 * primeras N. Así el trabajo avanza hacia adelante en vez de reprocesar las
 * mismas, y correrlo dos veces el mismo día no hace daño: el segundo paso
 * encuentra las que ya están en la cola y las ignora.
 */
@Injectable()
export class PriceBackfillService {
  private readonly logger = new Logger(PriceBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: PriceQueueService,
    @Inject(PRICE_PROVIDER) private readonly priceProvider: PriceProvider,
  ) {}

  /**
   * Encola las cartas que más lo necesitan. Devuelve cuántas encoló.
   */
  async enqueueStale(options: BackfillOptions = {}): Promise<BackfillResult> {
    const { limit = BACKFILL_BATCH, cardIds } = options;
    if (limit <= 0) return { enqueued: 0, pending: await this.pendingCount({ cardIds }) };

    /*
     * El corte es "no tiene fila del proveedor activo, o la más nueva ya pasó
     * las 24 h". Y el orden es por la más vieja primero, con las que no tienen
     * ninguna primero: `NULLS FIRST` pone arriba justamente las que nunca se
     * consultaron, que son las que más falta hacen.
     *
     * El filtro por `provider`/`source`/`currency` es el mismo de las lecturas:
     * si el backfill trajera precios de otra fuente, la fila quedaría guardada
     * como si fuera del proveedor activo y la siguiente corrida la volvería a
     * encolar, para siempre.
     */
    const candidates = await this.prisma.$queryRaw<{ cardId: string }[]>(Prisma.sql`
      SELECT c.id AS "cardId"
      FROM cards c
      WHERE ${this.pendingConditions(cardIds)}
      ORDER BY (
        SELECT MAX(p."fetchedAt")
        FROM card_prices p
        WHERE p."cardId" = c.id
          AND p.provider = ${this.priceProvider.id}
      ) ASC NULLS FIRST,
        c.id ASC
      LIMIT ${limit}
    `);

    for (const candidate of candidates) {
      this.queue.enqueue(candidate.cardId);
    }

    if (candidates.length > 0) {
      this.logger.log(
        `Backfill: encoladas ${candidates.length} cartas sin precio vigente de ${this.priceProvider.id}.`,
      );
    }

    return {
      enqueued: candidates.length,
      pending: await this.pendingCount({ cardIds }),
    };
  }

  /**
   * Cuántas cartas del catálogo no tienen precio vigente del proveedor activo.
   *
   * Es el número que dice si el backfill terminó. `sort=price` y los totales dan
   * cero mientras esté lejos de cero.
   */
  async pendingCount(options: { cardIds?: readonly string[] } = {}): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM cards c
      WHERE ${this.pendingConditions(options.cardIds)}
    `);
    return row?.count ?? 0;
  }

  /**
   * El `WHERE` de "esta carta necesita precio", como una sola pieza.
   *
   * Existe como método y no inline por una razón que costó un bug: con el scope
   * opcional, escribir `WHERE ${scope} AND NOT EXISTS (...)` produce
   * `WHERE AND NOT EXISTS (...)` cuando no hay scope — error de sintaxis— y
   * `WHERE c.id = ANY('{}') AND ...` cuando el scope es un array vacío, que no
   * matchea nada. La primera forma rompía el cron horario entero, y ningún test
   * unitario lo vio porque todos pasaban scope.
   *
   * Armar la lista de condiciones y unirlas con `Prisma.join` hace que el
   * `AND` lo ponga quien corresponde y que falte exactamente cuando tiene que
   * faltar.
   */
  private pendingConditions(cardIds?: readonly string[]): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];
    if (cardIds) {
      // Con un array vacío el `ANY` no matchea nada, que es lo correcto para
      // "no hay cartas en el scope".
      conditions.push(Prisma.sql`c.id = ANY(${[...cardIds]}::text[])`);
    }
    conditions.push(Prisma.sql`
      NOT EXISTS (
        SELECT 1
        FROM card_prices p
        WHERE p."cardId" = c.id
          AND p.provider = ${this.priceProvider.id}
          AND p.source = ${this.priceProvider.defaultSource}
          AND p.currency = ${this.priceProvider.defaultCurrency}
          AND p."fetchedAt" >= ${new Date(Date.now() - FRESH_MS)}
      )
    `);
    return Prisma.join(conditions, ' AND ');
  }
}