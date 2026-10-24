import { PrismaClient } from '@prisma/client';
import { Test, type TestingModule } from '@nestjs/testing';
import type { PrismaService } from '../../prisma/index.js';
import type { RedisService } from '../../redis/redis.service.js';
import { PRICE_PROVIDER, type PriceProvider } from '../../modules/providers/card-provider.interface.js';
import { ProvidersModule } from '../../modules/providers/providers.module.js';
import { CollectionsService } from '../../modules/collections/collections.service.js';
import { CollectionPriceRefreshService } from '../../modules/collections/collection-price-refresh.service.js';
import { PortfolioService } from '../../modules/collections/portfolio.service.js';
import { ListItemsDto } from '../../modules/collections/dto/list-items.dto.js';
import { SyncPricesService } from '../sync-prices.service.js';
import { PriceQueueService } from '../price-queue.service.js';
import { ProviderRateGate } from '../provider-rate.gate.js';
import { CollectionComparisonService } from '../collection-comparison.service.js';
import { CardComparisonService } from '../card-comparison.service.js';
import { TcgcsvService } from './tcgcsv.service.js';
import { TcgcsvClient } from './tcgcsv.client.js';

const SET = 'test-single-source-set';
const CARD = 'test-single-source-card';
const MISSING = 'test-single-source-missing';
const GROUP = 991732456;
const EMAIL = 'single-source@test.local';

