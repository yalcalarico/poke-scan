import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import {
  CardPricesRetentionService,
  DETAIL_DAYS,
  RETENTION_DAYS,
} from '../src/jobs/card-prices-retention.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Consolida y poda `card_prices`.
 *
 *     pnpm run prices:retention              # dry run: dice qué haría, no borra
 *     pnpm run prices:retention -- --apply   # borra de verdad
 *     pnpm run prices:retention -- --apply --detail-days=30 --horizon-days=400
 *
 * ## Por qué el dry run es el default
 *
 * Es un `DELETE` sobre la tabla que sostiene el histórico de precios y el delta
 * de 30 días. Un script que borra sin preguntar, en un mantenimiento que se
 * corre "por las dudas", es un script que un día borra la fila que hacía que una
 * carta tuviera precio de referencia. Con el dry run por default, correrlo sin
 * argumentos no puede romper nada y dice exactamente qué haría.
 *
 * Lo que hace está en [card-prices-retention.service.ts](../src/jobs/card-prices-retention.service.ts),
 * cuya documentación explica por qué consolidar en vez de borrar.
 */

const log = (...args: unknown[]): void => {
  console.log(`[${new Date().toISOString()}]`, ...args);
};

function numberFlag(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (!found) return fallback;
  const value = Number(found.slice(prefix.length));
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`--${name} tiene que ser un número >= 0 (recibido: ${found})`);
  }
  return Math.floor(value);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const detailDays = numberFlag('detail-days', DETAIL_DAYS);
  const horizonDays = numberFlag('horizon-days', RETENTION_DAYS);
  if (horizonDays <= detailDays) {
    throw new Error(
      `--horizon-days (${horizonDays}) tiene que ser mayor que --detail-days (${detailDays}): ` +
        'si no, la poda borraría días que la consolidación todavía no colapsó.',
    );
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  const retention = new CardPricesRetentionService(prisma);

  try {
    const before = await retention.stats();
    log(
      `card_prices: ${before.rows} filas, ${before.days} días distintos, ${formatBytes(before.bytes)} en total.`,
    );
    for (const row of before.byProvider) {
      log(`  ${row.provider ?? 'legacy (sin provider)'}: ${row.rows} filas`);
    }

    const result = await retention.run({ detailDays, horizonDays, dryRun: !apply });

    if (!apply) {
      log('');
      log(`DRY RUN. Con --detail-days=${detailDays} y --horizon-days=${horizonDays}:`);
      log(`  consolidaría ${result.consolidated} filas a un punto por día`);
      log(`  podaría ${result.pruned} filas más allá del horizonte`);
      log('');
      log('Nada se borró. Para hacerlo de verdad: --apply');
      return;
    }

    const after = await retention.stats();
    log('');
    log(`Aplicado: ${result.consolidated} consolidadas, ${result.pruned} podadas.`);
    log(
      `card_prices ahora tiene ${after.rows} filas (antes ${before.rows}) y ocupa ${formatBytes(after.bytes)} (antes ${formatBytes(before.bytes)}).`,
    );
    if (after.rows > before.rows) {
      // No debería pasar: `rows` solo baja con un DELETE. Si aparece, hay un
      // trigger o algo escribiendo que hay que mirar antes de seguir.
      log('⚠  La cantidad de filas subió después de podar. Revisá qué está escribiendo en la tabla.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[prices:retention] falló:', error);
  process.exitCode = 1;
});
