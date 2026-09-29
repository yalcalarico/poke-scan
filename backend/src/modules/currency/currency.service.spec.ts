import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { RedisService } from '../../redis/redis.service.js';
import { CurrencyService } from './currency.service.js';
import { FEATURE_FLAG_ENV } from './currency.constants.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const BLUE_KEY = 'currency:usd:blue';
const BLUE_LAST_KEY = 'currency:usd:blue:last';
const OFICIAL_KEY = 'currency:usd:oficial';
const OFICIAL_LAST_KEY = 'currency:usd:oficial:last';
const BOTH_KEY = 'currency:usd:both';

/**
 * Respuesta REAL de `GET /v1/dolares/blue` (verificada contra la API, no
 * asumida): no usa `value`/`timestamp` sino `compra`/`venta`/`fechaActualizacion`.
 */
function dolarApiResponse(overrides: Record<string, unknown> = {}): Response {
  const body = {
    moneda: 'USD',
    casa: 'blue',
    nombre: 'Blue',
    compra: 1540,
    venta: 1560,
    fechaActualizacion: '2026-09-25T20:58:00.000Z',
    ...overrides,
  };
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as unknown as Response;
}

const hoursAgo = (h: number): string =>
  new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

const failingFetch = () =>
  vi.fn(async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;

describe('CurrencyService', () => {
  let moduleRef: TestingModule;
  let service: CurrencyService;
  let redis: RedisService;
  let redisAvailable = false;
  const originalFlag = process.env[FEATURE_FLAG_ENV];
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        CurrencyService,
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
    service = moduleRef.get(CurrencyService);
    redis.onModuleInit();
    // onModuleInit() conecta en background: esperamos a que resuelva.
    for (let i = 0; i < 50 && !redis.isAvailable(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    redisAvailable = redis.isAvailable();

    if (!redisAvailable) {
      console.warn(
        '\n' +
          '  ⚠  SKIP de la suite CurrencyService: no se pudo conectar a Redis en ' +
          REDIS_URL +
          '.\n' +
          '     Estos tests precargan la clave `currency:usd:blue` en Redis para verificar\n' +
          '     la conversión ARS y la frescura (>48h). Sin Redis no hay forma de ejercitar\n' +
          '     la ruta de caché, así que se omiten en vez de pasar vacuamente.\n' +
          '     Levantá Redis (docker run -p 6379:6379 redis) y volvé a correr.\n',
      );
    }
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    process.env[FEATURE_FLAG_ENV] = originalFlag;
    await moduleRef.close();
  });

  beforeEach(async () => {
    if (redisAvailable) {
      await redis.del(BLUE_KEY, BLUE_LAST_KEY, OFICIAL_KEY, OFICIAL_LAST_KEY, BOTH_KEY);
    }
    process.env[FEATURE_FLAG_ENV] = 'true';
    // DolarApi queda mockeado en TODOS los tests: nunca se sale a la red.
    globalThis.fetch = vi.fn(async () => dolarApiResponse()) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('feature flag', () => {
    it('con CURRENCY_ARS_ENABLED=false, getUsdArs lanza NotFound (404)', async () => {
      process.env[FEATURE_FLAG_ENV] = 'false';

      await expect(service.getUsdArs('blue')).rejects.toBeInstanceOf(NotFoundException);
      // Con el feature apagado no se toca la API externa.
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('con el flag ausente, está habilitado (no rompe el dev local)', () => {
      delete process.env[FEATURE_FLAG_ENV];
      expect(service.isArsEnabled()).toBe(true);
    });

    it('con el flag en false, convert devuelve ars null en vez de tirar', async () => {
      process.env[FEATURE_FLAG_ENV] = 'false';

      const result = await service.convert(100, 'blue');

      expect(result.ars).toBeNull();
    });

    it('getUsdArsBoth con el flag apagado lanza NotFound', async () => {
      process.env[FEATURE_FLAG_ENV] = 'false';

      await expect(service.getUsdArsBoth('blue')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('convert con valor precargado en Redis', () => {
    it('convert(100, blue) devuelve ars = 100 * rate', async (ctx) => {
      if (!redisAvailable) return ctx.skip();
      const rate = 1234.5;
      await redis.setJson(BLUE_KEY, { rate, rateType: 'blue', fetchedAt: hoursAgo(1) });

      const result = await service.convert(100, 'blue');

      expect(result.rate).toBe(rate);
      expect(result.ars).toBe(100 * rate);
      expect(result.rateType).toBe('blue');
      expect(result.stale).toBe(false);
      // La caché evitó por completo el fetch externo.
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('con un valor cacheado viejo (>48h) devuelve stale: true', async (ctx) => {
      if (!redisAvailable) return ctx.skip();
      await redis.setJson(BLUE_KEY, {
        rate: 1000,
        rateType: 'blue',
        fetchedAt: hoursAgo(72),
      });

      const result = await service.convert(100, 'blue');

      expect(result.rate).toBe(1000);
      expect(result.ars).toBe(100 * 1000);
      expect(result.stale).toBe(true);
    });

    it('justo debajo de las 48h todavía no es stale', async (ctx) => {
      if (!redisAvailable) return ctx.skip();
      await redis.setJson(BLUE_KEY, { rate: 1000, rateType: 'blue', fetchedAt: hoursAgo(47) });

      const result = await service.getUsdArs('blue');

      expect(result.stale).toBe(false);
    });

    it('redondea a 2 decimales', async (ctx) => {
      if (!redisAvailable) return ctx.skip();
      await redis.setJson(BLUE_KEY, {
        rate: 1234.567,
        rateType: 'blue',
        fetchedAt: hoursAgo(1),
      });

      const result = await service.convert(10, 'blue');

      expect(result.ars).toBe(12345.67);
    });
  });

  describe('fallo de DolarApi', () => {
    it('sin caché y con fetch fallando → ServiceUnavailableException', async () => {
      globalThis.fetch = failingFetch();

      await expect(service.getUsdArs('blue')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('sin caché y con HTTP 503 → ServiceUnavailableException', async () => {
      globalThis.fetch = vi.fn(async () =>
        ({ ok: false, status: 503, headers: new Headers() }) as unknown as Response,
      ) as unknown as typeof fetch;

      await expect(service.getUsdArs('blue')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('sin caché y con HTML en vez de JSON → ServiceUnavailableException', async () => {
      globalThis.fetch = vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'text/html' }),
          json: async () => {
            throw new SyntaxError('Unexpected token <');
          },
        }) as unknown as Response,
      ) as unknown as typeof fetch;

      await expect(service.getUsdArs('blue')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('caída de DolarApi con último valor conocido → lo sirve con stale: true', async (ctx) => {
      if (!redisAvailable) return ctx.skip();
      // Solo la clave "last known" (sin TTL), como si la caché de 1h venciera.
      await redis.setJson(BLUE_LAST_KEY, {
        rate: 1500,
        rateType: 'blue',
        fetchedAt: hoursAgo(2),
      });
      globalThis.fetch = failingFetch();

      const result = await service.getUsdArs('blue');

      expect(result.rate).toBe(1500);
      expect(result.stale).toBe(true);
    });

    it('convert() no tira cuando DolarApi está caído: devuelve ars null', async () => {
      globalThis.fetch = failingFetch();

      const result = await service.convert(100, 'blue');

      expect(result.ars).toBeNull();
      expect(result.usd).toBe(100);
      expect(result.rate).toBeNull();
    });
  });

  describe('validación de la respuesta upstream', () => {
    it('rechaza un valor no numérico', async () => {
      globalThis.fetch = vi.fn(async () =>
        dolarApiResponse({ venta: 'mucho', compra: undefined }),
      ) as unknown as typeof fetch;

      await expect(service.getUsdArs('blue')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('si venta no es numérico, cae a compra', async () => {
      globalThis.fetch = vi.fn(async () => dolarApiResponse({ venta: 'mucho' })) as unknown as typeof fetch;

      const result = await service.getUsdArs('blue');

      expect(result.rate).toBe(1540);
    });

    it('rechaza un valor cero', async () => {
      globalThis.fetch = vi.fn(async () => dolarApiResponse({ venta: 0 })) as unknown as typeof fetch;

      await expect(service.getUsdArs('blue')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('rechaza una cotización absurdamente grande', async () => {
      globalThis.fetch = vi.fn(async () =>
        dolarApiResponse({ venta: 9_999_999_999 }),
      ) as unknown as typeof fetch;

      await expect(service.getUsdArs('blue')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('caché', () => {
    it('cachea con TTL de 1h bajo currency:usd:<type> y no repite el fetch', async (ctx) => {
      if (!redisAvailable) return ctx.skip();

      const first = await service.getUsdArs('blue');
      expect(first.rate).toBe(1560);

      const cached = await redis.getJson<{ rate: number }>(BLUE_KEY);
      expect(cached?.rate).toBe(1560);

      const second = await service.getUsdArs('blue');
      expect(second.rate).toBe(1560);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('ignora una entrada de caché corrupta y vuelve al upstream', async (ctx) => {
      if (!redisAvailable) return ctx.skip();
      await redis.set(BLUE_KEY, JSON.stringify({ rate: 'no soy número' }));

      const result = await service.getUsdArs('blue');

      expect(result.rate).toBe(1560);
    });

    it('getCachedRate solo lee Redis: nunca hace fetch', async (ctx) => {
      if (!redisAvailable) return ctx.skip();
      expect(await service.getCachedRate('blue')).toBeNull();

      await redis.setJson(BLUE_KEY, { rate: 1500, rateType: 'blue', fetchedAt: hoursAgo(1) });

      const result = await service.getCachedRate('blue');

      expect(result?.rate).toBe(1500);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('getUsdArsBoth', () => {
    const bothFetch = () =>
      vi.fn(async (url: string) =>
        url.endsWith('oficial')
          ? dolarApiResponse({ casa: 'oficial', compra: 1495, venta: 1545 })
          : dolarApiResponse(),
      ) as unknown as typeof fetch;

    it('devuelve blue y oficial para el selector del cliente', async () => {
      globalThis.fetch = bothFetch();

      const result = await service.getUsdArsBoth('blue');

      expect(result.blue?.rate).toBe(1560);
      expect(result.oficial?.rate).toBe(1545);
      // Los campos de primer nivel reflejan el tipo pedido.
      expect(result.rate).toBe(1560);
      expect(result.rateType).toBe('blue');
      expect(result.fetchedAt).toBe('2026-09-25T20:58:00.000Z');
    });

    it('con preferred=oficial, los campos de primer nivel son los del oficial', async () => {
      globalThis.fetch = bothFetch();

      const result = await service.getUsdArsBoth('oficial');

      expect(result.rate).toBe(1545);
      expect(result.rateType).toBe('oficial');
    });

    it('un tipo caído no tumba al otro', async () => {
      globalThis.fetch = vi.fn(async (url: string) => {
        if (url.endsWith('oficial')) throw new Error('solo oficial caido');
        return dolarApiResponse();
      }) as unknown as typeof fetch;

      const result = await service.getUsdArsBoth('blue');

      expect(result.blue?.rate).toBe(1560);
      expect(result.oficial).toBeNull();
    });

    it('si ambos tipos caen, tira ServiceUnavailableException', async () => {
      globalThis.fetch = failingFetch();

      await expect(service.getUsdArsBoth('blue')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
