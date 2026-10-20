import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';
import type { PriceProvider, RemoteCardPrice } from '../modules/providers/card-provider.interface.js';
import { PriceQueueService } from './price-queue.service.js';
import { PriceQueueWorker } from './price-queue.worker.js';
import { ProviderRateGate } from './provider-rate.gate.js';
import { SyncPricesService } from './sync-prices.service.js';

const PREFIX = 'test-priority-acceptance-';
const MAPPED = `${PREFIX}mapped`;
const UNMAPPED = `${PREFIX}unmapped`;
const CARD = `${MAPPED}-1`;
const MISSING = `${UNMAPPED}-1`;
const day = () => new Date(new Date().toISOString().slice(0, 10));

describe('Precios diarios: recuperación y evidencia real', () => {
  const db = new PrismaClient();
  const prisma = db as unknown as PrismaService;
  const provider: PriceProvider = { id: 'tcgdex', defaultSource: 'tcgplayer', defaultCurrency: 'USD',
    listSets: async () => [], getSetDetail: async () => null,
    getCardPrices: vi.fn(async (cardId: string): Promise<RemoteCardPrice[]> => [
      { cardId, variant: 'normal', low: null, mid: null, high: null, market: 3.25, source: 'tcgplayer', currency: 'USD' },
    ]),
  };
  const queue = new PriceQueueService(prisma);
  const gate = new ProviderRateGate(prisma, provider);
  const redis = { getJson: async () => null, setJson: async () => undefined, del: async () => undefined } as unknown as RedisService;
  const sync = new SyncPricesService(prisma, redis, gate, queue, { resolve: async () => null }, provider);
  let worker: PriceQueueWorker | undefined;
  let originalRate: Awaited<ReturnType<typeof db.providerRateLimit.findUnique>>;

  beforeAll(async () => {
    originalRate = await db.providerRateLimit.findUnique({ where: { providerId: 'tcgdex' } });
    await db.cardSet.createMany({ data: [{ id: MAPPED, name: 'Acceptance mapped', tcgdexSetId: MAPPED }, { id: UNMAPPED, name: 'Acceptance unmapped' }] });
    await db.card.createMany({ data: [[MAPPED, CARD], [UNMAPPED, MISSING]].map(([setId, id]) => ({
      id, setId, name: 'Acceptance', number: '1', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {},
    })) });
    await db.priceSyncSet.createMany({ data: [MAPPED, UNMAPPED].map((setId) => ({ setId, origin: 'manual' as const, priority: 1 })) });
  });
  beforeEach(async () => {
    gate.setGapMs(0);
    vi.mocked(provider.getCardPrices).mockClear().mockImplementation(async (cardId) => [
      { cardId, variant: 'normal', low: null, mid: null, high: null, market: 3.25, source: 'tcgplayer', currency: 'USD' },
    ]);
    await db.providerRateLimit.deleteMany({ where: { providerId: 'tcgdex' } });
    await db.priceRefreshJob.deleteMany({ where: { cardId: { startsWith: PREFIX } } });
    await db.cardPrice.deleteMany({ where: { cardId: { startsWith: PREFIX } } });
    await db.priceSyncCardDay.deleteMany({ where: { cardId: { startsWith: PREFIX } } });
    await db.priceSyncSetDay.deleteMany({ where: { setId: { startsWith: PREFIX } } });
  });
  afterEach(async () => { await worker?.onModuleDestroy(); worker = undefined; vi.useRealTimers(); });
  afterAll(async () => {
    await db.cardSet.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await db.providerRateLimit.deleteMany({ where: { providerId: 'tcgdex' } });
    if (originalRate) await db.providerRateLimit.create({ data: originalRate });
    await db.$disconnect();
  });
  async function target(cardId = CARD, setId = MAPPED): Promise<void> {
    const syncDate = day();
    await db.priceSyncSetDay.create({ data: { provider: 'tcgdex', setId, syncDate, expectedCards: 1, status: 'running' } });
    await db.priceSyncCardDay.create({ data: { provider: 'tcgdex', cardId, setId, syncDate } });
  }
  async function start(flag = 'true'): Promise<void> {
    worker = new PriceQueueWorker(queue, gate, sync, { get: () => flag } as unknown as ConfigService);
    worker.setPollInterval(5, 10);
    await worker.onModuleInit();
  }
  async function finished(cardId = CARD): Promise<void> {
    await vi.waitFor(async () => expect(await db.priceRefreshJob.findUniqueOrThrow({ where: { cardId } })).toMatchObject({ status: 'completed' }), { timeout: 3000 });
  }
  it('tras persistir y caer antes de complete recupera el job sin otra llamada ni intento', async () => {
    await target();
    await sync.fetchAndStoreWithOutcome(CARD);
    await queue.enqueueMany([CARD], 'daily', day());
    await db.priceRefreshJob.update({ where: { cardId: CARD }, data: { status: 'processing', lockedBy: 'proceso-caído', lockedAt: new Date(Date.now() - 20 * 60_000), attempts: 1 } });
    expect(await queue.reconcileAbandoned()).toBe(1);
    await start(); await finished();
    expect(provider.getCardPrices).toHaveBeenCalledTimes(1);
    expect(await db.cardPrice.count({ where: { cardId: CARD } })).toBe(1);
    expect(await db.priceRefreshJob.findUniqueOrThrow({ where: { cardId: CARD } })).toMatchObject({ attempts: 1 });
  });
  it('unmapped termina sin HTTP ni consumir un intento', async () => {
    await target(MISSING, UNMAPPED); await queue.enqueueMany([MISSING], 'daily', day());
    await start(); await finished(MISSING);
    expect(provider.getCardPrices).not.toHaveBeenCalled();
    expect(await db.priceRefreshJob.findUniqueOrThrow({ where: { cardId: MISSING } })).toMatchObject({ attempts: 0 });
    expect(await db.priceSyncCardDay.findFirstOrThrow({ where: { cardId: MISSING } })).toMatchObject({ status: 'unmapped', attempts: 0, quoteCount: 0 });
  });
  it('un error con backoff conserva objetivo pendiente hasta agotar los intentos', async () => {
    await target(); vi.mocked(provider.getCardPrices).mockRejectedValue(new Error('fallo simulado'));
    await queue.enqueueMany([CARD], 'daily', day()); await start();
    await vi.waitFor(async () => {
      expect(await db.priceRefreshJob.findUniqueOrThrow({ where: { cardId: CARD } })).toMatchObject({ status: 'pending', attempts: 1 });
      expect(await db.priceSyncCardDay.findFirstOrThrow({ where: { cardId: CARD } })).toMatchObject({ status: 'pending', attempts: 1 });
      expect(await db.priceSyncSetDay.findFirstOrThrow({ where: { setId: MAPPED } })).toMatchObject({ status: 'running', finishedAt: null });
    }, { timeout: 3000 });
  });
  it.each(['false', '0', 'no'])('flag %s impide iniciar el consumidor', async (flag) => {
    await queue.enqueueAsync(CARD); await start(flag);
    expect(await db.priceRefreshJob.findUniqueOrThrow({ where: { cardId: CARD } })).toMatchObject({ status: 'pending', attempts: 0 });
    expect(provider.getCardPrices).not.toHaveBeenCalled();
  });
  it('precio idéntico consultado en dos días genera dos observaciones; un fallback no genera otra', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const current = Date.now();
    vi.setSystemTime(current - 86_400_000); await sync.fetchAndStoreWithOutcome(CARD, true);
    vi.setSystemTime(current); await sync.fetchAndStoreWithOutcome(CARD, true);
    expect(await db.cardPrice.count({ where: { cardId: CARD } })).toBe(2);
    vi.setSystemTime(current + 86_400_000); vi.mocked(provider.getCardPrices).mockResolvedValue([]);
    const fallback = await sync.fetchAndStoreWithOutcome(CARD, true);
    expect(fallback.status).toBe('no_quote'); expect(fallback.quoteCount).toBe(0);
    expect(await db.cardPrice.count({ where: { cardId: CARD } })).toBe(2);
  });
  it('el resultado que cruza medianoche se acredita al día de finalización', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); const today = day();
    vi.setSystemTime(today.getTime() - 1000);
    vi.mocked(provider.getCardPrices).mockImplementation(async (cardId) => {
      vi.setSystemTime(today.getTime() + 1000);
      return [{ cardId, variant: 'normal', market: 0, low: null, mid: null, high: null, source: 'tcgplayer', currency: 'USD' }];
    });
    await sync.fetchAndStoreWithOutcome(CARD);
    const observation = await db.priceSyncCardDay.findFirstOrThrow({ where: { cardId: CARD } });
    expect(observation.syncDate).toEqual(today); expect(observation.status).toBe('quoted');
    expect(await db.priceSyncCardDay.count({ where: { cardId: CARD } })).toBe(1);
  });
});
