import { NotFoundException } from '@nestjs/common';
import { PrismaClient, type PriceSyncSet } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  CURATED_PRICE_SYNC_SETS,
  PriceSyncRegistryService,
} from './price-sync-registry.service.js';

const SET = 'test-priority-registry-set';
const CARD = 'test-priority-registry-card';
const EMAIL = 'priority-registry@test.local';

describe('Registro diario de sets: persistencia real', () => {
  const prisma = new PrismaClient();
  const service = new PriceSyncRegistryService(prisma as PrismaService);
  let original: PriceSyncSet[] = [];
  let collectionId: string;

  beforeAll(async () => {
    original = await prisma.priceSyncSet.findMany();
    await prisma.cardSet.create({
      data: { id: SET, name: 'Set de prueba de prioridades' },
    });
    await prisma.card.create({
      data: {
        id: CARD,
        setId: SET,
        name: 'Carta de prueba',
        number: '1',
        supertype: 'Pokémon',
        subtypes: [],
        types: [],
        imageSmall: '',
        imageLarge: '',
        rawJson: {},
      },
    });
    const user = await prisma.user.create({
      data: {
        email: EMAIL,
        username: 'priority-registry',
        displayName: 'Prioridades',
        passwordHash: 'test-only',
      },
    });
    collectionId = (
      await prisma.collection.create({
        data: { userId: user.id, name: 'Prioridades' },
      })
    ).id;
  });

  beforeEach(async () => {
    await prisma.priceSyncSet.deleteMany();
    await prisma.collectionItem.deleteMany({ where: { collectionId } });
    await prisma.priceSyncCardDay.deleteMany({ where: { cardId: CARD } });
    await prisma.priceSyncSetDay.deleteMany({ where: { setId: SET } });
    await prisma.priceRefreshJob.deleteMany({ where: { cardId: CARD } });
  });

  afterAll(async () => {
    await prisma.priceSyncSet.deleteMany();
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.cardSet.deleteMany({ where: { id: SET } });
    if (original.length)
      await prisma.priceSyncSet.createMany({ data: original });
    await prisma.$disconnect();
  });

  it('inserta once IDs una sola vez y conserva prioridad y deshabilitación', async () => {
    expect(await service.ensureCuratedSeed()).toEqual({
      inserted: 11,
      missingSetIds: [],
    });
    const first = await prisma.priceSyncSet.findMany();
    expect(first.map(({ setId }) => setId).sort()).toEqual(
      CURATED_PRICE_SYNC_SETS.map(({ setId }) => setId).sort(),
    );
    expect(first.filter(({ priority }) => priority === 1)).toHaveLength(2);
    await prisma.priceSyncSet.update({
      where: { setId: 'me55' },
      data: { enabled: false, priority: 19 },
    });
    expect(await service.ensureCuratedSeed()).toEqual({
      inserted: 0,
      missingSetIds: [],
    });
    expect(
      await prisma.priceSyncSet.findUnique({ where: { setId: 'me55' } }),
    ).toMatchObject({ enabled: false, priority: 19, origin: 'curated' });
  });

  it('reconcilia sets usados por lote y no reactiva una baja manual', async () => {
    await prisma.collectionItem.create({
      data: { collectionId, cardId: CARD },
    });
    await service.reconcileCollectionSets();
    expect(
      await prisma.priceSyncSet.findUnique({ where: { setId: SET } }),
    ).toMatchObject({ enabled: true, origin: 'collection', priority: 100 });
    await prisma.priceSyncSet.update({ where: { setId: SET }, data: { enabled: false } });
    await service.reconcileCollectionSets();
    await service.enableForCollection(SET);
    expect(
      await prisma.priceSyncSet.findUnique({ where: { setId: SET } }),
    ).toMatchObject({ enabled: false, origin: 'collection' });
  });

  it('un alta de colección respeta la prioridad y baja operativa existentes', async () => {
    await service.ensureCuratedSeed();
    await prisma.priceSyncSet.update({ where: { setId: 'me55' }, data: { enabled: false, priority: 12 } });
    await service.enableForCollection('me55');
    expect(await prisma.priceSyncSet.findUnique({ where: { setId: 'me55' } }))
      .toMatchObject({ enabled: false, priority: 12, origin: 'curated' });
  });

  it('un alta de colección rechaza sets ausentes sin crear filas', async () => {
    await expect(service.enableForCollection('missing-registry-set')).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.priceSyncSet.count()).toBe(0);
  });

  it('impide duplicar objetivos y conserva legacy como origen de migración', async () => {
    const target = {
      provider: 'tcgdex',
      cardId: CARD,
      setId: SET,
      syncDate: new Date('2026-10-18T00:00:00Z'),
    };
    await prisma.priceSyncCardDay.create({ data: target });
    await expect(
      prisma.priceSyncCardDay.create({ data: target }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(
      await prisma.priceRefreshJob.create({ data: { cardId: CARD } }),
    ).toMatchObject({ origin: 'legacy', syncDate: null });
  });
});
