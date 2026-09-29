import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { PRICE_PROVIDER, type PriceProvider } from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/index.js';
import { RedisService } from '../redis/index.js';
import { TcgdexSetMappingService } from './tcgdex-set-mapping.service.js';

const TEST_SET_PREFIX = 'test-map-';

interface StubProvider extends PriceProvider {
  listSets: ReturnType<typeof vi.fn>;
  getSetDetail: ReturnType<typeof vi.fn>;
}

const stubRedis = () => {
  const store = new Map<string, string>();
  return {
    isAvailable: () => true,
    get: async (key: string) => store.get(key) ?? null,
    getNumber: async () => null,
    getJson: async <T>(key: string) => {
      const value = store.get(key);
      return value === undefined ? null : (JSON.parse(value) as T);
    },
    set: async (key: string, value: string) => {
      store.set(key, value);
    },
    setJson: async (key: string, value: unknown) => {
      store.set(key, JSON.stringify(value));
    },
    del: async (...keys: string[]) => {
      keys.forEach((k) => store.delete(k));
    },
    _store: store,
  };
};

const createSet = async (
  prisma: PrismaClient,
  id: string,
  name: string,
  numbers: string[],
): Promise<void> => {
  await prisma.cardSet.create({ data: { id, name } });
  await prisma.card.createMany({
    data: numbers.map((number) => ({
      id: `${id}-${number}`,
      name: `Carta ${number}`,
      supertype: 'Pokémon',
      subtypes: [],
      types: [],
      number,
      setId: id,
      imageSmall: 'https://example.test/small.png',
      imageLarge: 'https://example.test/large.png',
      rawJson: {},
    })),
  });
};

