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

/**
 * La degradación: que sea visible en el health y que no inunde el log.
 *
 * El escenario que importa no es "Redis no arrancó" —ahí `isAvailable()` es
 * falso desde el principio y los métodos ni intentan nada—, sino **Redis está
 * arriba pero cada comando falla**: memoria llena, timeouts, un socket colgado.
 * Ahí `isAvailable()` da `true`, cada `get` entra, cada `get` lanza y cada
 * `get` logueaba. Con la app en 30 req/min son 30 líneas por minuto y lo que
 * pasó queda enterrado.
 *
 * Para provocarlo se usa un `WRONGTYPE` real: la clave es una lista y `GET`
 * sobre una lista falla en el servidor. Es el mismo camino de error que un
 * timeout, sin necesidad de romper Redis.
 */
describe('RedisService — degradación observable', () => {
  const WRONGTYPE_KEY = 'test:wrongtype:list';
  let moduleRef: TestingModule;
  let redis: RedisService;
  let available = false;
  let warn: ReturnType<typeof vi.spyOn>;

  const build = (url: string | undefined): RedisService => {
    const ref = new RedisService({
      get: (key: string) => (key === 'REDIS_URL' ? url : undefined),
    } as ConfigService);
    ref.onModuleInit();
    return ref;
  };

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

    if (available) {
      // La clave tiene que ser una lista, no un string: `GET` sobre un string
      // funciona y no probaría nada.
      await (redis as unknown as { client: { del: (k: string) => Promise<number> } }).client.del(
        WRONGTYPE_KEY,
      );
      await (
        redis as unknown as { client: { lpush: (k: string, v: string) => Promise<number> } }
      ).client.lpush(WRONGTYPE_KEY, 'x');
    }
  });

  afterAll(async () => {
    if (available) await redis.del(WRONGTYPE_KEY);
    await moduleRef.close();
  });

  it('sin REDIS_URL no está configurado y tampoco degradado', () => {
    // La distinción importa en una alerta: "no usamos caché" y "la caché se
    // cayó hace 40 minutos" son incident distintos.
    const sinUrl = build(undefined);

    const status = sinUrl.status();
    expect(status.configured).toBe(false);
    expect(status.available).toBe(false);
    expect(status.degradedSince).toBeNull();
  });

  it('con Redis sano el estado no está degradado', async (ctx) => {
    if (!available) return ctx.skip();

    const status = redis.status();
    expect(status.configured).toBe(true);
    expect(status.available).toBe(true);
    expect(status.degradedSince).toBeNull();
  });

  it('el estado no filtra la URL de Redis', async (ctx) => {
    if (!available) return ctx.skip();

    const serializado = JSON.stringify(redis.status());
    expect(serializado).not.toContain(REDIS_URL);
    expect(serializado).not.toContain('redis://');
  });

  it('un comando que falla se degrada en un aviso, no en uno por llamada', async (ctx) => {
    if (!available) return ctx.skip();

    const logger = (redis as unknown as { logger: { warn: (m: string) => void } }).logger;
    warn = vi.spyOn(logger, 'warn');
    try {
      for (let i = 0; i < 10; i += 1) {
        expect(await redis.get(WRONGTYPE_KEY)).toBeNull();
      }

      // Diez `get` fallidos, un solo warn: el resto se cuenta como suprimido.
      const warns = warn.mock.calls.filter((c) => String(c[0]).includes('WRONGTYPE'));
      expect(warns.length).toBe(1);
      // Y el error queda anotado para el health.
      expect(redis.status().lastErrorAt).not.toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it('el aviso siguiente dice cuántos se suprimieron', async (ctx) => {
    if (!available) return ctx.skip();

    const logger = (redis as unknown as { logger: { warn: (m: string) => void } }).logger;
    // Se limpia el rate para que este test sea independiente del anterior: si
    // compartieran ventana, el aviso ya habría salido y no habría nada que
    // contar.
    (redis as unknown as { warnedAt: Map<string, unknown> }).warnedAt.clear();
    warn = vi.spyOn(logger, 'warn');
    try {
      for (let i = 0; i < 4; i += 1) await redis.get(WRONGTYPE_KEY);
      // Se adelanta la ventana: sin esto, el rate de 60 s lo dejaría esperando.
      (redis as unknown as { warnedAt: Map<string, { at: number; suppressed: number }> }).warnedAt.set(
        'get',
        { at: Date.now() - 10 * 60_000, suppressed: 7 },
      );
      await redis.get(WRONGTYPE_KEY);

      const warns = warn.mock.calls.filter((c) => String(c[0]).includes('WRONGTYPE'));
      // Dos avisos: el primero al abrir la ventana, el segundo cuando la ventana
      // venció de verdad.
      expect(warns.length).toBe(2);
      // Los suprimidos no se pierden: se informan en el próximo aviso.
      expect(String(warns[0]![0])).not.toContain('suprimidos');
      expect(String(warns[1]![0])).toContain('+7 avisos suprimidos');
    } finally {
      warn.mockRestore();
    }
  });
});
