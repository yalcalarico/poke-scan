import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import {
  CARD_DATA_PROVIDER,
  PROVIDER_IDS,
  type CardDataProvider,
  type RemoteCard,
  type RemoteSet,
} from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/index.js';
import { SyncCardsService } from './sync-cards.service.js';
import { SyncSetsService } from './sync-sets.service.js';
import { SyncStateService } from './sync-state.service.js';

const TEST_PREFIX = 'test-canonical-sync-';

function makeSet(id: string): RemoteSet {
  return {
    id,
    name: `Set ${id}`,
    series: null,
    printedTotal: 1,
    total: 1,
    releaseDate: null,
    logoUrl: null,
    symbolUrl: null,
    ptcgoCode: null,
    raw: {},
  };
}

function makeCard(id: string, setId: string, name: string): RemoteCard {
  return {
    id,
    name,
    supertype: 'Pokémon',
    subtypes: [],
    hp: null,
    types: [],
    number: '1',
    rarity: null,
    artist: null,
    setId,
    imageSmall: 'https://example.test/small.png',
    imageLarge: 'https://example.test/large.png',
    regulationMark: null,
    language: 'en',
    raw: {},
  };
}

describe('SyncCardsService — IDs canónicos', () => {
  const prismaClient = new PrismaClient();
  let moduleRef: TestingModule;
  let service: SyncCardsService;
  let sets: RemoteSet[];
  let cards: RemoteCard[];

  const provider: CardDataProvider = {
    id: PROVIDER_IDS.POKEMON_TCG_IO,
    getSets: async (page, pageSize) => ({
      data: page === 1 ? sets : [],
      page,
      pageSize,
      total: sets.length,
      totalPages: 1,
    }),
    getCardsPage: async (page, pageSize) => ({
      data: page === 1 ? cards : [],
      page,
      pageSize,
      total: cards.length,
      totalPages: 1,
    }),
    getCard: async () => null,
    getPricesForCard: async () => [],
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        SyncCardsService,
        SyncSetsService,
        SyncStateService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: CARD_DATA_PROVIDER, useValue: provider },
      ],
    }).compile();

    service = moduleRef.get(SyncCardsService);
  });

  afterAll(async () => {
    await prismaClient.syncState.deleteMany({});
    await prismaClient.card.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
    await prismaClient.cardSet.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
    await prismaClient.$disconnect();
    await moduleRef.close();
  });

  beforeEach(async () => {
    await prismaClient.syncState.deleteMany({});
    await prismaClient.card.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
    await prismaClient.cardSet.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
  });

  it('conserva el ID canónico al sincronizar IDs externos ya mapeados', async () => {
    const setId = `${TEST_PREFIX}canonical-set`;
    const cardId = `${TEST_PREFIX}canonical-card`;
    const externalSetId = `${TEST_PREFIX}external-set`;
    const externalCardId = `${TEST_PREFIX}external-card`;

    await prismaClient.cardSet.create({ data: { id: setId, name: 'Nombre viejo' } });
    await prismaClient.cardSetExternalId.create({
      data: {
        provider: PROVIDER_IDS.POKEMON_TCG_IO,
        externalId: externalSetId,
        setId,
      },
    });
    await prismaClient.card.create({
      data: {
        id: cardId,
        name: 'Nombre viejo',
        supertype: 'Pokémon',
        subtypes: [],
        types: [],
        number: '1',
        setId,
        imageSmall: 'https://example.test/old-small.png',
        imageLarge: 'https://example.test/old-large.png',
        rawJson: {},
      },
    });
    await prismaClient.cardExternalId.create({
      data: {
        provider: PROVIDER_IDS.POKEMON_TCG_IO,
        externalId: externalCardId,
        cardId,
      },
    });

    sets = [makeSet(externalSetId)];
    cards = [makeCard(externalCardId, externalSetId, 'Nombre actualizado')];
    await service.syncAll({ force: true, pageSize: 250, maxPages: 1 });

    const card = await prismaClient.card.findUnique({
      where: { id: cardId },
      select: { id: true, name: true, setId: true },
    });
    expect(card).toEqual({ id: cardId, name: 'Nombre actualizado', setId });
    expect(
      await prismaClient.card.findUnique({
        where: { id: externalCardId },
        select: { id: true },
      }),
    ).toBeNull();
  });

  it('registra aliases para cartas y sets nuevos del proveedor canónico actual', async () => {
    const setId = `${TEST_PREFIX}new-set`;
    const cardId = `${TEST_PREFIX}new-card`;
    sets = [makeSet(setId)];
    cards = [makeCard(cardId, setId, 'Carta nueva')];

    await service.syncAll({ force: true, pageSize: 250, maxPages: 1 });

    expect(
      await prismaClient.cardSetExternalId.findUnique({
        where: {
          provider_externalId: {
            provider: PROVIDER_IDS.POKEMON_TCG_IO,
            externalId: setId,
          },
        },
        select: { setId: true },
      }),
    ).toEqual({ setId });
    expect(
      await prismaClient.cardExternalId.findUnique({
        where: {
          provider_externalId: {
            provider: PROVIDER_IDS.POKEMON_TCG_IO,
            externalId: cardId,
          },
        },
        select: { cardId: true },
      }),
    ).toEqual({ cardId });
  });
});

/**
 * El cursor reanudable, que antes eran dos claves Redis y ahora es `sync_state`.
 *
 * Acá se prueba el **cableado** —que `SyncCardsService` lea y escriba Postgres— y
 * no el comportamiento de `SyncStateService`, que tiene su propio spec. Lo que
 * importa es que reanude desde la página anotada y que no vuelva a traer las
 * anteriores: cada página que se re-trae es un request de una cuota de 1.000
 * por día.
 */