describe('TcgdexSetMappingService', () => {
  const prismaClient = new PrismaClient();
  let moduleRef: TestingModule;
  let service: TcgdexSetMappingService;
  let provider: StubProvider;
  let redisStore: Map<string, string>;

  beforeAll(async () => {
    const redis = stubRedis();
    redisStore = redis._store;
    provider = {
      listSets: vi.fn(),
      getSetDetail: vi.fn(),
      getCardPrices: vi.fn(),
    };
    moduleRef = await Test.createTestingModule({
      providers: [
        TcgdexSetMappingService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: RedisService, useValue: redis },
        { provide: PRICE_PROVIDER, useValue: provider },
      ],
    }).compile();

    service = moduleRef.get(TcgdexSetMappingService);
  });

  afterAll(async () => {
    await prismaClient.card.deleteMany({
      where: { id: { startsWith: TEST_SET_PREFIX } },
    });
    await prismaClient.cardSet.deleteMany({
      where: { id: { startsWith: TEST_SET_PREFIX } },
    });
    await prismaClient.$disconnect();
    await moduleRef.close();
  });

  beforeEach(async () => {
    await prismaClient.card.deleteMany({
      where: { id: { startsWith: `${TEST_SET_PREFIX}` } },
    });
    await prismaClient.cardSet.deleteMany({
      where: { id: { startsWith: TEST_SET_PREFIX } },
    });
    redisStore.clear();
    provider.listSets.mockReset();
    provider.getSetDetail.mockReset();
  });

  it('mapea por nombre normalizado y persiste el tcgdexSetId', async () => {
    await createSet(prismaClient, `${TEST_SET_PREFIX}swsh`, 'Darkness Ablaze', [
      '1',
      '2',
      '136',
    ]);
    provider.listSets.mockResolvedValue([
      { id: 'otro', name: 'Otro Set' },
      { id: 'swsh3', name: 'Darkness Ablaze' },
    ]);
    provider.getSetDetail.mockResolvedValue({
      id: 'swsh3',
      name: 'Darkness Ablaze',
      localIds: ['1', '2', '136', '189'],
    });

    const mapping = await service.resolve(`${TEST_SET_PREFIX}swsh`);

    expect(mapping).toEqual({ tcgdexSetId: 'swsh3' });
    const persisted = await prismaClient.cardSet.findUnique({
      where: { id: `${TEST_SET_PREFIX}swsh` },
      select: { tcgdexSetId: true },
    });
    expect(persisted?.tcgdexSetId).toBe('swsh3');
  });

  it('cae a la igualdad de ID cuando los nombres difieren (Base → Base Set)', async () => {
    await createSet(prismaClient, `${TEST_SET_PREFIX}base1`, 'Base', ['4', '102']);
    provider.listSets.mockResolvedValue([{ id: `${TEST_SET_PREFIX}base1`, name: 'Base Set' }]);
    provider.getSetDetail.mockResolvedValue({
      id: `${TEST_SET_PREFIX}base1`,
      name: 'Base Set',
      localIds: ['4', '102'],
    });

    const mapping = await service.resolve(`${TEST_SET_PREFIX}base1`);

    expect(mapping).toEqual({ tcgdexSetId: `${TEST_SET_PREFIX}base1` });
  });

  it('descarta el candidato cuando los números de carta no aparecen en el set', async () => {
    await createSet(prismaClient, `${TEST_SET_PREFIX}cel25c`, 'Celebrations: Classic Collection', [
      '15',
      '107',
    ]);
    provider.listSets.mockResolvedValue([
      { id: 'cel25cc', name: 'Celebrations Classic Collection' },
    ]);
    provider.getSetDetail.mockResolvedValue({
      id: 'cel25cc',
      name: 'Celebrations Classic Collection',
      localIds: ['CC001', 'CC002', 'CC025'],
    });

    const mapping = await service.resolve(`${TEST_SET_PREFIX}cel25c`);

    expect(mapping).toBeNull();
    const persisted = await prismaClient.cardSet.findUnique({
      where: { id: `${TEST_SET_PREFIX}cel25c` },
      select: { tcgdexSetId: true },
    });
    expect(persisted?.tcgdexSetId).toBeNull();
    // El miss marker evita reintentar el matcheo en cada refresh.
    expect(redisStore.has(`tcgdex:map:miss:${TEST_SET_PREFIX}cel25c`)).toBe(true);
  });

  it('devuelve el mapeo persistido sin tocar el proveedor', async () => {
    await createSet(prismaClient, `${TEST_SET_PREFIX}listo`, 'Ya Mapeado', ['1']);
    await prismaClient.cardSet.update({
      where: { id: `${TEST_SET_PREFIX}listo` },
      data: { tcgdexSetId: 'ya-mapeado' },
    });

    const mapping = await service.resolve(`${TEST_SET_PREFIX}listo`);

    expect(mapping).toEqual({ tcgdexSetId: 'ya-mapeado' });
    expect(provider.listSets).not.toHaveBeenCalled();
    expect(provider.getSetDetail).not.toHaveBeenCalled();
  });

  it('respeta el miss marker: no rebusca un set ya descartado', async () => {
    await createSet(prismaClient, `${TEST_SET_PREFIX}miss`, 'Sin Match', ['1']);
    redisStore.set(`tcgdex:map:miss:${TEST_SET_PREFIX}miss`, '1');

    const mapping = await service.resolve(`${TEST_SET_PREFIX}miss`);

    expect(mapping).toBeNull();
    expect(provider.listSets).not.toHaveBeenCalled();
  });

  it('un error de red en la validación no marca el miss', async () => {
    await createSet(prismaClient, `${TEST_SET_PREFIX}flaky`, 'Flaky', ['1']);
    provider.listSets.mockResolvedValue([{ id: 'flaky-t', name: 'Flaky' }]);
    provider.getSetDetail.mockRejectedValueOnce(new Error('tcgdex respondió 503'));

    const mapping = await service.resolve(`${TEST_SET_PREFIX}flaky`);

    expect(mapping).toBeNull();
    expect(redisStore.has(`tcgdex:map:miss:${TEST_SET_PREFIX}flaky`)).toBe(false);
  });

  it('cachea el listado de sets en Redis y no lo repide en cada resolve', async () => {
    await createSet(prismaClient, `${TEST_SET_PREFIX}a`, 'Set A', ['1']);
    await createSet(prismaClient, `${TEST_SET_PREFIX}b`, 'Set B', ['1']);
    provider.listSets.mockResolvedValue([
      { id: 'a-t', name: 'Set A' },
      { id: 'b-t', name: 'Set B' },
    ]);
    provider.getSetDetail.mockImplementation(async (id: string) => ({
      id,
      name: id,
      localIds: ['1'],
    }));

    await service.resolve(`${TEST_SET_PREFIX}a`);
    await service.resolve(`${TEST_SET_PREFIX}b`);

    expect(provider.listSets).toHaveBeenCalledTimes(1);
    expect(redisStore.has('tcgdex:sets')).toBe(true);
  });
});
