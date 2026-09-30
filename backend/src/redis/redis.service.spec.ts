import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

function redisAddress(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return 'host Redis configurado';
  }
}

describe('redisAddress', () => {
  it('no expone credenciales de la URL', () => {
    expect(redisAddress('redis://usuario:secreto@cache.example.com:6380/1')).toBe(
      'cache.example.com:6380',
    );
  });
});

/**
 * Estos tests necesitan un Redis real: el lock depende de que `SET NX EX` y el
 * `EVAL` de compare-and-delete sean atómicos, y eso no se puede simular con un
 * doble sin reimplementar Redis. Sin Redis se omiten en vez de pasar vacuamente.
 *
 * El skip es en runtime (`ctx.skip()`) y no con `it.skipIf` a propósito: la
 * disponibilidad de Redis se conoce recién en `beforeAll`, y `it.skipIf` se
 * evalúa al colectar los tests, cuando todavía no se sabe nada.
 */
describe('RedisService — locks', () => {
  let moduleRef: TestingModule;
  let redis: RedisService;
  let available = false;

  const KEY = 'test:lock:exclusive';
  const OTHER_KEY = 'test:lock:extend';

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'REDIS_URL' ? REDIS_URL : undefined),
          },
        },
      ],
    }).compile();

    redis = moduleRef.get(RedisService);
    redis.onModuleInit();
    for (let i = 0; i < 50 && !redis.isAvailable(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    available = redis.isAvailable();

    if (!available) {
      console.warn(
        '\n' +
          '  ⚠  SKIP de los tests de lock: no se pudo conectar a Redis en ' +
          redisAddress(REDIS_URL) +
          '.\n' +
          '     El lock usa SET NX EX y un EVAL de compare-and-delete, que\n' +
          '     dependen de la atomicidad real de Redis. Levantá Redis\n' +
          '     (docker run -p 6379:6379 redis) y volvé a correr.\n',
      );
    }
  });

  afterAll(async () => {
    if (available) await redis.del(KEY, OTHER_KEY);
    await moduleRef.close();
  });

  beforeEach(async () => {
    if (available) await redis.del(KEY, OTHER_KEY);
  });

  it('acquireLock da el lock a un solo ganador', async (ctx) => {
    if (!available) return ctx.skip();

    const first = await redis.acquireLock(KEY, 'token-a', 60);
    const second = await redis.acquireLock(KEY, 'token-b', 60);

    expect(first).toBe(true);
    // El segundo tiene que perder: es el caso que el sync de catálogo
    // necesita para no duplicar requests contra la fuente externa.
    expect(second).toBe(false);
  });

  it('soltar el lock habilita a otro proceso a tomarlo', async (ctx) => {
    if (!available) return ctx.skip();

    await redis.acquireLock(KEY, 'token-a', 60);
    const released = await redis.releaseLock(KEY, 'token-a');

    expect(released).toBe(true);
    expect(await redis.acquireLock(KEY, 'token-b', 60)).toBe(true);
  });

  it('un token ajeno no puede soltar el lock', async (ctx) => {
    if (!available) return ctx.skip();

    await redis.acquireLock(KEY, 'token-a', 60);

    // El caso peligroso: el TTL de "token-a" venció, "token-b" tomó el lock, y
    // el dueño viejo intenta soltarlo con un DEL a secas. Con compare-and-delete
    // no lo toca.
    expect(await redis.releaseLock(KEY, 'token-b')).toBe(false);
    expect(await redis.get(KEY)).toBe('token-a');
  });

  it('el TTL se renueva solo para el dueño del lock', async (ctx) => {
    if (!available) return ctx.skip();

    await redis.acquireLock(KEY, 'token-a', 5);

    expect(await redis.extendLock(KEY, 'token-b', 60)).toBe(false);
    expect(await redis.extendLock(KEY, 'token-a', 60)).toBe(true);
  });

  it('el lock expira solo si nadie lo renueva', async (ctx) => {
    if (!available) return ctx.skip();

    // El TTL es la red de seguridad del caso "el proceso muere a mitad del
    // sync": sin renovación, el lock tiene que expirar solo.
    await redis.acquireLock(KEY, 'token-a', 1);

    await new Promise((resolve) => setTimeout(resolve, 1600));

    expect(await redis.get(KEY)).toBeNull();
    expect(await redis.acquireLock(KEY, 'token-b', 60)).toBe(true);
  });
});
