import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/index.js';
import type { PriceProvider } from '../providers/card-provider.interface.js';
import { CollectionPriceRefreshService } from './collection-price-refresh.service.js';
import { CollectionsService } from './collections.service.js';
import { PortfolioService } from './portfolio.service.js';

const provider = { id: 'tcgdex', defaultSource: 'tcgplayer', defaultCurrency: 'USD' } as PriceProvider;
const db = new PrismaClient();
const prefix = `collection-refresh-${randomUUID()}`;
let userId: string;
let collectionId: string;
const cardId = `${prefix}-card`;
const refresh = new CollectionPriceRefreshService(db as PrismaService, provider);
const portfolio = new PortfolioService(db as PrismaService, provider, refresh);

beforeAll(async () => {
  const user = await db.user.create({ data: { email: `${prefix}@test.local`, username: prefix, displayName: 'Prueba', passwordHash: 'test' } });
  userId = user.id;
  await db.cardSet.create({ data: { id: prefix, name: 'Prueba' } });
  await db.card.create({ data: { id: cardId, name: 'Prueba', number: '1', supertype: 'Pokémon', subtypes: [], types: [], setId: prefix, imageSmall: '/test.png', imageLarge: '/test.png', rawJson: {} } });
  collectionId = (await db.collection.create({ data: { userId, name: 'Prueba' } })).id;
  await db.collectionItem.create({ data: { collectionId, cardId, variant: 'holofoil', quantity: 2 } });
});
afterAll(async () => {
  await db.user.deleteMany({ where: { email: `${prefix}@test.local` } });
  await db.priceRefreshJob.deleteMany({ where: { cardId } });
  await db.card.deleteMany({ where: { id: cardId } });
  await db.cardSet.deleteMany({ where: { id: prefix } });
  await db.$disconnect();
});
beforeEach(async () => {
  await db.cardPrice.deleteMany({ where: { cardId } });
  await db.priceRefreshJob.deleteMany({ where: { cardId } });
});

async function price(variant = 'holofoil', hours = 0, market = 12, source = 'tcgplayer', currency = 'USD') {
  await db.cardPrice.create({ data: { cardId, variant, market, provider: 'tcgdex', source, currency, fetchedAt: new Date(Date.now() - hours * 3600000) } });
}

it('una normal reciente no bloquea la holo faltante, deduplica y respeta ownership', async () => {
  await price('normal');
  expect(await refresh.enqueue('otro-usuario', collectionId)).toBe(0);
  expect(await refresh.enqueue(userId, collectionId)).toBe(1);
  expect(await refresh.enqueue(userId, collectionId)).toBe(0);
  expect(await db.priceRefreshJob.count({ where: { cardId, status: 'pending' } })).toBe(1);
});

it('solicita vencidas y no confunde otra moneda o mercado con una referencia vigente', async () => {
  await price('holofoil', 25);
  await price('holofoil', 0, 99, 'cardmarket', 'EUR');
  expect(await refresh.enqueue(userId, collectionId)).toBe(1);
  await db.priceRefreshJob.deleteMany({ where: { cardId } });
  await price('holofoil', 0, 20);
  expect(await refresh.enqueue(userId, collectionId)).toBe(0);
});

it('conserva cooldown negativo, processing y backoff; el reintento explícito reactiva failed', async () => {
  const future = new Date(Date.now() + 3600000);
  await db.priceRefreshJob.create({ data: { cardId, status: 'completed', completedAt: new Date(), availableAt: future } });
  expect(await refresh.enqueue(userId, collectionId, true)).toBe(0);
  await db.priceRefreshJob.update({ where: { cardId }, data: { status: 'processing', origin: 'interactive' } });
  expect(await refresh.enqueue(userId, collectionId, true)).toBe(0);
  await db.priceRefreshJob.update({ where: { cardId }, data: { status: 'failed', attempts: 5 } });
  expect(await refresh.enqueue(userId, collectionId)).toBe(0);
  expect(await refresh.enqueue(userId, collectionId, true)).toBe(1);
  expect(await db.priceRefreshJob.findUnique({ where: { cardId } })).toMatchObject({ status: 'pending', availableAt: future, attempts: 0 });
});

it('una consulta directa de colección promueve legacy a interactive sin tocar lock ni backoff', async () => {
  const future = new Date(Date.now() + 3600000);
  const lockedAt = new Date(Date.now() - 5000);
  await db.priceRefreshJob.create({ data: {
    cardId, origin: 'legacy', status: 'processing', attempts: 3, availableAt: future,
    lockedBy: 'worker-legacy', lockedAt, lastError: 'backoff conservado',
  } });

  expect(await refresh.enqueue(userId, collectionId)).toBe(1);
  expect(await db.priceRefreshJob.findUniqueOrThrow({ where: { cardId } })).toMatchObject({
    origin: 'interactive', status: 'processing', attempts: 3, availableAt: future,
    lockedBy: 'worker-legacy', lockedAt, lastError: 'backoff conservado',
  });
});

it('la lectura solicita precios y una nueva cotización cambia total, ranking y punto diario sin duplicarlo', async () => {
  await price('holofoil', 25, 10);
  expect((await portfolio.summary(userId)).valueUsd).toBe(20);
  expect(await db.priceRefreshJob.count({ where: { cardId, status: 'pending' } })).toBe(1);
  await price('holofoil', 0, 15);
  const result = await portfolio.summary(userId);
  expect(result.valueUsd).toBe(30);
  expect(result.topCards[0]).toMatchObject({ marketUsd: 15, valueUsd: 30, quantity: 2 });
  expect(result.history.at(-1)?.valueUsd).toBe(30);
  expect(await db.portfolioSnapshot.count({ where: { userId } })).toBe(1);
  const collections = new CollectionsService(db as PrismaService, provider, undefined, undefined, refresh);
  expect((await collections.findOne(userId, collectionId)).totalValueUsd).toBe(30);
});

it('el corte diario registra el valor sin una visita y conserva días anteriores', async () => {
  await price('holofoil', 0, 18);
  const rollback = new Error('rollback del corte de prueba');
  await expect(db.$transaction(async (tx) => {
    await tx.portfolioSnapshot.deleteMany({ where: { userId } });
    await tx.portfolioSnapshot.create({ data: { userId, day: new Date('2025-01-01T00:00:00Z'), valueUsd: 5, totalCards: 1, unpricedCards: 0 } });
    await new PortfolioService(tx as PrismaService, provider).captureDaily();
    const observations = await tx.portfolioSnapshot.findMany({ where: { userId }, orderBy: { day: 'asc' } });
    expect(observations).toHaveLength(2);
    expect(observations.map((point) => point.valueUsd)).toEqual([5, 36]);
    throw rollback;
  })).rejects.toBe(rollback);
});
