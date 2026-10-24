import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/index.js';
import { TcgcsvPriceProvider } from '../providers/tcgcsv-price.provider.js';
import { TcgcsvService } from '../../jobs/tcgcsv/tcgcsv.service.js';
import { TcgcsvClient } from '../../jobs/tcgcsv/tcgcsv.client.js';
import { CollectionComparisonService } from '../../jobs/collection-comparison.service.js';
import { CollectionPriceRefreshService } from './collection-price-refresh.service.js';
import { CollectionsService } from './collections.service.js';
import { PortfolioService } from './portfolio.service.js';

const provider = new TcgcsvPriceProvider();
const db = new PrismaClient();
const prisma = db as PrismaService;
const prefix = `collection-refresh-${randomUUID()}`;
const groupId = 991732458;
let userId: string;
let collectionId: string;
const cardId = `${prefix}-card`;
const snapshots = new CollectionComparisonService(prisma, provider);
const client = new TcgcsvClient();
const network = vi.spyOn(client, 'fetchFeed').mockRejectedValue(new Error('Una lectura no descarga feeds'));
const ingestion = new TcgcsvService(prisma, client, snapshots);
vi.spyOn(ingestion, 'enabled').mockReturnValue(true);
const refresh = new CollectionPriceRefreshService(prisma, provider, ingestion);
const portfolio = new PortfolioService(prisma, provider, refresh, snapshots);

beforeAll(async () => {
  userId = (await db.user.create({ data: { email: `${prefix}@test.local`, username: prefix, displayName: 'Prueba', passwordHash: 'test' } })).id;
  await db.cardSet.create({ data: { id: prefix, name: 'Prueba' } });
  await db.card.create({ data: { id: cardId, name: 'Prueba', number: '1', supertype: 'Pokémon', subtypes: [], types: [], setId: prefix, imageSmall: '/test.png', imageLarge: '/test.png', rawJson: {} } });
  await db.cardSetExternalId.create({ data: { provider: 'tcgcsv', setId: prefix, externalId: String(groupId) } });
  collectionId = (await db.collection.create({ data: { userId, name: 'Prueba' } })).id;
  await db.collectionItem.create({ data: { collectionId, cardId, variant: 'holofoil', quantity: 2 } });
});
afterAll(async () => {
  await db.user.deleteMany({ where: { email: `${prefix}@test.local` } });
  await db.$executeRaw`DELETE FROM tcgcsv_group_jobs WHERE "groupId" = ${groupId}`;
  await db.cardSet.deleteMany({ where: { id: prefix } });
  await db.$disconnect();
});
beforeEach(async () => {
  network.mockClear();
  await db.cardPrice.deleteMany({ where: { cardId } });
  await db.$executeRaw`DELETE FROM tcgcsv_group_jobs WHERE "groupId" = ${groupId}`;
});

async function price(variant = 'holofoil', hours = 0, market = 12, source = 'tcgplayer', currency = 'USD') {
  await db.cardPrice.create({ data: { cardId, variant, market, provider: 'tcgcsv', source, currency, fetchedAt: new Date(Date.now() - hours * 3600000) } });
}

it('una normal reciente no bloquea la holo faltante, deduplica el grupo y respeta ownership', async () => {
  await price('normal');
  expect(await refresh.enqueue('otro-usuario', collectionId)).toBe(0);
  expect(await refresh.enqueue(userId, collectionId)).toBe(1);
  expect(await refresh.enqueue(userId, collectionId)).toBe(0);
  expect(await db.$queryRaw`SELECT status FROM tcgcsv_group_jobs WHERE "groupId" = ${groupId}`).toEqual([{ status: 'pending' }]);
  expect(await db.priceRefreshJob.count({ where: { cardId } })).toBe(0);
  expect(network).not.toHaveBeenCalled();
});

it('solicita vencidas y no confunde otra moneda o mercado con una referencia vigente', async () => {
  await price('holofoil', 25);
  await price('holofoil', 0, 99, 'cardmarket', 'EUR');
  expect(await refresh.enqueue(userId, collectionId)).toBe(1);
  await db.$executeRaw`DELETE FROM tcgcsv_group_jobs WHERE "groupId" = ${groupId}`;
  await price('holofoil', 0, 20);
  expect(await refresh.enqueue(userId, collectionId)).toBe(0);
});

it('no roba un lease processing ni adelanta backoff o reserva de descarga al reencolar', async () => {
  await refresh.enqueue(userId, collectionId);
  const future = new Date(Date.now() + 3600000);
  await db.$executeRaw`UPDATE tcgcsv_group_jobs SET status = 'processing', "lastError" = 'backoff conservado', "lockedBy" = 'worker-test', "leaseUntil" = ${future}, "availableAt" = ${future} WHERE "groupId" = ${groupId}`;
  expect(await refresh.enqueue(userId, collectionId)).toBe(0);
  const [processing] = await db.$queryRaw<{ status: string; lockedBy: string; lastError: string }[]>`SELECT status, "lockedBy", "lastError" FROM tcgcsv_group_jobs WHERE "groupId" = ${groupId}`;
  expect(processing).toEqual({ status: 'processing', lockedBy: 'worker-test', lastError: 'backoff conservado' });
  await db.$executeRaw`UPDATE tcgcsv_group_jobs SET status = 'failed', "lockedBy" = NULL, "leaseUntil" = NULL, "downloadStartedAt" = NOW() WHERE "groupId" = ${groupId}`;
  expect(await refresh.enqueue(userId, collectionId)).toBe(1);
  const [pending] = await db.$queryRaw<{ availableAt: Date; lastError: string }[]>`SELECT "availableAt", "lastError" FROM tcgcsv_group_jobs WHERE "groupId" = ${groupId}`;
  expect(pending!.availableAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600000);
  expect(pending!.lastError).toBe('backoff conservado');
  expect(await refresh.enqueue(userId, collectionId)).toBe(0);
});

it('la cotización confirmada cambia total y ranking sin escribir snapshots del circuito anterior', async () => {
  await price('holofoil', 25, 10);
  expect((await portfolio.summary(userId)).valueUsd).toBe(20);
  await price('holofoil', 0, 15);
  const result = await portfolio.summary(userId);
  expect(result.valueUsd).toBe(30);
  expect(result.topCards[0]).toMatchObject({ marketUsd: 15, valueUsd: 30, quantity: 2 });
  expect(result.history.at(-1)?.valueUsd).toBe(30);
  expect(await db.portfolioSnapshot.count({ where: { userId } })).toBe(0);
  const collections = new CollectionsService(prisma, provider, undefined, undefined, refresh);
  expect((await collections.findOne(userId, collectionId)).totalValueUsd).toBe(30);
  expect(network).not.toHaveBeenCalled();
});
