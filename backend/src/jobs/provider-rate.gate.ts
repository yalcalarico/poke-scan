import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PRICE_PROVIDER, type PriceProvider } from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Separación mínima entre dos llamadas al **mismo** proveedor de precios.
 *
 * Es cortesía hacia TCGdex: sus requests no consumen la cuota de
 * pokemontcg.io, así que el número no viene de un límite documentado sino de no
 * molestar. 60/min ÷ 2,3 s ≈ 26 requests/min.
 */
export const MIN_PROVIDER_GAP_MS = 2300;

/** Es un reloj, no una Sleep: el valor de producción no debería cambiarlo nadie. */
const DEFAULT_GAP_MS = MIN_PROVIDER_GAP_MS;

/**
 * El ritmo hacia el proveedor, compartido por todos los caminos y **por todos
 * los procesos**.
 *
 * ## Por qué está en Postgres
 *
 * Antes era `private lastProviderCallAt = 0` en `SyncPricesService`: un número en
 * memoria. Un número en memoria es un reloj por proceso, así que con dos
 * instancias del backend cada una contamos su propio gap y el ritmo agregado
 * hacia el proveedor era el doble. El rate limit externo es la restricción más
 * dura del proyecto (`AGENTS.md` §3.1) y un reloj que solo existe en el proceso
 * que lo escribió no la respeta cuando hay más de un proceso.
 *
 * La fila es una por proveedor (`provider_rate_limits`), y tomarla es un
 * `UPDATE` condicional: si `lastCalledAt` todavía está dentro del gap, el
 * `UPDATE` no matchea y el slot está tomado.
 *
 * ## Por qué `UPDATE` condicional y no `SELECT` + `UPDATE`
 *
 * Porque el `SELECT` y el `UPDATE` juntos son dos sentencias y entre ellas otra
 * instancia puede ganar el slot. Con el `WHERE` dentro del `UPDATE` la
 * exclusividad la decide Postgres, en una sentencia y sin locks de aplicación.
 *
 * ## La espera
 *
 * Cuando el `UPDATE` no matchea, el que espera **lee** cuándo se liberó el slot
 * y duerme esa diferencia exacta, en vez de reintentar en bucle. Son dos
 * consultas por llamada al proveedor, y las llamadas están separadas por 2,3 s:
 * el costo es invisible comparado con el request HTTP que las acompaña.
 */
@Injectable()
export class ProviderRateGate {
  private readonly logger = new Logger(ProviderRateGate.name);

  /**
   * Inyectable solo para que los tests no tarden 2,3 s por caso. El valor de
   * producción es `MIN_PROVIDER_GAP_MS`.
   */
  private gapMs = DEFAULT_GAP_MS;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRICE_PROVIDER) private readonly priceProvider: PriceProvider,
  ) {}

  /** Solo para tests: baja el gap para no dormir 2,3 s por caso. */
  setGapMs(gapMs: number): void {
    this.gapMs = gapMs;
  }

  /**
   * Espera a que su turno y devuelve. No lanza: el backoff de una carta que
   * falla es responsabilidad de la cola, no del reloj.
   */
  async wait(): Promise<void> {
    await this.ensureRow();
    for (;;) {
      const taken = await this.tryTakeSlot();
      if (taken) return;
      const waitMs = await this.millisecondsUntilFree();
      // El `+ 1` desempata contra el `now()` del servidor: si se durmiera lo
      // exacto, la sentencia siguiente puede evaluarse un milisegundo antes y
      // volver a fallar, con lo que el loop dormía el mismo gap dos veces.
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs + 1));
    }
  }

  /**
   * La fila tiene que existir para que el `UPDATE` pueda matchear. Se inserta
   * con `lastCalledAt` en el pasado: recién creado, el slot está libre y la
   * primera llamada no espera.
   */
  private async ensureRow(): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO provider_rate_limits ("providerId", "lastCalledAt", "updatedAt")
      VALUES (
        ${this.priceProvider.id},
        (now() AT TIME ZONE 'UTC') - interval '1 day',
        (now() AT TIME ZONE 'UTC')
      )
      ON CONFLICT ("providerId") DO NOTHING
    `;
  }

  private async tryTakeSlot(): Promise<boolean> {
    const taken = await this.prisma.$queryRaw<{ providerId: string }[]>(Prisma.sql`
      UPDATE provider_rate_limits
      SET "lastCalledAt" = (now() AT TIME ZONE 'UTC'),
          "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE "providerId" = ${this.priceProvider.id}
        AND "lastCalledAt" <= (now() AT TIME ZONE 'UTC') - ${this.gapInterval()}::interval
      RETURNING "providerId"
    `);
    return taken.length > 0;
  }

  private async millisecondsUntilFree(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ lastCalledAt: Date }[]>(Prisma.sql`
      SELECT "lastCalledAt" FROM provider_rate_limits WHERE "providerId" = ${this.priceProvider.id}
    `);
    const lastCalledAt = rows[0]?.lastCalledAt;
    if (!lastCalledAt) return 0;
    return lastCalledAt.getTime() + this.gapMs - Date.now();
  }

  /**
   * El interval viaja como texto parametrizado y se castea con `::interval`, en
   * vez de multiplicar un parámetro por `interval`. Multiplicar también
   * funciona, pero deja que Postgres infiera el tipo del parámetro, y un gap
   * fraccionario lo vuelve `numeric`. Así la intención queda explícita y el
   * valor sigue siendo un parámetro, nunca SQL concatenado.
   */
  private gapInterval(): string {
    return `${Math.max(0, Math.round(this.gapMs))} milliseconds`;
  }
}
