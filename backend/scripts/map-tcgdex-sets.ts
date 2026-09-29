import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { TcgdexProvider } from '../src/modules/providers/tcgdex.provider.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';
import { TcgdexSetMappingService } from '../src/jobs/tcgdex-set-mapping.service.js';

const log = (...args: unknown[]): void => {
  console.log(`[${new Date().toISOString()}]`, ...args);
};

async function main(): Promise<void> {
  const retryMisses = process.argv.includes('--retry-misses');

  const prisma = new PrismaService();
  await prisma.$connect();

  const redis = new RedisService(new ConfigService({}));
  await redis.onModuleInit();

  const priceProvider = new TcgdexProvider();
  const mapping = new TcgdexSetMappingService(prisma, redis, priceProvider);

  try {
    // El conteo va DESPUÉS de mapAll: en Promise.all correría concurrente y
    // devolvería el snapshot de antes de mapear.
    const { mapped, unmapped } = await mapping.mapAll({ retryMisses });
    const [totalSets, alreadyMapped] = await Promise.all([
      prisma.cardSet.count(),
      prisma.cardSet.count({ where: { tcgdexSetId: { not: null } } }),
    ]);

    log(`Sets mapeados en esta corrida: ${mapped.length}`);
    for (const m of mapped) {
      log(`  ${m.setId} (${m.name}) → ${m.tcgdexSetId}`);
    }
    log(`Sets SIN mapeo: ${unmapped.length}`);
    for (const u of unmapped) {
      log(`  ${u.setId} (${u.name})`);
    }
    log(
      `Total en base: ${totalSets} sets, ${alreadyMapped} con tcgdexSetId ` +
        `(${totalSets - alreadyMapped} sin mapear).`,
    );

    if (unmapped.length > 0) {
      log(
        'Los sets sin mapeo quedan sin precios en vivo: sumalos a SET_ID_OVERRIDES ' +
          'en src/jobs/tcgdex-set-mapping.service.ts y volvé a correr.',
      );
      process.exitCode = 1;
    }
  } finally {
    await redis.onModuleDestroy();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[map-tcgdex-sets] falló:', error);
  process.exitCode = 1;
});
