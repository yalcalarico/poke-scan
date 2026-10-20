import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PriceQueueService } from './price-queue.service.js';
import { PriceSyncDailyService } from './price-sync-daily.service.js';
import type { PriceSyncRegistryService } from './price-sync-registry.service.js';

const PREFIX = 'test-daily-h2-';
const SET_HIGH = `${PREFIX}high`;
const SET_LOW = `${PREFIX}low`;
const SET_DISABLED = `${PREFIX}disabled`;
const CARD_HIGH = `${PREFIX}card-high`;
const CARD_LOW = `${PREFIX}card-low`;
const CARD_DISABLED = `${PREFIX}card-disabled`;

describe('planificación diaria TCGdex (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const queue = new PriceQueueService(prisma as unknown as PrismaService);
  const registry = {
    ensureCuratedSeed: vi.fn(async () => ({ inserted: 0, missingSetIds: [] })),
    reconcileCollectionSets: vi.fn(async () => 0),
  } as unknown as PriceSyncRegistryService;
  const config = { get: () => 'true' } as unknown as ConfigService;
  const daily = new PriceSyncDailyService(prisma as unknown as PrismaService, queue, registry, config);

  const today = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  };

  async function clean(): Promise<void> {
    await prisma.priceRefreshJob.deleteMany({ where: { cardId: { startsWith: PREFIX } } });
    await prisma.priceSyncCardDay.deleteMany({ where: { cardId: { startsWith: PREFIX } } });
    await prisma.priceSyncSetDay.deleteMany({ where: { setId: { startsWith: PREFIX } } });
    await prisma.priceSyncSet.deleteMany({ where: { setId: { startsWith: PREFIX } } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.cardSet.createMany({ data: [
      { id: SET_HIGH, name: 'Prioridad alta' },
      { id: SET_LOW, name: 'Prioridad baja' },
      { id: SET_DISABLED, name: 'Deshabilitado' },
    ] });
    await prisma.card.createMany({ data: [
      { id: CARD_HIGH, setId: SET_HIGH, name: 'Alta', number: '1', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} },
      { id: CARD_LOW, setId: SET_LOW, name: 'Baja', number: '1', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} },
      { id: CARD_DISABLED, setId: SET_DISABLED, name: 'Fuera de ciclo', number: '1', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} },
    ] });
    await prisma.priceSyncSet.createMany({ data: [
      { setId: SET_HIGH, origin: 'curated', priority: 1 },
      { setId: SET_LOW, origin: 'collection', priority: 100 },
      { setId: SET_DISABLED, origin: 'manual', enabled: false, priority: 2 },
    ] });
  });

  beforeEach(async () => {
    await clean();
    await prisma.priceSyncSet.createMany({ data: [
      { setId: SET_HIGH, origin: 'curated', priority: 1 },
      { setId: SET_LOW, origin: 'collection', priority: 100 },
      { setId: SET_DISABLED, origin: 'manual', enabled: false, priority: 2 },
    ] });
  });

  afterAll(async () => {
    await clean();
    await prisma.card.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await prisma.cardSet.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it('deduplica dos planificadores y sólo cambia de objetivo en el nuevo día UTC', async () => {
    const d0 = today();
    const yesterday = new Date(d0.getTime() - 86_400_000);
    expect(await daily.planToday(false, SET_HIGH, new Date(yesterday.getTime() + 3 * 60 * 60_000 + 14 * 60_000 + 59_000))).toBe(0);
    await daily.planToday(false, SET_HIGH, new Date(yesterday.getTime() + 3 * 60 * 60_000 + 15 * 60_000));
    await Promise.all([
      daily.planToday(true, SET_HIGH, new Date(d0.getTime() + 3 * 60 * 60_000 + 15 * 60_000)),
      daily.planToday(true, SET_HIGH, new Date(d0.getTime() + 3 * 60 * 60_000 + 15 * 60_000)),
    ]);
    expect(await prisma.priceSyncCardDay.count({ where: { provider: 'tcgdex', cardId: CARD_HIGH } })).toBe(2);
    expect(await prisma.priceRefreshJob.count({ where: { cardId: CARD_HIGH } })).toBe(1);
    const job = await prisma.priceRefreshJob.findUniqueOrThrow({ where: { cardId: CARD_HIGH } });
    expect(job.syncDate?.toISOString().slice(0, 10)).toBe(d0.toISOString().slice(0, 10));
    expect(await prisma.priceSyncSetDay.findUniqueOrThrow({
      where: { provider_setId_syncDate: { provider: 'tcgdex', setId: SET_HIGH, syncDate: d0 } },
    })).toMatchObject({ expectedCards: 1, status: 'running' });
  });

  it('prioriza el set configurado sobre un job más antiguo, y luego interactivo', async () => {
    const date = today();
    await daily.planToday(true, SET_HIGH, date);
    await daily.planToday(true, SET_LOW, date);
    await prisma.priceRefreshJob.update({ where: { cardId: CARD_LOW }, data: { availableAt: new Date(Date.now() - 60_000) } });
    await queue.enqueueAsync(CARD_DISABLED);
    expect((await queue.claimNext('h2-priority'))?.cardId).toBe(CARD_DISABLED);
    await prisma.priceRefreshJob.deleteMany({ where: { cardId: { startsWith: PREFIX } } });
    await daily.planToday(true, SET_HIGH, date);
    await daily.planToday(true, SET_LOW, date);
    await prisma.priceRefreshJob.update({ where: { cardId: CARD_LOW }, data: { availableAt: new Date(Date.now() - 60_000) } });
    expect((await queue.claimNext('h2-priority'))?.cardId).toBe(CARD_HIGH);
  });

  it('difiere legacy ajeno y promueve los jobs legacy elegibles preservando lock y backoff', async () => {
    const syncDate = today();
    const future = new Date(Date.now() + 60_000);
    await prisma.priceRefreshJob.create({ data: { cardId: CARD_DISABLED, origin: 'legacy', availableAt: new Date(Date.now() - 60_000) } });
    await prisma.priceRefreshJob.create({ data: { cardId: CARD_HIGH, origin: 'legacy', availableAt: future, attempts: 3 } });
    await prisma.priceRefreshJob.create({ data: { cardId: CARD_LOW, origin: 'legacy', status: 'processing', availableAt: future, attempts: 2, lockedBy: 'instancia-h2', lockedAt: new Date() } });
    await queue.enqueueMany([CARD_HIGH, CARD_LOW], 'daily', syncDate);
    const high = await prisma.priceRefreshJob.findUniqueOrThrow({ where: { cardId: CARD_HIGH } });
    const low = await prisma.priceRefreshJob.findUniqueOrThrow({ where: { cardId: CARD_LOW } });
    expect(high).toMatchObject({ origin: 'daily', attempts: 3, availableAt: future });
    expect(low).toMatchObject({ origin: 'daily', status: 'processing', attempts: 2, lockedBy: 'instancia-h2', availableAt: future });
    const deferred = await prisma.priceRefreshJob.findUniqueOrThrow({ where: { cardId: CARD_DISABLED } });
    expect(deferred.origin).toBe('legacy');
    expect(await queue.claimNext('h2-legacy')).toBeNull();
  });

  it('una señal interactiva promueve legacy pendiente y processing sin resetearlos', async () => {
    const future = new Date(Date.now() + 60_000);
    const lockedAt = new Date(Date.now() - 5_000);
    await prisma.priceRefreshJob.create({ data: {
      cardId: CARD_HIGH, origin: 'legacy', status: 'pending', attempts: 3,
      availableAt: future, lastError: 'backoff',
    } });
    await prisma.priceRefreshJob.create({ data: {
      cardId: CARD_LOW, origin: 'legacy', status: 'processing', attempts: 2,
      availableAt: future, lockedBy: 'worker-legacy', lockedAt, lastError: 'en vuelo',
    } });

    await queue.enqueueMany([CARD_HIGH, CARD_LOW], 'interactive');

    expect(await prisma.priceRefreshJob.findUniqueOrThrow({ where: { cardId: CARD_HIGH } })).toMatchObject({
      origin: 'interactive', status: 'pending', attempts: 3, availableAt: future, lastError: 'backoff',
    });
    expect(await prisma.priceRefreshJob.findUniqueOrThrow({ where: { cardId: CARD_LOW } })).toMatchObject({
      origin: 'interactive', status: 'processing', attempts: 2, availableAt: future,
      lockedBy: 'worker-legacy', lockedAt, lastError: 'en vuelo',
    });
  });

  it('asocia un objetivo diario a un interactive activo sin degradar el lock ni el backoff', async () => {
    const syncDate = today();
    const future = new Date(Date.now() + 60_000);
    await prisma.priceSyncSetDay.create({ data: { provider: 'tcgdex', setId: SET_HIGH, syncDate, expectedCards: 1 } });
    await prisma.priceSyncCardDay.create({ data: { provider: 'tcgdex', cardId: CARD_HIGH, setId: SET_HIGH, syncDate } });
    await prisma.priceRefreshJob.create({ data: {
      cardId: CARD_HIGH, origin: 'interactive', status: 'processing', attempts: 4,
      availableAt: future, lockedBy: 'worker-interactivo', lockedAt: new Date(), lastError: 'backoff previo',
    } });
    await queue.enqueueMany([CARD_HIGH], 'daily', syncDate);
    const job = await prisma.priceRefreshJob.findUniqueOrThrow({ where: { cardId: CARD_HIGH } });
    expect(job).toMatchObject({
      origin: 'interactive', syncDate: null, status: 'processing', attempts: 4,
      availableAt: future, lockedBy: 'worker-interactivo', lastError: 'backoff previo',
    });
    expect(await prisma.priceSyncCardDay.findUniqueOrThrow({
      where: { provider_cardId_syncDate: { provider: 'tcgdex', cardId: CARD_HIGH, syncDate } },
    })).toMatchObject({ status: 'pending', attempts: 0 });
  });

  it('sólo reencola al cruzar medianoche si existe un objetivo habilitado para hoy', async () => {
    const syncDate = today();
    const yesterday = new Date(syncDate.getTime() - 86_400_000);
    await prisma.priceSyncSetDay.create({ data: { provider: 'tcgdex', setId: SET_HIGH, syncDate, expectedCards: 1 } });
    await prisma.priceSyncCardDay.create({ data: { provider: 'tcgdex', cardId: CARD_HIGH, setId: SET_HIGH, syncDate } });
    await prisma.priceSyncSetDay.create({ data: { provider: 'tcgdex', setId: SET_DISABLED, syncDate, expectedCards: 1 } });
    await prisma.priceSyncCardDay.create({ data: { provider: 'tcgdex', cardId: CARD_DISABLED, setId: SET_DISABLED, syncDate } });
    await prisma.priceRefreshJob.create({ data: { cardId: CARD_HIGH, origin: 'daily', syncDate: yesterday, status: 'completed' } });
    await prisma.priceRefreshJob.create({ data: { cardId: CARD_DISABLED, origin: 'daily', syncDate: yesterday, status: 'completed' } });

    expect(await queue.requeuePendingDailyTarget(CARD_HIGH, syncDate)).toBe(true);
    expect(await queue.requeuePendingDailyTarget(CARD_DISABLED, syncDate)).toBe(false);
    expect(await prisma.priceRefreshJob.findUniqueOrThrow({ where: { cardId: CARD_HIGH } })).toMatchObject({ status: 'pending', origin: 'daily', syncDate });
    expect(await prisma.priceRefreshJob.findUniqueOrThrow({ where: { cardId: CARD_DISABLED } })).toMatchObject({ status: 'completed', syncDate: yesterday });
  });

  it('no resucita cinco fallos del mismo día', async () => {
    const syncDate = today();
    const cooldown = new Date(Date.now() + 60 * 60_000);
    await prisma.priceSyncSetDay.create({ data: { provider: 'tcgdex', setId: SET_HIGH, syncDate, status: 'failed', expectedCards: 1 } });
    await prisma.priceSyncCardDay.create({ data: { provider: 'tcgdex', cardId: CARD_HIGH, setId: SET_HIGH, syncDate, status: 'failed', attempts: 5, lastError: 'agotado' } });
    await prisma.priceRefreshJob.create({ data: { cardId: CARD_HIGH, origin: 'daily', syncDate, status: 'failed', attempts: 5, availableAt: cooldown } });
    await daily.planToday(true, SET_HIGH, syncDate);
    expect(await prisma.priceSyncCardDay.findUniqueOrThrow({ where: { provider_cardId_syncDate: { provider: 'tcgdex', cardId: CARD_HIGH, syncDate } } })).toMatchObject({ status: 'failed', attempts: 5 });
    expect(await prisma.priceRefreshJob.findUniqueOrThrow({ where: { cardId: CARD_HIGH } })).toMatchObject({ status: 'failed', attempts: 5 });
    expect(await prisma.priceSyncSetDay.findUniqueOrThrow({
      where: { provider_setId_syncDate: { provider: 'tcgdex', setId: SET_HIGH, syncDate } },
    })).toMatchObject({ status: 'failed', expectedCards: 1 });

    const tomorrow = new Date(syncDate.getTime() + 86_400_000);
    await daily.planToday(true, SET_HIGH, tomorrow);
    expect(await prisma.priceSyncCardDay.findUniqueOrThrow({
      where: { provider_cardId_syncDate: { provider: 'tcgdex', cardId: CARD_HIGH, syncDate: tomorrow } },
    })).toMatchObject({ status: 'pending', attempts: 0 });
    expect(await prisma.priceRefreshJob.findUniqueOrThrow({ where: { cardId: CARD_HIGH } })).toMatchObject({
      status: 'pending', attempts: 0, syncDate: tomorrow, availableAt: cooldown,
    });
  });
});
