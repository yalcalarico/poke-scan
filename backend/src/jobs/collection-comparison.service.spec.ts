import { PrismaClient, Prisma } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../prisma/index.js';
import type { PriceProvider } from '../modules/providers/card-provider.interface.js';
import { CollectionComparisonService } from './collection-comparison.service.js';
import { CardComparisonService } from './card-comparison.service.js';
import { CardComparisonQueryDto } from './comparison.dto.js';
import type { TcgcsvService } from './tcgcsv/tcgcsv.service.js';

const SET = 'test-comparison-snapshots-set';
const CARD = 'test-comparison-snapshots-card';
const EMAIL = 'comparison-snapshots@test.local';
const OTHER_EMAIL = 'comparison-snapshots-other@test.local';
const provider = { id: 'tcgdex', defaultSource: 'tcgplayer', defaultCurrency: 'USD' } as PriceProvider;

describe('Comparación SQL: cortes, variante fija y ownership', () => {
  const prisma = new PrismaClient();
  let at = new Date('2026-10-01T12:00:00Z');
  const service = new CollectionComparisonService(prisma as PrismaService, provider, () => at);
  const cardService = new CardComparisonService(prisma as PrismaService, { enabled: () => false, enqueue: async () => undefined, groupForSet: async () => null } as unknown as TcgcsvService, provider, () => at);
  let userId: string;
  let otherUserId: string;
  let collectionId: string;
  let secondId: string;
  let itemId: string;
  const clean = async (): Promise<void> => {
    await prisma.user.deleteMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });
    await prisma.cardSet.deleteMany({ where: { id: SET } });
  };
  beforeEach(async () => {
    await clean();
    at = new Date('2026-10-01T12:00:00Z');
    const user = await prisma.user.create({ data: { email: EMAIL, username: 'comparison-snapshots', displayName: 'Comparación', passwordHash: 'fixture' } });
    const other = await prisma.user.create({ data: { email: OTHER_EMAIL, username: 'comparison-snapshots-other', displayName: 'Otro', passwordHash: 'fixture' } });
    userId = user.id; otherUserId = other.id;
    const collection = await prisma.collection.create({ data: { userId, name: 'Primera' } });
    const second = await prisma.collection.create({ data: { userId, name: 'Segunda' } });
    collectionId = collection.id; secondId = second.id;
    await prisma.cardSet.create({ data: { id: SET, name: 'Comparación' } });
    await prisma.card.create({ data: { id: CARD, name: 'Carta comparación', number: '1', setId: SET, supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} } });
    const item = await prisma.collectionItem.create({ data: { collectionId, cardId: CARD, variant: 'normal', quantity: 3 } });
    itemId = item.id;
    await prisma.collectionItem.create({ data: { collectionId: secondId, cardId: CARD, variant: 'holofoil', quantity: 2 } });
    await prisma.cardPrice.createMany({ data: [
      { cardId: CARD, variant: 'normal', provider: 'tcgdex', source: 'tcgplayer', currency: 'USD', market: new Prisma.Decimal('12.34'), fetchedAt: new Date('2026-10-01T10:00:00Z') },
      { cardId: CARD, variant: 'normal', provider: 'tcgcsv', source: 'tcgplayer', currency: 'USD', market: new Prisma.Decimal(0), fetchedAt: new Date('2026-10-01T11:00:00Z'), feedPublishedAt: new Date('2026-09-28T20:00:00Z') },
      { cardId: CARD, variant: 'holofoil', provider: 'tcgdex', source: 'tcgplayer', currency: 'USD', market: null, fetchedAt: new Date('2026-10-01T11:00:00Z') },
      { cardId: CARD, variant: 'normal', provider: 'tcgdex', source: 'cardmarket', currency: 'EUR', market: new Prisma.Decimal('900'), fetchedAt: new Date('2026-10-01T11:00:00Z') },
    ] });
  });
  afterAll(async () => { await clean(); await prisma.$disconnect(); });

  it('compara misma variante USD con cobertura por copias, cero válido y antigüedad del build', async () => {
    const result = await service.comparison(userId, collectionId);
    expect(result.series[0].current).toMatchObject({ valueUsd: 37.02, totalCopies: 3, pricedCopies: 3, unpricedCopies: 0, freshCopies: 3, staleCopies: 0, provisional: true });
    expect(result.series[1].current).toMatchObject({ valueUsd: 0, pricedCopies: 3, staleCopies: 3, freshCopies: 0 });
    expect((await service.comparison(userId, secondId)).series[0].current).toMatchObject({ valueUsd: null, totalCopies: 2, pricedCopies: 0, unpricedCopies: 2 });
    const portfolio = await service.comparison(userId, null);
    expect(portfolio.series[0].current).toMatchObject({ valueUsd: 37.02, totalCopies: 5, pricedCopies: 3, unpricedCopies: 2 });
    expect(portfolio.series[1].current).toMatchObject({ valueUsd: 0, totalCopies: 5, pricedCopies: 3, unpricedCopies: 2 });
  });
  it('no filtra existencia de colecciones ajenas y no captura sus datos', async () => {
    await expect(service.comparison(otherUserId, collectionId)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.collectionComparisonSnapshot.count({ where: { collectionId } })).toBe(0);
  });
  it('mantiene cerrado el pasado, marca composición y no reconstruye días ausentes', async () => {
    const first = await service.comparison(userId, collectionId);
    await prisma.collectionItem.update({ where: { id: itemId }, data: { quantity: 4 } });
    const changed = await service.comparison(userId, collectionId);
    expect(changed.series[0].current.valueUsd).toBe(49.36);
    expect(changed.series[0].current.compositionChanged).toBe(true);
    expect(changed.series[0].current.compositionFingerprint).not.toBe(first.series[0].current.compositionFingerprint);
    at = new Date('2026-10-03T12:00:00Z');
    await prisma.collectionItem.update({ where: { id: itemId }, data: { quantity: 1 } });
    const third = await service.comparison(userId, collectionId);
    expect(third.series[0].points.map((point) => point.date)).toEqual(['2026-10-01', '2026-10-03']);
    expect(third.series[0].points[0]).toMatchObject({ valueUsd: 49.36, totalCopies: 4, provisional: false });
    expect(third.series[0].current.valueUsd).toBe(12.34);
    at = new Date('2026-10-01T13:00:00Z');
    await expect(service.capture(userId)).rejects.toMatchObject({ status: 503 });
    expect(Number((await prisma.collectionComparisonSnapshot.findFirstOrThrow({ where: { collectionId, provider: 'tcgdex', day: new Date('2026-10-01T00:00:00Z') } })).valueUsd)).toBe(49.36);
  });
  it('omite en portfolio un corte incompleto tras borrar una colección y conserva cascade privada', async () => {
    await service.capture(userId);
    at = new Date('2026-10-02T12:00:00Z');
    await prisma.collection.delete({ where: { id: secondId } });
    const result = await service.comparison(userId, null);
    expect(result.series[0].points.map((point) => point.date)).toEqual(['2026-10-02']);
    expect(await prisma.collectionComparisonSnapshot.count({ where: { collectionId: secondId } })).toBe(0);
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.collectionComparisonSnapshot.count({ where: { collectionId } })).toBe(0);
  });
  it('dos capturas concurrentes conservan un solo punto por día/política/proveedor', async () => {
    await Promise.all([service.capture(userId), service.capture(userId)]);
    expect(await prisma.collectionComparisonSnapshot.count({ where: { collectionId } })).toBe(2);
    const portfolio = await service.comparison(userId, null);
    expect(portfolio.series.every((series) => series.points.length === 1)).toBe(true);
  });
  it('la serie de carta queda fija y mantiene null/gaps/fuentes separados', async () => {
    at = new Date('2026-10-03T12:00:00Z');
    await prisma.cardPrice.create({ data: { cardId: CARD, variant: 'normal', provider: 'tcgdex', market: null, fetchedAt: new Date('2026-10-03T11:00:00Z') } });
    await prisma.cardPrice.create({ data: { cardId: CARD, variant: 'holofoil', provider: 'tcgdex', market: new Prisma.Decimal(999), fetchedAt: new Date('2026-10-03T11:00:00Z') } });
    const result = await cardService.comparison(CARD, new CardComparisonQueryDto());
    expect(result.variant).toBe('normal');
    expect(result.series[0].points.map((point) => [point.date, point.market])).toEqual([['2026-10-01', 12.34], ['2026-10-03', null]]);
    expect(result.series[0].current?.market).toBeNull();
    expect(result.series[1].points.map((point) => point.market)).toEqual([0]);
    expect(result.series[1].current?.freshness).toBe('stale');
  });
  it('sin colecciones el cero es un estado vacío conocido, sin inventar históricos', async () => {
    const result = await service.comparison(otherUserId, null);
    expect(result.series[0].current).toMatchObject({ valueUsd: 0, totalCopies: 0 });
    expect(result.series[0].points).toEqual([]);
  });
});
