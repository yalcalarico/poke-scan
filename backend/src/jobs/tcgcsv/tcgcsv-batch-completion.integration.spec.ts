import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/index.js';
import type { CollectionComparisonService } from '../collection-comparison.service.js';
import { TcgcsvClient } from './tcgcsv.client.js';
import { TcgcsvService } from './tcgcsv.service.js';

const prefix = `test-batch-completion-${Date.now()}`;
const sets = [0, 1, 2].map((i) => `${prefix}-${i}`);
const groups = [998271001, 998271002, 998271003];
const today = new Date(new Date().toISOString().slice(0, 10));
const day = new Date(today.getTime() - 86400000);
const evening = new Date(day.getTime() + 21 * 3600000);
const publication = new Date(day.getTime() + 20 * 3600000);

describe('TCGCSV: todos los grupos terminan, incluso después de medianoche', () => {
  const p = new PrismaClient();
  const client = new TcgcsvClient();
  const snapshots = { capture: async () => undefined } as unknown as CollectionComparisonService;
  let at = evening;
  let feed = publication;
  let fault: 'none' | 'manifest' | 'products' | 'prices' | 'publication' = 'none';
  let lastPricesGroup = 0;
  let manifestReads = 0;
  const service = () => new TcgcsvService(p as PrismaService, client, snapshots, () => at);
  const flag = process.env.ENABLE_TCGCSV_INGESTION;
  let registry: Array<{ setId: string; enabled: boolean }> = [];
  let batches: Awaited<ReturnType<typeof p.tcgcsvDailyBatch.findMany>> = [];
  let outcomes: Awaited<ReturnType<typeof p.tcgcsvBatchGroup.findMany>> = [];
  let rate: Awaited<ReturnType<typeof p.providerRateLimit.findUnique>>;
  let discovery: Awaited<ReturnType<typeof p.tcgcsvDiscoveryState.findUnique>>;

  const clean = async (): Promise<void> => {
    await p.tcgcsvGroupJob.deleteMany({ where: { groupId: { in: groups } } });
    await p.priceSyncCardDay.deleteMany({ where: { setId: { in: sets } } });
    await p.priceSyncSetDay.deleteMany({ where: { setId: { in: sets } } });
    await p.cardPrice.deleteMany({ where: { cardId: { in: sets } } });
    await p.cardExternalId.deleteMany({ where: { provider: 'tcgcsv', cardId: { in: sets } } });
    await p.priceIngestionRun.deleteMany({ where: { groupId: { in: groups } } });
    await p.tcgcsvDailyBatch.deleteMany();
    await p.providerRateLimit.deleteMany({ where: { providerId: 'tcgcsv' } });
  };

  beforeAll(async () => {
    registry = await p.priceSyncSet.findMany({ select: { setId: true, enabled: true } });
    batches = await p.tcgcsvDailyBatch.findMany();
    outcomes = await p.tcgcsvBatchGroup.findMany();
    rate = await p.providerRateLimit.findUnique({ where: { providerId: 'tcgcsv' } });
    discovery = await p.tcgcsvDiscoveryState.findUnique({ where: { id: 'global' } });
    await p.priceSyncSet.updateMany({ data: { enabled: false } });
    for (const [i, id] of sets.entries()) {
      await p.cardSet.create({ data: { id, name: `CompletionFixture${i}`, printedTotal: 1 } });
      await p.card.create({ data: { id, setId: id, name: `CompletionFixture${i}`, number: '1', language: 'en',
        supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} } });
      await p.cardSetExternalId.create({ data: { provider: 'tcgcsv', externalId: String(groups[i]), setId: id } });
      await p.priceSyncSet.create({ data: { setId: id, enabled: true, priority: i + 1, origin: 'manual' } });
    }
    vi.spyOn(client, 'fetchFeed').mockImplementation(async (path) => {
      if (path === 'last-updated.txt') {
        manifestReads += 1;
        if (fault === 'manifest') throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
        if (fault === 'publication' && lastPricesGroup === groups[1]) {
          await p.tcgcsvGroupJob.update({ where: { groupId: groups[1] }, data: { leaseUntil: new Date(0) } });
        }
        return feed.toISOString();
      }
      const groupId = Number(path.split('/')[2]);
      const i = groups.indexOf(groupId);
      if (i < 0) throw new Error('El worker salió del fixture');
      if ((fault === 'products' && path.endsWith('/products') || fault === 'prices' && path.endsWith('/prices')) && i === 1) {
        throw new DOMException('Interrupción simulada de la conexión', 'AbortError');
      }
      if (path.endsWith('/products')) return JSON.stringify({ success: true, errors: [], totalItems: 1, results: [
        { productId: groupId, categoryId: 3, groupId, name: `CompletionFixture${i}`, extendedData: [{ name: 'Number', value: '1/1' }] },
      ] });
      lastPricesGroup = groupId;
      return JSON.stringify({ success: true, errors: [], results: [
        { productId: groupId, subTypeName: 'Normal', marketPrice: 2, lowPrice: 1, midPrice: 2, highPrice: 3 },
      ] });
    });
  });

  beforeEach(async () => {
    await clean();
    process.env.ENABLE_TCGCSV_INGESTION = 'true';
    at = evening; feed = publication; fault = 'none'; lastPricesGroup = 0; manifestReads = 0;
    vi.mocked(client.fetchFeed).mockClear();
    await service().signalDaily();
  });

  afterAll(async () => {
    await clean();
    await p.cardSet.deleteMany({ where: { id: { in: sets } } });
    for (const row of registry) await p.priceSyncSet.update({ where: { setId: row.setId }, data: { enabled: row.enabled } });
    if (batches.length) await p.tcgcsvDailyBatch.createMany({ data: batches });
    if (outcomes.length) await p.tcgcsvBatchGroup.createMany({ data: outcomes });
    if (rate) await p.providerRateLimit.create({ data: rate });
    if (discovery) await p.tcgcsvDiscoveryState.update({ where: { id: 'global' }, data: discovery });
    if (flag === undefined) delete process.env.ENABLE_TCGCSV_INGESTION; else process.env.ENABLE_TCGCSV_INGESTION = flag;
    vi.restoreAllMocks(); await p.$disconnect();
  });

  it('reinicia después de medianoche y cierra todos con la fecha y publicación originales', async () => {
    await service().poll();
    at = new Date(today.getTime() + 5 * 60000);
    await service().poll(); await service().poll();
    expect(await p.tcgcsvDailyBatch.findUnique({ where: { syncDate: day } })).toMatchObject({ status: 'completed', feedPublishedAt: publication });
    expect(await p.tcgcsvBatchGroup.count({ where: { syncDate: day, status: 'completed' } })).toBe(3);
    expect(await p.priceSyncSetDay.count({ where: { setId: { in: sets }, syncDate: today } })).toBe(0);
    expect(await p.priceSyncCardDay.count({ where: { cardId: { in: sets }, syncDate: day, status: 'quoted' } })).toBe(3);
    expect(manifestReads).toBe(7);
  });

  it('dos instancias consumen un solo grupo por vez con un lease durable global', async () => {
    const original = vi.mocked(client.fetchFeed).getMockImplementation()!;
    let inFlight = 0;
    let maximum = 0;
    vi.mocked(client.fetchFeed).mockImplementation(async (path, size) => {
      inFlight += 1; maximum = Math.max(maximum, inFlight);
      try { await new Promise((done) => setTimeout(done, 20)); return await original(path, size); }
      finally { inFlight -= 1; }
    });
    try {
      await Promise.all([service().poll(), service().poll()]);
      expect(await p.tcgcsvBatchGroup.count({ where: { syncDate: day, status: 'completed' } })).toBe(1);
      expect(maximum).toBe(1);
      expect(await p.tcgcsvDiscoveryState.findUnique({ where: { id: 'global' } })).toMatchObject({ workerLockedBy: null, workerLeaseUntil: null });
    } finally { vi.mocked(client.fetchFeed).mockImplementation(original); }
  });

  it('una diferencia de reloj no adelanta las 24 horas del final del archivo', async () => {
    await clean();
    const [dbClock] = await p.$queryRaw<{ now: Date }[]>`SELECT NOW() AS now`;
    const skew = new Date(dbClock.now.getTime() + 120000);
    // La tanda vigente cambia a las 21 UTC, no a medianoche.
    const shifted = new Date(skew.getTime() - 21 * 3600000);
    const batchDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
    at = new Date(batchDay.getTime() + 21 * 3600000);
    feed = new Date(batchDay.getTime() + 20 * 3600000);
    await service().signalDaily();
    at = skew;
    await service().poll();
    const job = await p.tcgcsvGroupJob.findUniqueOrThrow({ where: { groupId: groups[0] } });
    expect(job).toMatchObject({ status: 'completed', publishedBuild: feed, downloadStartedAt: expect.any(Date) });
    expect(client.fetchFeed).toHaveBeenCalledWith(`tcgplayer/3/${groups[0]}/products`, expect.any(Number));
    expect(client.fetchFeed).toHaveBeenCalledWith(`tcgplayer/3/${groups[0]}/prices`, expect.any(Number));
    expect(job.downloadStartedAt!.getTime()).toBeGreaterThanOrEqual(skew.getTime());
    expect(job.availableAt.getTime()).toBeGreaterThanOrEqual(job.downloadStartedAt!.getTime() + 86400000);
    const contentCalls = vi.mocked(client.fetchFeed).mock.calls.filter(([path]) => path !== 'last-updated.txt');
    await service().enqueue(groups[0]);
    const queued = await p.tcgcsvGroupJob.findUniqueOrThrow({ where: { groupId: groups[0] } });
    expect(queued).toMatchObject({ status: 'pending', origin: 'interactive', downloadStartedAt: job.downloadStartedAt, availableAt: job.availableAt });
    expect(await service().runOne(groups[0])).toBe(false);
    expect(vi.mocked(client.fetchFeed).mock.calls.filter(([path]) => path !== 'last-updated.txt')).toEqual(contentCalls);
    expect(await p.tcgcsvGroupJob.findUniqueOrThrow({ where: { groupId: groups[0] } })).toEqual(queued);
  });

  for (const phase of ['products', 'prices', 'publication'] as const) {
    it(`un fallo de ${phase} cierra grupo, cartas y set sin repetir archivos, y mañana entra de nuevo`, async () => {
      fault = phase;
      await service().poll(); await service().poll(); await service().poll();
      expect(await p.tcgcsvDailyBatch.findUnique({ where: { syncDate: day } })).toMatchObject({ status: 'failed', finishedAt: expect.any(Date) });
      expect(await p.tcgcsvBatchGroup.findUnique({ where: { syncDate_groupId: { syncDate: day, groupId: groups[1] } } }))
        .toMatchObject({ status: 'failed', lastError: expect.stringContaining(`fase: ${phase}`) });
      expect(await p.priceSyncSetDay.findUnique({ where: { provider_setId_syncDate: { provider: 'tcgcsv', setId: sets[1], syncDate: day } } })).toMatchObject({ status: 'failed' });
      expect(await p.priceSyncCardDay.findUnique({ where: { provider_cardId_syncDate: { provider: 'tcgcsv', cardId: sets[1], syncDate: day } } })).toMatchObject({ status: 'failed' });
      const job = await p.tcgcsvGroupJob.findUniqueOrThrow({ where: { groupId: groups[1] } });
      const calls = vi.mocked(client.fetchFeed).mock.calls.length;
      await service().poll(); expect(client.fetchFeed).toHaveBeenCalledTimes(calls);
      at = new Date(evening.getTime() + 86400000);
      await service().signalDaily();
      expect(await p.tcgcsvBatchGroup.count({ where: { syncDate: today, status: 'pending' } })).toBe(3);
      expect(await p.tcgcsvGroupJob.findUnique({ where: { groupId: groups[1] } })).toMatchObject({ downloadStartedAt: job.downloadStartedAt });
    });
  }

  it('tres errores de manifest producen fallos concretos para todo el alcance sin gastar archivos', async () => {
    fault = 'manifest';
    for (let i = 0; i < 3; i++) { await service().poll(); at = new Date(at.getTime() + 61000); }
    expect(await p.tcgcsvBatchGroup.count({ where: { syncDate: day, status: 'failed' } })).toBe(3);
    expect(await p.tcgcsvGroupJob.count({ where: { groupId: { in: groups }, downloadStartedAt: { not: null } } })).toBe(0);
    expect(await p.priceSyncCardDay.count({ where: { setId: { in: sets }, syncDate: day, status: 'pending' } })).toBe(0);
    expect(await p.tcgcsvDailyBatch.findUnique({ where: { syncDate: day } })).toMatchObject({ status: 'failed', feedAttempts: 3 });
  });

  it('no mezcla un feed nuevo entre grupos del lote', async () => {
    await service().poll();
    feed = new Date(publication.getTime() + 86400000);
    at = new Date(today.getTime() + 20 * 3600000 + 30 * 60000);
    await service().poll();
    expect(await p.tcgcsvBatchGroup.count({ where: { syncDate: day, status: 'completed' } })).toBe(1);
    expect(await p.tcgcsvBatchGroup.count({ where: { syncDate: day, status: 'failed' } })).toBe(2);
    expect(await p.cardPrice.count({ where: { cardId: { in: sets }, feedPublishedAt: feed } })).toBe(0);
  });

  it('las siguientes 18 cierran lo no ejecutado y planifican todo sin pisar la tanda anterior', async () => {
    await service().poll();
    at = new Date(today.getTime() + 21 * 3600000);
    await service().signalDaily();
    expect(await p.tcgcsvBatchGroup.count({ where: { syncDate: day, status: 'completed' } })).toBe(1);
    expect(await p.tcgcsvBatchGroup.count({ where: { syncDate: day, status: 'failed' } })).toBe(2);
    expect(await p.tcgcsvBatchGroup.count({ where: { syncDate: today, status: 'pending' } })).toBe(3);
    expect(await p.tcgcsvDailyBatch.findUnique({ where: { syncDate: day } })).toMatchObject({ status: 'failed' });
    expect(await p.tcgcsvGroupJob.count({ where: { groupId: { in: groups }, syncDate: today } })).toBe(3);
  });
});
