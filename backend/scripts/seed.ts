import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { PokemonTcgIoProvider } from '../src/modules/providers/pokemon-tcg-io.provider.js';
import { TcgdexProvider } from '../src/modules/providers/tcgdex.provider.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';
import { SyncCardsService } from '../src/jobs/sync-cards.service.js';
import { SyncPricesService } from '../src/jobs/sync-prices.service.js';
import { SyncSetsService } from '../src/jobs/sync-sets.service.js';
import { TcgdexSetMappingService } from '../src/jobs/tcgdex-set-mapping.service.js';

const SEED_PAGE_SIZE = 250;
const SEED_PAGES = 2;
const PRICE_SAMPLES = 3;

const log = (...args: unknown[]): void => {
  console.log('[seed]', ...args);
};

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();

  const redis = new RedisService(new ConfigService({}));
  await redis.onModuleInit();

  const provider = new PokemonTcgIoProvider();
  const priceProvider = new TcgdexProvider();
  const syncSets = new SyncSetsService(prisma, provider);
  const mapping = new TcgdexSetMappingService(prisma, redis, priceProvider);
  const syncPrices = new SyncPricesService(prisma, redis, mapping, priceProvider);
  const syncCards = new SyncCardsService(prisma, syncSets, redis, provider);
  try {
    const before = await prisma.$transaction([
      prisma.cardSet.count(),
      prisma.card.count(),
      prisma.cardPrice.count(),
    ]);
    log(
      `Conexión OK. Estado actual: ${before[0]} sets, ${before[1]} cartas, ${before[2]} precios.`,
    );
    log(`Redis disponible: ${redis.isAvailable()}`);

    if (before[1] > 0 && !process.argv.includes('--import')) {
      log('Ya hay cartas cargadas: se omite la importación (usá --import para forzarla).');
    } else {
      log(
        `Importando las primeras ${SEED_PAGES} páginas (${SEED_PAGES * SEED_PAGE_SIZE} cartas) del catálogo real...`,
      );
      const result = await syncCards.syncAll({
        force: true,
        pageSize: SEED_PAGE_SIZE,
        maxPages: SEED_PAGES,
      });
      log(`Sync seed: ${result.processed} cartas procesadas de ${result.total} totales.`);
    }

    if (before[1] === 0) {
      log('Para sincronizar el catálogo completo (~90 requests, varios minutos):');
      log(
        '  curl -X POST http://localhost:3001/api/jobs/sync-catalog -H "x-admin-key: $ADMIN_KEY" -H "content-type: application/json" -d \'{"force":true}\'',
      );
    }

    const samples = await prisma.card.findMany({
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
      take: PRICE_SAMPLES,
    });

    for (const card of samples) {
      try {
        const prices = await syncPrices.getPricesForCard(card.id);
        const summary = prices
          .map((p) => `${p.variant}=${p.market ?? p.mid ?? p.low ?? '-'}`)
          .join(' | ');
        log(`Precios ${card.name} (${card.id}): ${summary || 'sin datos'}`);
      } catch (error) {
        log(`Precios ${card.id}: error ${(error as Error).message}`);
      }
    }

    const after = await prisma.$transaction([
      prisma.cardSet.count(),
      prisma.card.count(),
      prisma.cardPrice.count(),
    ]);
    log(
      `Resultado final: ${after[0]} sets, ${after[1]} cartas, ${after[2]} precios (antes: ${before[0]}/${before[1]}/${before[2]}).`,
    );
  } finally {
    await redis.onModuleDestroy();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[seed] falló:', error);
  process.exitCode = 1;
});
