import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { PROVIDER_IDS } from '../src/modules/providers/card-provider.interface.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';

/**
 * Pasa el cursor del sync de Redis a `sync_state`.
 *
 * El cursor del sync de catálogo eran dos claves Redis sin TTL
 * (`sync:cards:lastPage` y `sync:cards:complete`). Ahora vive en la tabla
 * `sync_state`, con id `cards:<providerId>`. Sin este script, un deploy pierde
 * el cursor real: el próximo sync cree que nunca corrió y vuelve a traer las 83
 * páginas del catálogo, gastando requests de una cuota de 1.000 por día para
 * comprobar algo que la base ya sabía.
 *
 * No se puede hacer en la migración de Prisma porque una migración no puede
 * leer Redis: es un store externo al que la migración no tiene acceso.
 *
 * Es idempotente: si la fila ya existe en `sync_state`, no la toca. Así se puede
 * correr después de un deploy sin miedo, y solo tiene efecto la primera vez.
 *
 *     pnpm --dir backend run db:migrate-sync-state
 */

const log = (...args: unknown[]): void => {
  console.log(`[${new Date().toISOString()}]`, ...args);
};

const KEY_LAST_PAGE = 'sync:cards:lastPage';
const KEY_COMPLETE = 'sync:cards:complete';
const STATE_ID = `cards:${PROVIDER_IDS.POKEMON_TCG_IO}`;

/**
 * Espera a que Redis esté listo, o falla.
 *
 * `RedisService.onModuleInit()` no espera la conexión —es a propósito para que
 * la app arranque igual sin Redis— y `get()` devuelve `null` cuando no está
 * listo. Sin esta espera, este script leería `null`, concluiría "no hay cursor
 * que migrar" y saldría con código 0: un no-op silencioso en el script que
 * existe justamente para no perder el cursor. Un `null` por "Redis todavía no
 * conectado" y un `null` por "la clave no existe" tienen que ser cosas
 * distintas.
 */
async function waitForRedis(redis: RedisService, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!redis.isAvailable()) {
    if (Date.now() > deadline) {
      throw new Error(
        `Redis no estuvo disponible en ${timeoutMs} ms. Sin poder leer ` +
          `${KEY_LAST_PAGE} / ${KEY_COMPLETE} no se puede decidir si hay algo que migrar, ` +
          'así que el script aborta en vez de migrar de más o de menos.',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  const redis = new RedisService(new ConfigService({}));
  await redis.onModuleInit();

  try {
    await waitForRedis(redis);

    const existing = await prisma.syncState.findUnique({ where: { id: STATE_ID } });
    if (existing) {
      log(`Ya hay cursor en sync_state para ${STATE_ID} (página ${existing.lastPage}). No se toca.`);
      return;
    }

    const [lastPageRaw, completeRaw] = await Promise.all([
      redis.get(KEY_LAST_PAGE),
      redis.get(KEY_COMPLETE),
    ]);

    if (lastPageRaw === null && completeRaw === null) {
      log('No hay cursor en Redis: no hay nada que migrar.');
      return;
    }

    const lastPage = Number(lastPageRaw ?? '0');
    const isComplete = completeRaw !== null;

    await prisma.syncState.create({
      data: { id: STATE_ID, lastPage, isComplete },
    });

    log(
      `Cursor migrado a ${STATE_ID}: página ${lastPage}` +
        (isComplete ? ' (marcado como completo)' : ' (sin marcar como completo)'),
    );

    if (!isComplete && lastPage > 0) {
      log(
        'El cursor quedó a mitad de camino y sin marca de completo, igual que estaba en Redis: ' +
          'el próximo sync reanuda desde ahí.',
      );
    }
  } finally {
    await redis.onModuleDestroy();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[migrate-sync-state] falló:', error);
  process.exitCode = 1;
});
