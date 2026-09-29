import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { PokemonTcgIoProvider } from '../src/modules/providers/pokemon-tcg-io.provider.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';
import { SyncCardsService } from '../src/jobs/sync-cards.service.js';
import { SyncSetsService } from '../src/jobs/sync-sets.service.js';

const PAGE_SIZE = 250;

const log = (...args: unknown[]): void => {
  console.log(`[${new Date().toISOString()}]`, ...args);
};

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();

  const redis = new RedisService(new ConfigService({}));
  await redis.onModuleInit();

  const provider = new PokemonTcgIoProvider();
  const syncSets = new SyncSetsService(prisma, provider);
  const syncCards = new SyncCardsService(prisma, syncSets, redis, provider);

  try {
    const before = await prisma.card.count();
    log(`Estado inicial: ${before} cartas. Redis: ${redis.isAvailable() ? 'ok' : 'no disponible'}`);
    log('Iniciando sync COMPLETO del catálogo (esto puede tardar varios minutos)...');

    const result = await syncCards.syncAll({ pageSize: PAGE_SIZE });

    const after = await prisma.card.count();
    log(`Sync finalizado. Cartas en BD: ${before} -> ${after}`);
    log(`Procesadas: ${result.processed} de ${result.total} del catálogo remoto.`);
  } catch (error) {
    log('ERROR en sync:', (error as Error).message);
    process.exitCode = 1;
  } finally {
    await redis.onModuleDestroy();
    await prisma.$disconnect();
  }
}

main();