describe('SyncCardsService — cursor reanudable', () => {
  const prismaClient = new PrismaClient();
  const STATE_ID = `cards:${PROVIDER_IDS.POKEMON_TCG_IO}`;
  const TOTAL = 6;
  const PAGE_SIZE = 2;
  const TOTAL_PAGES = TOTAL / PAGE_SIZE;
  /** Las páginas que el provider recibió, con el `pageSize` de cada una. */
  let requested: { page: number; pageSize: number }[] = [];

  const pagingProvider: CardDataProvider = {
    id: PROVIDER_IDS.POKEMON_TCG_IO,
    getSets: async (page, pageSize) => ({
      data: page === 1 ? [makeSet(`${TEST_PREFIX}paging-set`)] : [],
      page,
      pageSize,
      total: 1,
      totalPages: 1,
    }),
    getCardsPage: async (page, pageSize) => {
      requested.push({ page, pageSize });
      const first = (page - 1) * pageSize;
      const data = Array.from({ length: Math.max(0, Math.min(pageSize, TOTAL - first)) }, (_, i) =>
        makeCard(
          `${TEST_PREFIX}page-${page}-${i}`,
          `${TEST_PREFIX}paging-set`,
          `Carta ${page}-${i}`,
        ),
      );
      return { data, page, pageSize, total: TOTAL, totalPages: TOTAL_PAGES };
    },
    getCard: async () => null,
    getPricesForCard: async () => [],
  };

  let service: SyncCardsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SyncCardsService,
        SyncSetsService,
        SyncStateService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: CARD_DATA_PROVIDER, useValue: pagingProvider },
      ],
    }).compile();
    service = moduleRef.get(SyncCardsService);
  });

  afterAll(async () => {
    await prismaClient.syncState.deleteMany({});
    await prismaClient.card.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
    await prismaClient.cardSet.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
    await prismaClient.$disconnect();
  });

  beforeEach(async () => {
    await prismaClient.syncState.deleteMany({});
    await prismaClient.card.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
    await prismaClient.cardSet.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
    requested = [];
  });

  it('sin cursor arranca en la página 1 y anota el avance página a página', async () => {
    const result = await service.syncAll({ pageSize: PAGE_SIZE });

    expect(result.processed).toBe(TOTAL);
    expect(result.skipped).toBe(false);
    // La página 1 se pide con el pageSize real; las siguientes también.
    expect(requested.map((r) => r.page)).toEqual([1, 2, 3]);

    const state = await prismaClient.syncState.findUniqueOrThrow({ where: { id: STATE_ID } });
    expect(state.lastPage).toBe(TOTAL_PAGES);
    expect(state.totalPages).toBe(TOTAL_PAGES);
    expect(state.isComplete).toBe(true);
  });

  it('con cursor anotado reanuda desde la siguiente y no re-trae las anteriores', async () => {
    await prismaClient.syncState.create({
      data: { id: STATE_ID, lastPage: 1, totalPages: TOTAL_PAGES, isComplete: false },
    });

    const result = await service.syncAll({ pageSize: PAGE_SIZE });

    // Solo se vuelve a pedir la página 1, y con `pageSize: 1`: es el probe que
    // da el total, no una reprocesada.
    expect(requested).toEqual([
      { page: 1, pageSize: 1 },
      { page: 2, pageSize: PAGE_SIZE },
      { page: 3, pageSize: PAGE_SIZE },
    ]);
    expect(result.processed).toBe(TOTAL - PAGE_SIZE);
    // Y la página 1 no se volvió a guardar.
    expect(
      await prismaClient.card.count({ where: { id: { startsWith: `${TEST_PREFIX}page-1-` } } }),
    ).toBe(0);
  });

  it('con el catálogo completo lo omite, sin traer páginas', async () => {
    await prismaClient.syncState.create({
      data: { id: STATE_ID, lastPage: TOTAL_PAGES, totalPages: TOTAL_PAGES, isComplete: true },
    });

    const result = await service.syncAll({ pageSize: PAGE_SIZE });

    expect(result.skipped).toBe(true);
    expect(result.processed).toBe(0);
    // Solo el probe del total, con pageSize 1.
    expect(requested).toEqual([{ page: 1, pageSize: 1 }]);
  });

  it('force ignora el cursor y rehace el catálogo desde la primera', async () => {
    await prismaClient.syncState.create({
      data: { id: STATE_ID, lastPage: 2, totalPages: TOTAL_PAGES, isComplete: false },
    });

    const result = await service.syncAll({ force: true, pageSize: PAGE_SIZE });

    expect(requested.map((r) => r.page)).toEqual([1, 2, 3]);
    expect(result.processed).toBe(TOTAL);
    expect(
      await prismaClient.card.count({ where: { id: { startsWith: `${TEST_PREFIX}page-1-` } } }),
    ).toBe(PAGE_SIZE);
  });

  it('un sync parcial no se marca completo', async () => {
    // Es lo que hace `pnpm run seed`: dos páginas para tener datos rápido. Si se
    // marcara completo, el catálogo quedaría con 500 cartas y nadie lo sabría.
    await service.syncAll({ pageSize: PAGE_SIZE, maxPages: 2 });

    const state = await prismaClient.syncState.findUniqueOrThrow({ where: { id: STATE_ID } });
    expect(state.lastPage).toBe(2);
    expect(state.isComplete).toBe(false);
  });
});