describe('TCGCSV como única fuente activa', () => {
  const db = new PrismaClient();
  const prisma = db as PrismaService;
  let moduleRef: TestingModule;
  let provider: PriceProvider;
  let userId: string;
  let collectionId: string;
  let ingestion: TcgcsvService;
  let snapshots: CollectionComparisonService;
  let collections: CollectionsService;
  let refresh: CollectionPriceRefreshService;
  let sync: SyncPricesService;
  const previousFlag = process.env.ENABLE_TCGCSV_INGESTION;
  const client = new TcgcsvClient();
  const network = vi.spyOn(client, 'fetchFeed').mockRejectedValue(new Error('No debe haber red desde una lectura'));
  const redisRead = vi.fn();
  const mapping = { resolve: vi.fn(async () => null) };

  beforeAll(async () => {
    process.env.ENABLE_TCGCSV_INGESTION = 'true';
    moduleRef = await Test.createTestingModule({ imports: [ProvidersModule] }).compile();
    provider = moduleRef.get<PriceProvider>(PRICE_PROVIDER);
    snapshots = new CollectionComparisonService(prisma, provider);
    ingestion = new TcgcsvService(prisma, client, snapshots);
    refresh = new CollectionPriceRefreshService(prisma, provider, ingestion);
    sync = new SyncPricesService(prisma, { getJson: redisRead } as unknown as RedisService,
      new ProviderRateGate(prisma, provider), new PriceQueueService(prisma), mapping, provider, ingestion);
    collections = new CollectionsService(prisma, provider);
    userId = (await db.user.create({ data: { email: EMAIL, username: 'single_source', displayName: 'Prueba', passwordHash: 'test-only' } })).id;
    await db.cardSet.create({ data: { id: SET, name: 'Prueba fuente única' } });
    await db.card.createMany({ data: [CARD, MISSING].map((id) => ({ id, setId: SET, name: id, number: id === CARD ? '1' : '2', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '/test.png', imageLarge: '/test.png', rawJson: {} })) });
    await db.cardSetExternalId.create({ data: { provider: 'tcgcsv', setId: SET, externalId: String(GROUP) } });
    collectionId = (await db.collection.create({ data: { userId, name: 'Dos Umbreon', isDefault: true } })).id;
    await db.collectionItem.create({ data: { collectionId, cardId: CARD, variant: 'holofoil', quantity: 2 } });
  });
  beforeEach(async () => {
    await db.cardPrice.deleteMany({ where: { cardId: { in: [CARD, MISSING] } } });
    await db.$executeRaw`DELETE FROM tcgcsv_group_jobs WHERE "groupId" = ${GROUP}`;
    await db.cardPrice.createMany({ data: [
      { cardId: CARD, variant: 'holofoil', market: '1.09', provider: 'tcgcsv', source: 'tcgplayer', currency: 'USD', feedPublishedAt: new Date() },
      { cardId: CARD, variant: 'holofoil', market: '999', provider: 'tcgdex', source: 'tcgplayer', currency: 'USD' },
      { cardId: MISSING, variant: 'holofoil', market: '777', provider: 'tcgdex', source: 'tcgplayer', currency: 'USD' },
    ] });
    network.mockClear(); redisRead.mockClear(); mapping.resolve.mockClear();
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { email: EMAIL } });
    await db.$executeRaw`DELETE FROM tcgcsv_group_jobs WHERE "groupId" = ${GROUP}`;
    await db.cardSet.deleteMany({ where: { id: SET } });
    if (previousFlag === undefined) delete process.env.ENABLE_TCGCSV_INGESTION;
    else process.env.ENABLE_TCGCSV_INGESTION = previousFlag;
    await moduleRef.close();
    await db.$disconnect();
  });

  it('usa la inyección real y suma USD 2,18 en listado, stats, sets y portafolio', async () => {
    expect(provider.id).toBe('tcgcsv');
    const [listed] = await collections.list(userId);
    const stats = await collections.getStats(userId, collectionId);
    const items = await collections.listItems(userId, collectionId, Object.assign(new ListItemsDto(), { page: 1, pageSize: 50 }));
    const sets = await collections.getSetProgress(userId, collectionId);
    const portfolio = await new PortfolioService(prisma, provider, refresh, snapshots).summary(userId);
    expect(listed.totalValueUsd).toBe(2.18);
    expect(listed.valuation.coverage).toMatchObject({ pricedCopies: 2, unpricedCopies: 0 });
    expect(stats.totalValueUsd).toBe(2.18);
    expect(items.data[0]!.price).toMatchObject({ market: 1.09, provider: 'tcgcsv', variant: 'holofoil' });
    expect(sets[0]!.valueUsd).toBe(2.18);
    expect(portfolio.valueUsd).toBe(2.18);
    expect(portfolio.history.at(-1)?.valueUsd).toBe(2.18);
    expect(await db.portfolioSnapshot.count({ where: { userId } })).toBe(0);
    expect(network).not.toHaveBeenCalled();
  });

  it('lee el lote confirmado sin fallback ni caché obsoleta y jamás vuelve a fecharlo', async () => {
    expect((await sync.getPricesForCard(CARD))[0]!.market).toBe(1.09);
    expect(await sync.getPricesForCard(MISSING)).toEqual([]);
    await db.cardPrice.create({ data: { cardId: CARD, variant: 'holofoil', market: '1.20', provider: 'tcgcsv', source: 'tcgplayer', currency: 'USD', fetchedAt: new Date(Date.now() + 1) } });
    expect((await sync.getPricesForCard(CARD))[0]!.market).toBe(1.2);
    const count = await db.cardPrice.count({ where: { cardId: CARD } });
    await sync.refresh(CARD);
    await sync.fetchAndStore(CARD);
    expect(await sync.refreshMany([CARD, MISSING])).toMatchObject({ refreshed: 0, failed: 0, queued: 0 });
    expect(await db.cardPrice.count({ where: { cardId: CARD } })).toBe(count);
    expect(mapping.resolve).not.toHaveBeenCalled();
    expect(redisRead).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it('encola un grupo por lote con ownership, deduplicación y cooldown de 24 horas', async () => {
    await db.cardPrice.deleteMany({ where: { cardId: CARD, provider: 'tcgcsv' } });
    expect(await refresh.enqueue('otro-usuario', collectionId)).toBe(0);
    expect(await refresh.enqueue(userId, collectionId)).toBe(1);
    expect(await ingestion.enqueueCards([CARD, MISSING, CARD])).toBe(0);
    const next = new Date(Date.now() + 86400000);
    await db.$executeRaw`UPDATE tcgcsv_group_jobs SET status = 'completed', "downloadStartedAt" = NOW(), "availableAt" = ${next} WHERE "groupId" = ${GROUP}`;
    expect(await ingestion.enqueueCards([CARD])).toBe(1);
    const [job] = await db.$queryRaw<{ availableAt: Date }[]>`SELECT "availableAt" FROM tcgcsv_group_jobs WHERE "groupId" = ${GROUP}`;
    expect(job.availableAt.getTime()).toBeGreaterThanOrEqual(next.getTime());
    expect(await db.priceRefreshJob.count({ where: { cardId: { in: [CARD, MISSING] } } })).toBe(0);
    expect(network).not.toHaveBeenCalled();
  });

  it('rechaza asociaciones ambiguas y devuelve sólo la serie de TCGCSV', async () => {
    const comparison = await new CardComparisonService(prisma, ingestion, provider).comparison(CARD, { variant: 'holofoil', days: 30 });
    expect(comparison.activeProvider).toBe('tcgcsv');
    expect(comparison.series).toHaveLength(1);
    expect(comparison.series[0]!.provider).toBe('tcgcsv');
    const history = await snapshots.comparison(userId, collectionId);
    expect(history.series.map((series) => series.provider)).toEqual(['tcgcsv']);
    await db.$executeRaw`DELETE FROM tcgcsv_group_jobs WHERE "groupId" = ${GROUP}`;
    const ambiguous = await db.cardSetExternalId.create({ data: { provider: 'tcgcsv', setId: SET, externalId: '991732457' } });
    try { expect(await ingestion.enqueueCards([CARD])).toBe(0); }
    finally { await db.cardSetExternalId.delete({ where: { provider_externalId: { provider: ambiguous.provider, externalId: ambiguous.externalId } } }); }
  });
});
