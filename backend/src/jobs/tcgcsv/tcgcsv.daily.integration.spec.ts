import { ProviderRateLimitError } from '../../common/errors/provider-rate-limit.error.js';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/index.js';
import type { CollectionComparisonService } from '../collection-comparison.service.js';
import { TcgcsvClient } from './tcgcsv.client.js';
import { TcgcsvService } from './tcgcsv.service.js';

const SUFFIX = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ENABLED_SET = `test-tcgcsv-daily-enabled-${SUFFIX}`;
const DISABLED_SET = `test-tcgcsv-daily-disabled-${SUFFIX}`;
const UNMAPPED_SET = `test-tcgcsv-daily-unmapped-${SUFFIX}`;
const BOUNDARY_SET = `test-tcgcsv-daily-boundary-${SUFFIX}`;
const GROUP_ENABLED = 990_000_001;
const GROUP_DISABLED = 990_000_002;
const GROUP_BOUNDARY = 990_000_003;
const PRODUCT = 990_100_001;
const BUILD = new Date('2026-10-18T20:05:44.000Z');
const NEXT_BUILD = new Date(Date.now() - 60 * 60 * 1000);
const CARD_ENABLED = `${ENABLED_SET}-001`;
const CARD_DISABLED = `${DISABLED_SET}-001`;
const CARD_UNMAPPED = `${UNMAPPED_SET}-001`;
const CARD_BOUNDARY = `${BOUNDARY_SET}-001`;

