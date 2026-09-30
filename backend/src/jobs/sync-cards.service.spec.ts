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
import { RedisService } from '../redis/index.js';
import { SyncCardsService } from './sync-cards.service.js';
import { SyncSetsService } from './sync-sets.service.js';

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
  const redisValues = new Map<string, string>();

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
    const redis = {
      get: async (key: string) => redisValues.get(key) ?? null,
      getNumber: async (key: string) => {
        const value = redisValues.get(key);
        return value === undefined ? null : Number(value);
      },
      set: async (key: string, value: string) => {
        redisValues.set(key, value);
      },
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        SyncCardsService,
        SyncSetsService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: RedisService, useValue: redis },
        { provide: CARD_DATA_PROVIDER, useValue: provider },
      ],
    }).compile();

    service = moduleRef.get(SyncCardsService);
  });

  afterAll(async () => {
    await prismaClient.card.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
    await prismaClient.cardSet.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
    await prismaClient.$disconnect();
    await moduleRef.close();
  });

  beforeEach(async () => {
    await prismaClient.card.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
    await prismaClient.cardSet.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
    redisValues.clear();
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
