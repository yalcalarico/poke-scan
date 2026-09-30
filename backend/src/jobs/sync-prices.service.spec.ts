import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import {
  PRICE_PROVIDER,
  type PriceProvider,
  type RemoteCardPrice,
} from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/index.js';
import { RedisService } from '../redis/index.js';
import { SyncPricesService } from './sync-prices.service.js';
import { TCGDEX_SET_MAPPING } from './tcgdex-set-mapping.service.js';

const TEST_CARD_PREFIX = 'test-prices-';
const TEST_SET_ID = `${TEST_CARD_PREFIX}set`;
const TEST_CARD_ID = `${TEST_CARD_PREFIX}card`;
const TEST_CARD_NO_SET_ID = `${TEST_CARD_PREFIX}unmapped`;

interface StubProvider extends PriceProvider {
  getCardPrices: ReturnType<typeof vi.fn>;
}

/** Redis de mentira que sí guarda: los TTLs son parte del comportamiento. */
const stubRedis = () => {
  const store = new Map<string, { value: string; ttl: number | undefined }>();
  return {
    isAvailable: () => true,
    get: async (key: string) => store.get(key)?.value ?? null,
    getNumber: async () => null,
    getJson: async <T>(key: string) => {
      const hit = store.get(key);
      return hit === undefined ? null : (JSON.parse(hit.value) as T);
    },
    set: async (key: string, value: string, ttl?: number) => {
      store.set(key, { value, ttl });
    },
    setJson: async (key: string, value: unknown, ttl?: number) => {
      store.set(key, { value: JSON.stringify(value), ttl });
    },
    del: async (...keys: string[]) => {
      keys.forEach((k) => store.delete(k));
    },
    _store: store,
  };
};

const remote = (overrides: Partial<RemoteCardPrice> = {}): RemoteCardPrice => ({
  cardId: TEST_CARD_ID,
  variant: 'holofoil',
  low: 1.5,
  mid: 2.5,
  high: 9.99,
  market: 3.25,
  source: 'tcgplayer',
  currency: 'USD',
  ...overrides,
});