describe('TCGCSV: planificación diaria acotada (PostgreSQL real)', () => {
  const prisma = new PrismaClient();
  const client = new TcgcsvClient();
  const snapshots = { capture: async () => undefined };
  const service = new TcgcsvService(prisma as PrismaService, client, snapshots as unknown as CollectionComparisonService);
  const originalFlag = process.env.ENABLE_TCGCSV_INGESTION;
  let originalRate: { providerId: string; lastCalledAt: Date; blockedUntil: Date | null; updatedAt: Date } | null = null;
  let originalCounters: { requestCount: number; requestWindowStartedAt: Date } | null = null;
  let originalRuns: Array<{ id: string; provider: string; groupId: number; feedPublishedAt: Date; checksum: string; publishedAt: Date;
    mappedCards: number; unmappedCards: number; observations: number }> = [];
  let originalJobs: Array<{ groupId: number; status: string; availableAt: Date; lockedBy: string | null; leaseUntil: Date | null;
    downloadStartedAt: Date | null; publishedBuild: Date | null; lastError: string | null; updatedAt: Date; origin: 'legacy' | 'daily' | 'interactive'; syncDate: Date | null }> = [];

  beforeAll(async () => {
    originalJobs = await prisma.tcgcsvGroupJob.findMany({ where: { groupId: { in: [GROUP_ENABLED, GROUP_DISABLED, GROUP_BOUNDARY] } } });
    originalRate = await prisma.providerRateLimit.findUnique({ where: { providerId: 'tcgcsv' } });
    [originalCounters] = await prisma.$queryRaw<typeof originalCounters[]>`SELECT "requestCount", "requestWindowStartedAt" FROM tcgcsv_discovery_state WHERE id = 'global'`;
    originalRuns = await prisma.priceIngestionRun.findMany({ where: { provider: 'tcgcsv', groupId: GROUP_ENABLED } });
    process.env.ENABLE_TCGCSV_INGESTION = 'true';
    vi.spyOn(client, 'fetchFeed');
    for (const [setId, name, cardId] of [
      [ENABLED_SET, 'Selected test set', CARD_ENABLED],
      [DISABLED_SET, 'Disabled test set', CARD_DISABLED],
      [UNMAPPED_SET, 'Unmapped test set', CARD_UNMAPPED],
      [BOUNDARY_SET, 'Boundary test set', CARD_BOUNDARY],
    ] as const) {
      await prisma.cardSet.create({ data: { id: setId, name, printedTotal: 1 } });
      await prisma.card.create({ data: { id: cardId, name, number: '1', setId, language: 'en', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} } });
    }
    await prisma.priceSyncSet.createMany({ data: [
      { setId: ENABLED_SET, enabled: true, priority: 1, origin: 'manual' },
      { setId: DISABLED_SET, enabled: false, priority: 2, origin: 'manual' },
      { setId: UNMAPPED_SET, enabled: true, priority: 3, origin: 'manual' },
      { setId: BOUNDARY_SET, enabled: true, priority: 4, origin: 'manual' },
    ] });
    await prisma.cardSetExternalId.create({ data: { provider: 'tcgcsv', externalId: String(GROUP_ENABLED), setId: ENABLED_SET } });
    await prisma.cardSetExternalId.create({ data: { provider: 'tcgcsv', externalId: String(GROUP_DISABLED), setId: DISABLED_SET } });
    await prisma.cardSetExternalId.create({ data: { provider: 'tcgcsv', externalId: String(GROUP_BOUNDARY), setId: BOUNDARY_SET } });
    await prisma.cardExternalId.create({ data: { provider: 'tcgcsv', externalId: String(PRODUCT), cardId: CARD_ENABLED } });
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM tcgcsv_group_jobs WHERE "groupId" IN (${GROUP_ENABLED}, ${GROUP_DISABLED}, ${GROUP_BOUNDARY})`;
    await prisma.$executeRaw`DELETE FROM card_set_external_ids WHERE provider = 'tcgcsv' AND "setId" IN (${ENABLED_SET}, ${DISABLED_SET}, ${UNMAPPED_SET}, ${BOUNDARY_SET})`;
    await prisma.$executeRaw`DELETE FROM price_ingestion_runs WHERE provider = 'tcgcsv' AND "groupId" = ${GROUP_ENABLED}`;
    await prisma.cardSet.deleteMany({ where: { id: { in: [ENABLED_SET, DISABLED_SET, UNMAPPED_SET, BOUNDARY_SET] } } });
    for (const job of originalJobs) await prisma.tcgcsvGroupJob.create({ data: job });
    for (const run of originalRuns) await prisma.priceIngestionRun.create({ data: run });
    if (originalRate) await prisma.providerRateLimit.upsert({ where: { providerId: 'tcgcsv' }, create: originalRate, update: originalRate });
    else await prisma.providerRateLimit.deleteMany({ where: { providerId: 'tcgcsv' } });
    if (originalCounters) await prisma.$executeRaw`UPDATE tcgcsv_discovery_state SET "requestCount" = ${originalCounters.requestCount},
      "requestWindowStartedAt" = ${originalCounters.requestWindowStartedAt} WHERE id = 'global'`;
    if (originalFlag === undefined) delete process.env.ENABLE_TCGCSV_INGESTION;
    else process.env.ENABLE_TCGCSV_INGESTION = originalFlag;
    await prisma.$disconnect();
  });

  it('crea objetivos sólo para sets habilitados y deja el faltante de mapping explícito', async () => {
    await service.planDailyTargets(true);
    const jobs = await prisma.tcgcsvGroupJob.findMany({ where: { groupId: { in: [GROUP_ENABLED, GROUP_DISABLED] } } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ groupId: GROUP_ENABLED, origin: 'daily', status: 'pending' });
    const selected = await prisma.priceSyncCardDay.findUnique({ where: { provider_cardId_syncDate: {
      provider: 'tcgcsv', cardId: CARD_ENABLED, syncDate: new Date(new Date().toISOString().slice(0, 10)),
    } } });
    expect(selected?.status).toBe('pending');
    const disabled = await prisma.priceSyncSetDay.count({ where: { provider: 'tcgcsv', setId: DISABLED_SET } });
    expect(disabled).toBe(0);
    const unmapped = await prisma.priceSyncCardDay.findFirst({ where: { provider: 'tcgcsv', cardId: CARD_UNMAPPED } });
    expect(unmapped?.status).toBe('unmapped');
    const blocked = await prisma.priceSyncSetDay.findFirst({ where: { provider: 'tcgcsv', setId: UNMAPPED_SET } });
    expect(blocked?.status).toBe('blocked_mapping');
    expect(client.fetchFeed).not.toHaveBeenCalled();
  });

  it('mismo build acredita el manifest y espera contenido sin tocar las reservas de 24 h', async () => {
    await service.planDailyTargets(true);
    await prisma.tcgcsvGroupJob.update({ where: { groupId: GROUP_ENABLED }, data: {
      status: 'pending', availableAt: new Date(0), publishedBuild: BUILD,
      downloadStartedAt: new Date(), origin: 'daily',
    } });
    await prisma.providerRateLimit.upsert({ where: { providerId: 'tcgcsv' },
      create: { providerId: 'tcgcsv', lastCalledAt: new Date(0), blockedUntil: null },
      update: { lastCalledAt: new Date(0), blockedUntil: null },
    });
    vi.mocked(client.fetchFeed).mockResolvedValue(BUILD.toISOString());
    expect(await service.runOne(GROUP_ENABLED)).toBe(true);
    expect(client.fetchFeed).toHaveBeenCalledTimes(1);
    const setDay = await prisma.priceSyncSetDay.findUnique({ where: { provider_setId_syncDate: {
      provider: 'tcgcsv', setId: ENABLED_SET, syncDate: new Date(new Date().toISOString().slice(0, 10)),
    } } });
    expect(setDay).toMatchObject({ status: 'waiting_feed', feedPublishedAt: BUILD });
    expect(setDay?.sourceCheckedAt).not.toBeNull();
    const cardDay = await prisma.priceSyncCardDay.findFirst({ where: { provider: 'tcgcsv', cardId: CARD_ENABLED } });
    expect(cardDay).toMatchObject({ status: 'pending', checkedAt: null });
    expect(await prisma.cardPrice.count({ where: { cardId: CARD_ENABLED, provider: 'tcgcsv' } })).toBe(0);
    const [group] = await prisma.$queryRaw<{ downloadStartedAt: Date; availableAt: Date }[]>`SELECT "downloadStartedAt", "availableAt"
      FROM tcgcsv_group_jobs WHERE "groupId" = ${GROUP_ENABLED}`;
    expect(group.downloadStartedAt).not.toBeNull();
    expect(group.availableAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
  });

  it('no inicia antes de las 21 UTC y el catch-up crea un único objetivo al llegar la hora', async () => {
    await prisma.priceSyncCardDay.deleteMany({ where: { provider: 'tcgcsv', setId: BOUNDARY_SET } });
    await prisma.priceSyncSetDay.deleteMany({ where: { provider: 'tcgcsv', setId: BOUNDARY_SET } });
    await prisma.tcgcsvGroupJob.deleteMany({ where: { groupId: GROUP_BOUNDARY } });
    const [dbClock] = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() AS now`;
    const day = new Date(Date.UTC(dbClock.now.getUTCFullYear(), dbClock.now.getUTCMonth(), dbClock.now.getUTCDate()));
    const before = new TcgcsvService(prisma as PrismaService, client, snapshots as unknown as CollectionComparisonService,
      () => new Date(day.getTime() + 20 * 60 * 60 * 1000 + 59 * 60 * 1000));
    const after = new TcgcsvService(prisma as PrismaService, client, snapshots as unknown as CollectionComparisonService,
      () => new Date(day.getTime() + 21 * 60 * 60 * 1000));
    await before.planDailyTargets(false);
    expect(await prisma.priceSyncSetDay.count({ where: { provider: 'tcgcsv', setId: BOUNDARY_SET, syncDate: day } })).toBe(0);
    await after.planDailyTargets(false);
    await after.planDailyTargets(false);
    expect(await prisma.priceSyncSetDay.count({ where: { provider: 'tcgcsv', setId: BOUNDARY_SET, syncDate: day } })).toBe(1);
    expect(await prisma.tcgcsvGroupJob.count({ where: { groupId: GROUP_BOUNDARY, origin: 'daily', syncDate: day } })).toBe(1);
  });

  it('pausa compartida impide reclamar o hacer HTTP en otros grupos', async () => {
    await prisma.tcgcsvGroupJob.update({ where: { groupId: GROUP_ENABLED }, data: { status: 'pending', availableAt: new Date(0), origin: 'interactive' } });
    await prisma.providerRateLimit.upsert({ where: { providerId: 'tcgcsv' },
      create: { providerId: 'tcgcsv', lastCalledAt: new Date(0), blockedUntil: new Date(Date.now() + 60_000) },
      update: { lastCalledAt: new Date(0), blockedUntil: new Date(Date.now() + 60_000) },
    });
    vi.mocked(client.fetchFeed).mockClear();
    expect(await service.runOne(GROUP_ENABLED)).toBe(false);
    expect(client.fetchFeed).not.toHaveBeenCalled();
    const [job] = await prisma.$queryRaw<{ status: string; lockedBy: string | null }[]>`SELECT status, "lockedBy" FROM tcgcsv_group_jobs WHERE "groupId" = ${GROUP_ENABLED}`;
    expect(job).toMatchObject({ status: 'pending', lockedBy: null });
  });

  it('guarda precios reales y evidencia quoted en una transacción por día UTC', async () => {
    await prisma.priceSyncCardDay.deleteMany({ where: { provider: 'tcgcsv', setId: BOUNDARY_SET } });
    await prisma.priceSyncSetDay.deleteMany({ where: { provider: 'tcgcsv', setId: BOUNDARY_SET } });
    await prisma.tcgcsvGroupJob.deleteMany({ where: { groupId: GROUP_BOUNDARY } });
    const [dbClock] = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() AS now`;
    const day = new Date(Date.UTC(dbClock.now.getUTCFullYear(), dbClock.now.getUTCMonth(), dbClock.now.getUTCDate()));
    await prisma.priceSyncSetDay.upsert({ where: { provider_setId_syncDate: { provider: 'tcgcsv', setId: ENABLED_SET, syncDate: day } },
      create: { provider: 'tcgcsv', setId: ENABLED_SET, syncDate: day, status: 'waiting_feed', expectedCards: 1 },
      update: { status: 'waiting_feed', nextAttemptAt: null },
    });
    await prisma.priceSyncCardDay.upsert({ where: { provider_cardId_syncDate: { provider: 'tcgcsv', cardId: CARD_ENABLED, syncDate: day } },
      create: { provider: 'tcgcsv', cardId: CARD_ENABLED, setId: ENABLED_SET, syncDate: day }, update: { status: 'pending', checkedAt: null },
    });
    await prisma.tcgcsvGroupJob.update({ where: { groupId: GROUP_ENABLED }, data: {
      status: 'pending', availableAt: new Date(0), publishedBuild: new Date('2026-10-17T20:05:44.000Z'),
      downloadStartedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), origin: 'daily', syncDate: day,
    } });
    await prisma.providerRateLimit.upsert({ where: { providerId: 'tcgcsv' },
      create: { providerId: 'tcgcsv', lastCalledAt: new Date(0), blockedUntil: null },
      update: { lastCalledAt: new Date(0), blockedUntil: null },
    });
    const productFeed = JSON.stringify({ success: true, errors: [], totalItems: 1, results: [
      { productId: PRODUCT, categoryId: 3, groupId: GROUP_ENABLED, name: 'Selected test set - 1/1', extendedData: [{ name: 'Number', value: '1/1' }] },
    ] });
    const priceFeed = JSON.stringify({ success: true, errors: [], results: [
      { productId: PRODUCT, subTypeName: 'Normal', lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 2.5 },
    ] });
    vi.mocked(client.fetchFeed).mockImplementation(async (path) => path === 'last-updated.txt' ? NEXT_BUILD.toISOString()
      : path.endsWith('/products') ? productFeed : path.endsWith('/prices') ? priceFeed : '');
    expect(await service.runOne(GROUP_ENABLED)).toBe(true);
    const cardDay = await prisma.priceSyncCardDay.findUniqueOrThrow({ where: { provider_cardId_syncDate: { provider: 'tcgcsv', cardId: CARD_ENABLED, syncDate: day } } });
    expect(cardDay).toMatchObject({ status: 'quoted', quoteCount: 1 });
    expect(cardDay.checkedAt).not.toBeNull();
    const saved = await prisma.cardPrice.findFirstOrThrow({ where: { cardId: CARD_ENABLED, provider: 'tcgcsv', market: { not: null } } });
    expect(Number(saved.market)).toBe(2.5);
    expect(saved.feedPublishedAt).toEqual(NEXT_BUILD);
  });
  it('persiste un 429 real y no reinicia cinco fallos con otra señal automática', async () => {
    const syncDate = new Date(new Date().toISOString().slice(0, 10));
    await prisma.priceSyncCardDay.update({ where: { provider_cardId_syncDate: { provider: 'tcgcsv', cardId: CARD_ENABLED, syncDate } },
      data: { status: 'pending', attempts: 4, checkedAt: null } });
    await prisma.priceSyncSetDay.update({ where: { provider_setId_syncDate: { provider: 'tcgcsv', setId: ENABLED_SET, syncDate } },
      data: { status: 'waiting_feed', nextAttemptAt: null, finishedAt: null } });
    await prisma.tcgcsvGroupJob.update({ where: { groupId: GROUP_ENABLED }, data: {
      origin: 'daily', status: 'pending', syncDate, availableAt: new Date(0), downloadStartedAt: null,
    } });
    await prisma.providerRateLimit.update({ where: { providerId: 'tcgcsv' }, data: { blockedUntil: null, lastCalledAt: new Date(0) } });
    vi.mocked(client.fetchFeed).mockClear().mockRejectedValue(new ProviderRateLimitError('tcgcsv', 120_000));
    expect(await service.runOne(GROUP_ENABLED)).toBe(true);
    const limit = await prisma.providerRateLimit.findUniqueOrThrow({ where: { providerId: 'tcgcsv' } });
    expect(limit.blockedUntil!.getTime()).toBeGreaterThan(Date.now() + 110_000);
    const target = await prisma.priceSyncCardDay.findUniqueOrThrow({ where: { provider_cardId_syncDate: { provider: 'tcgcsv', cardId: CARD_ENABLED, syncDate } } });
    expect(target).toMatchObject({ status: 'failed', attempts: 5 });
    await service.planDailyTargets(true);
    expect(await prisma.tcgcsvGroupJob.findUniqueOrThrow({ where: { groupId: GROUP_ENABLED } })).toMatchObject({ status: 'failed' });
    expect(await service.runOne(GROUP_DISABLED)).toBe(false);
    expect(client.fetchFeed).toHaveBeenCalledTimes(1);
  });

  it('recupera evidencia ya recibida hoy sin encolar otro archivo ni inventar precios', async () => {
    await prisma.priceSyncCardDay.deleteMany({ where: { provider: 'tcgcsv', setId: ENABLED_SET } });
    await prisma.priceSyncSetDay.deleteMany({ where: { provider: 'tcgcsv', setId: ENABLED_SET } });
    await prisma.tcgcsvGroupJob.deleteMany({ where: { groupId: GROUP_ENABLED } });
    await prisma.providerRateLimit.update({ where: { providerId: 'tcgcsv' }, data: { blockedUntil: null } });
    const quotes = await prisma.cardPrice.count({ where: { cardId: CARD_ENABLED, provider: 'tcgcsv' } });
    expect(quotes).toBeGreaterThan(0);
    vi.mocked(client.fetchFeed).mockClear();
    await service.planDailyTargets(true);
    expect(await prisma.priceSyncCardDay.findFirstOrThrow({ where: { provider: 'tcgcsv', cardId: CARD_ENABLED } })).toMatchObject({ status: 'quoted' });
    expect(await prisma.tcgcsvGroupJob.findUnique({ where: { groupId: GROUP_ENABLED } })).toBeNull();
    expect(await prisma.cardPrice.count({ where: { cardId: CARD_ENABLED, provider: 'tcgcsv' } })).toBe(quotes);
    expect(client.fetchFeed).not.toHaveBeenCalled();
  });

});