describe('SyncPricesService', () => {
  const prismaClient = new PrismaClient();
  let moduleRef: TestingModule;
  let service: SyncPricesService;
  let provider: StubProvider;
  let mapping: { resolve: ReturnType<typeof vi.fn> };
  let redisStore: ReturnType<typeof stubRedis>['_store'];

  const setMinGap = (ms: number) => {
    // El gap de producción son 2,3 s. Los tests fijan el ritmo cuando lo
    // necesitan, y lo dejan en cero en el resto del suite.
    (service as unknown as { minGapMs: number }).minGapMs = ms;
  };

  beforeAll(async () => {
    const redis = stubRedis();
    redisStore = redis._store;
    provider = {
      id: 'tcgdex',
      listSets: vi.fn(),
      getSetDetail: vi.fn(),
      getCardPrices: vi.fn(),
    };
    mapping = { resolve: vi.fn() };
    moduleRef = await Test.createTestingModule({
      providers: [
        SyncPricesService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: RedisService, useValue: redis },
        { provide: PRICE_PROVIDER, useValue: provider },
        { provide: TCGDEX_SET_MAPPING, useValue: mapping },
      ],
    }).compile();

    service = moduleRef.get(SyncPricesService);
  });

  afterAll(async () => {
    await prismaClient.cardPrice.deleteMany({
      where: { cardId: { startsWith: TEST_CARD_PREFIX } },
    });
    await prismaClient.card.deleteMany({
      where: { id: { startsWith: TEST_CARD_PREFIX } },
    });
    await prismaClient.cardSet.deleteMany({
      where: { id: { startsWith: TEST_CARD_PREFIX } },
    });
    await prismaClient.$disconnect();
    await moduleRef.close();
  });

  beforeEach(async () => {
    setMinGap(0);
    await prismaClient.cardPrice.deleteMany({
      where: { cardId: { startsWith: TEST_CARD_PREFIX } },
    });
    redisStore.clear();
    provider.getCardPrices.mockReset();
    mapping.resolve.mockReset();
    mapping.resolve.mockResolvedValue(null);

    await prismaClient.cardSet.deleteMany({ where: { id: { startsWith: TEST_CARD_PREFIX } } });
    await prismaClient.card.deleteMany({ where: { id: { startsWith: TEST_CARD_PREFIX } } });
    await prismaClient.cardSet.createMany({
      data: [
        { id: TEST_SET_ID, name: 'Set de Test', tcgdexSetId: 'tcg-set' },
        { id: `${TEST_SET_ID}-huerfano`, name: 'Set sin mapear', tcgdexSetId: null },
      ],
    });
    await prismaClient.card.createMany({
      data: [
        {
          id: TEST_CARD_ID,
          name: 'Carta de Test',
          supertype: 'Pokémon',
          subtypes: [],
          types: [],
          number: '42',
          setId: TEST_SET_ID,
          imageSmall: 'https://example.test/small.png',
          imageLarge: 'https://example.test/large.png',
          rawJson: {},
        },
        {
          id: TEST_CARD_NO_SET_ID,
          name: 'Carta sin mapeo',
          supertype: 'Pokémon',
          subtypes: [],
          types: [],
          number: '7',
          setId: `${TEST_SET_ID}-huerfano`,
          imageSmall: 'https://example.test/small.png',
          imageLarge: 'https://example.test/large.png',
          rawJson: {},
        },
      ],
    });
  });

  it('refresh pide el precio en vivo a tcgdex con (set, localId) y persiste', async () => {
    provider.getCardPrices.mockResolvedValue([remote(), remote({ variant: 'normal' })]);

    const prices = await service.refresh(TEST_CARD_ID);

    expect(provider.getCardPrices).toHaveBeenCalledWith(TEST_CARD_ID, 'tcg-set', '42');
    expect(prices.map((p) => p.variant)).toEqual(['holofoil', 'normal']);
    expect(prices[0]!.market).toBe(3.25);

    const rows = await prismaClient.cardPrice.findMany({
      where: { cardId: TEST_CARD_ID },
      orderBy: { variant: 'asc' },
      select: { variant: true, market: true, provider: true, source: true, currency: true },
    });
    expect(
      rows.map((r) => ({
        variant: r.variant,
        market: Number(r.market),
        provider: r.provider,
        source: r.source,
        currency: r.currency,
      })),
    ).toEqual([
      { variant: 'holofoil', market: 3.25, provider: 'tcgdex', source: 'tcgplayer', currency: 'USD' },
      { variant: 'normal', market: 3.25, provider: 'tcgdex', source: 'tcgplayer', currency: 'USD' },
    ]);
  });

  it('refresh resuelve el set contra tcgdex si la carta todavía no tiene mapeo', async () => {
    mapping.resolve.mockResolvedValue({ tcgdexSetId: 'tcg-huerfano' });
    provider.getCardPrices.mockResolvedValue([remote({ cardId: TEST_CARD_NO_SET_ID })]);

    const prices = await service.refresh(TEST_CARD_NO_SET_ID);

    expect(mapping.resolve).toHaveBeenCalledWith(`${TEST_SET_ID}-huerfano`);
    expect(provider.getCardPrices).toHaveBeenCalledWith(
      TEST_CARD_NO_SET_ID,
      'tcg-huerfano',
      '7',
    );
    expect(prices.map((p) => p.cardId)).toEqual([TEST_CARD_NO_SET_ID]);
  });

  it('refresh sin mapeo de set no llama a tcgdex y devuelve lo último conocido', async () => {
    mapping.resolve.mockResolvedValue(null);
    provider.getCardPrices.mockResolvedValue([remote()]);
    await service.refresh(TEST_CARD_ID);

    provider.getCardPrices.mockClear();
    const previous = await service.refresh(TEST_CARD_NO_SET_ID);

    expect(mapping.resolve).toHaveBeenCalled();
    expect(provider.getCardPrices).not.toHaveBeenCalled();
    expect(previous).toEqual([]);
  });

  it('refresh cachea con TTL negativa cuando tcgdex todavía no cotiza la carta', async () => {
    provider.getCardPrices.mockResolvedValue([]);

    const prices = await service.refresh(TEST_CARD_ID);

    expect(prices).toEqual([]);
    const hit = redisStore.get(`prices:tcgdex:${TEST_CARD_ID}`);
    expect(hit).toBeDefined();
    expect(hit!.ttl).toBe(6 * 60 * 60);
  });

  it('refresh no borra los precios previos si tcgdex falla', async () => {
    provider.getCardPrices.mockResolvedValueOnce([remote()]);
    await service.refresh(TEST_CARD_ID);
    redisStore.clear();
    provider.getCardPrices.mockRejectedValueOnce(new Error('tcgdex respondió 503'));

    const prices = await service.refresh(TEST_CARD_ID);

    expect(prices.map((p) => p.variant)).toEqual(['holofoil']);
    expect(prices[0]!.market).toBe(3.25);
  });

  it('getPricesForCard devuelve lo cacheado sin volver a pegarle a tcgdex', async () => {
    provider.getCardPrices.mockResolvedValue([remote()]);
    await service.refresh(TEST_CARD_ID);
    provider.getCardPrices.mockClear();

    const prices = await service.getPricesForCard(TEST_CARD_ID);

    expect(prices.map((p) => p.variant)).toEqual(['holofoil']);
    expect(prices[0]!.fetchedAt).toBeInstanceOf(Date);
    expect(provider.getCardPrices).not.toHaveBeenCalled();
  });

  it('getPricesForCard reusa la fila de Postgres si es fresca (<24 h)', async () => {
    await prismaClient.cardPrice.create({
      data: {
        cardId: TEST_CARD_ID,
        variant: 'holofoil',
        market: 7.77,
        source: 'tcgplayer',
        currency: 'USD',
        fetchedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    const prices = await service.getPricesForCard(TEST_CARD_ID);

    expect(prices.map((p) => p.market)).toEqual([7.77]);
    expect(provider.getCardPrices).not.toHaveBeenCalled();
  });

  it('getPricesForCard responde con el precio viejo y encola el refresh sin esperarlo', async () => {
    await prismaClient.cardPrice.create({
      data: {
        cardId: TEST_CARD_ID,
        variant: 'holofoil',
        market: 0.5,
        source: 'tcgplayer',
        currency: 'USD',
        fetchedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      },
    });
    let resolveProvider: ((prices: RemoteCardPrice[]) => void) | undefined;
    provider.getCardPrices.mockImplementationOnce(
      () => new Promise((resolve) => { resolveProvider = resolve; }),
    );

    const prices = await service.getPricesForCard(TEST_CARD_ID);

    expect(prices.map((p) => p.market)).toEqual([0.5]);
    await vi.waitFor(() => expect(provider.getCardPrices).toHaveBeenCalledTimes(1));

    // La lectura ya devolvió stale; el proveedor sigue bloqueado y el handler
    // no quedó esperando el gap ni la llamada externa.
    expect(resolveProvider).toBeDefined();
    resolveProvider!([remote()]);
    await vi.waitFor(async () => {
      const latest = await prismaClient.cardPrice.findFirst({
        where: { cardId: TEST_CARD_ID },
        orderBy: { fetchedAt: 'desc' },
      });
      expect(Number(latest?.market)).toBe(3.25);
    });
  });

  it('deduplica el histórico: una variante refrescada 2 veces se devuelve 1 vez', async () => {
    // Dos filas de la misma variante en fechas distintas (card_prices es
    // append-only). El endpoint tiene que devolver solo la última.
    await prismaClient.cardPrice.createMany({
      data: [
        {
          cardId: TEST_CARD_ID,
          variant: 'holofoil',
          market: 3,
          source: 'tcgplayer',
          currency: 'USD',
          fetchedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        },
        {
          cardId: TEST_CARD_ID,
          variant: 'holofoil',
          market: 9.99,
          source: 'tcgplayer',
          currency: 'USD',
          fetchedAt: new Date(Date.now() - 60 * 60 * 1000),
        },
        {
          cardId: TEST_CARD_ID,
          variant: 'normal',
          market: 0.5,
          source: 'tcgplayer',
          currency: 'USD',
          fetchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      ],
    });

    const prices = await service.getPricesForCard(TEST_CARD_ID);

    expect(prices.map((p) => [p.variant, p.market])).toEqual([
      ['holofoil', 9.99],
      ['normal', 0.5],
    ]);
  });

  it('enqueueRefresh deduplica la misma carta mientras espera', () => {
    // El drain corre en background; el dedupe se ve en que queda una sola
    // entrada mientras el primero sigue en vuelo.
    let release: () => void = () => undefined;
    provider.getCardPrices.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve([]); }),
    );

    service.enqueueRefresh(TEST_CARD_ID);
    service.enqueueRefresh(TEST_CARD_ID);
    expect(service.queueSize).toBe(0);

    release();
  });

  it('enqueueRefresh no encola un id vacío', () => {
    service.enqueueRefresh('');
    expect(service.queueSize).toBe(0);
  });

  // Estas pruebas fijan que TODA llamada pasa por `withProviderSlot`: antes el
  // gap solo vivía en `drain` y los requests concurrentes sobre cartas distintas
  // salían en el mismo instante sin pasar por una compuerta compartida.
  describe('throttle de llamadas al proveedor', () => {
    const createCard = (id: string, number: string) =>
      prismaClient.card.create({
        data: {
          id,
          name: `Carta ${number}`,
          supertype: 'Pokémon',
          subtypes: [],
          types: [],
          number,
          setId: TEST_SET_ID,
          imageSmall: 'https://example.test/small.png',
          imageLarge: 'https://example.test/large.png',
          rawJson: {},
        },
      });

    beforeEach(() => setMinGap(20));

    it('dedupe: N requests concurrentes de la misma carta hacen 1 sola llamada', async () => {
      // Con una sola llamada no hay gap que esperar, así que acá el minGap chico
      // no le regala nada al test: lo que se cuenta es el número de llamadas.
      provider.getCardPrices.mockResolvedValue([remote()]);

      const [, , third] = await Promise.all([
        service.refresh(TEST_CARD_ID),
        service.refresh(TEST_CARD_ID),
        service.refresh(TEST_CARD_ID),
      ]);

      expect(provider.getCardPrices).toHaveBeenCalledTimes(1);
      expect(third.map((p) => p.market)).toEqual([3.25]);
    });

    it('cartas distintas salen espaciadas, no en paralelo', async () => {
      // El gap tiene que ser mucho mayor que el tiempo que tarda una query a
      // Postgres, o el test pasaría por serialización y no por el throttle:
      // mutar `wait` a 0 lo tiene que hacer fallar.
      setMinGap(300);
      const other = `${TEST_CARD_PREFIX}-otra`;
      await createCard(other, '7');
      const started: number[] = [];
      provider.getCardPrices.mockImplementation(async (cardId: string) => {
        started.push(Date.now());
        return [remote({ cardId })];
      });

      await Promise.all([
        service.refresh(TEST_CARD_ID),
        service.refresh(other),
        service.refresh(TEST_CARD_NO_SET_ID),
      ]);

      // La de set sin mapeo corta antes del proveedor, así que son 2.
      expect(started).toHaveLength(2);
      expect(started[1]! - started[0]!).toBeGreaterThanOrEqual(250);

      await prismaClient.card.delete({ where: { id: other } });
    });

    it('el batch del admin tampoco puede gastar el presupuesto de un saque', async () => {
      setMinGap(300);
      const ids = ['a', 'b', 'c', 'd'].map((suffix) => `${TEST_CARD_PREFIX}-${suffix}`);
      await prismaClient.card.createMany({
        data: ids.map((id, index) => ({
          id,
          name: `Carta ${index}`,
          supertype: 'Pokémon',
          subtypes: [],
          types: [],
          number: String(index + 1),
          setId: TEST_SET_ID,
          imageSmall: 'https://example.test/small.png',
          imageLarge: 'https://example.test/large.png',
          rawJson: {},
        })),
      });
      const started: number[] = [];
      provider.getCardPrices.mockImplementation(async (cardId: string) => {
        started.push(Date.now());
        return [remote({ cardId })];
      });

      const result = await service.refreshMany(ids);

      expect(result.refreshed).toBe(4);
      expect(started).toHaveLength(4);
      // 4 cartas con gap de 300 ms: sin control, el lote sería instantáneo.
      expect(started[3]! - started[0]!).toBeGreaterThanOrEqual(850);

      await prismaClient.card.deleteMany({ where: { id: { in: ids } } });
    });

    it('el gap no se suma a la latencia de la llamada anterior', async () => {
      // La puerta serializa, así que la segunda llamada igual espera a que
      // termine la primera: la separación entre arranques es
      // max(latencia, gap), nunca latencia + gap. Con 150 ms de latencia y
      // 100 ms de gap, medir el reloj al terminar daría ~250 ms.
      setMinGap(100);
      const other = `${TEST_CARD_PREFIX}-lenta`;
      await createCard(other, '9');
      const started: number[] = [];
      provider.getCardPrices.mockImplementation(async (cardId: string) => {
        started.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 150));
        return [remote({ cardId })];
      });

      await Promise.all([
        service.refresh(TEST_CARD_ID),
        service.refresh(other),
      ]);

      expect(started[1]! - started[0]!).toBeLessThan(200);

      await prismaClient.card.delete({ where: { id: other } });
    });

    it('un fallo del proveedor no rompe la puerta para el siguiente', async () => {
      const other = `${TEST_CARD_PREFIX}-despues`;
      await createCard(other, '11');
      // El `catch` del gate es lo que evita que la cadena quede envenenada y
      // que toda llamada posterior rechace sin llegar al proveedor.
      provider.getCardPrices.mockRejectedValueOnce(new Error('tcgdex 503'));
      provider.getCardPrices.mockImplementation(async (cardId: string) => [
        remote({ cardId }),
      ]);

      await expect(service.refresh(TEST_CARD_ID)).resolves.toEqual([]);
      await expect(service.refresh(other)).resolves.toHaveLength(1);

      await prismaClient.card.delete({ where: { id: other } });
    });
  });
});
