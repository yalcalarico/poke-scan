import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/index.js';
import type { CollectionComparisonService } from '../collection-comparison.service.js';
import { TcgcsvClient } from './tcgcsv.client.js';
import { TcgcsvService } from './tcgcsv.service.js';

const tag = `test-common-batch-${Date.now()}`;
const sets = ['already', 'ready', 'waiting', 'late'].map((name) => `${tag}-${name}`);
const groups = [998260001, 998260002, 998260003, 998260004];
const day = new Date(new Date().toISOString().slice(0, 10));
const evening = new Date(day.getTime() + 21 * 3600000);
const build = new Date(day.getTime() + 20 * 3600000);
const yesterday = new Date(day.getTime() - 86400000);
const batchDates = [yesterday, day, new Date(day.getTime() + 86400000)];

describe('TCGCSV: una tanda común a las 18 ARG', () => {
  const p = new PrismaClient();
  const client = new TcgcsvClient();
  let at = evening;
  let feedBuild = build;
  const service = new TcgcsvService(p as PrismaService, client,
    { capture: async () => undefined } as unknown as CollectionComparisonService, () => at);
  const flag = process.env.ENABLE_TCGCSV_INGESTION;
  let registry: Array<{ setId: string; enabled: boolean }> = [];
  let rate: Awaited<ReturnType<typeof p.providerRateLimit.findUnique>>;
  let discovery: Awaited<ReturnType<typeof p.tcgcsvDiscoveryState.findUnique>>;
  let batches: Awaited<ReturnType<typeof p.tcgcsvDailyBatch.findMany>> = [];
  let batchGroups: Awaited<ReturnType<typeof p.tcgcsvBatchGroup.findMany>> = [];

  beforeAll(async () => {
    registry = await p.priceSyncSet.findMany({ select: { setId: true, enabled: true } });
    rate = await p.providerRateLimit.findUnique({ where: { providerId: 'tcgcsv' } });
    discovery = await p.tcgcsvDiscoveryState.findUnique({ where: { id: 'global' } });
    batches = await p.tcgcsvDailyBatch.findMany({ where: { syncDate: { in: batchDates } } });
    batchGroups = await p.tcgcsvBatchGroup.findMany({ where: { syncDate: { in: batchDates } } });
    await p.tcgcsvDailyBatch.deleteMany({ where: { syncDate: { in: batchDates } } });
    await p.tcgcsvDailyBatch.create({ data: { syncDate: yesterday, openedAt: yesterday, setIds: [], status: 'completed' } });
    await p.priceSyncSet.updateMany({ data: { enabled: false } });
    await p.providerRateLimit.deleteMany({ where: { providerId: 'tcgcsv' } });
    process.env.ENABLE_TCGCSV_INGESTION = 'true';
    for (const [i, setId] of sets.entries()) {
      await p.cardSet.create({ data: { id: setId, name: `BatchFixture${i}`, printedTotal: 1 } });
      await p.card.create({ data: { id: setId, setId, name: `BatchFixture${i}`, number: '1', language: 'en',
        supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} } });
      await p.cardSetExternalId.create({ data: { provider: 'tcgcsv', externalId: String(groups[i]), setId } });
      await p.priceSyncSet.create({ data: { setId, enabled: i !== 3, priority: i + 1, origin: 'manual' } });
    }
    // Representa los grupos que el usuario exceptuó hoy; no se modifica su reserva.
    const received = new Date(day.getTime() + 13 * 3600000);
    await p.tcgcsvGroupJob.create({ data: { groupId: groups[0], status: 'completed', origin: 'daily', syncDate: day,
      downloadStartedAt: received, availableAt: new Date(received.getTime() + 86400000), publishedBuild: new Date(build.getTime() - 86400000) } });
    await p.priceSyncSetDay.create({ data: { provider: 'tcgcsv', setId: sets[0], syncDate: day, status: 'completed', expectedCards: 1 } });
    await p.priceSyncCardDay.create({ data: { provider: 'tcgcsv', cardId: sets[0], setId: sets[0], syncDate: day, status: 'quoted', checkedAt: received, quoteCount: 1 } });
    await p.cardPrice.create({ data: { cardId: sets[0], variant: 'normal', market: 1, provider: 'tcgcsv', fetchedAt: received, feedPublishedAt: new Date(build.getTime() - 86400000) } });
    vi.spyOn(client, 'fetchFeed').mockImplementation(async (path) => {
      if (path === 'last-updated.txt') return feedBuild.toISOString();
      const group = Number(path.split('/')[2]);
      const i = groups.indexOf(group);
      if (i < 0) throw new Error('El worker salió del alcance del fixture');
      if (path.endsWith('/products')) return JSON.stringify({ success: true, errors: [], totalItems: 1, results: [
        { productId: group, categoryId: 3, groupId: group, name: `BatchFixture${i}`, extendedData: [{ name: 'Number', value: '1/1' }] },
      ] });
      return JSON.stringify({ success: true, errors: [], results: [
        { productId: group, subTypeName: 'Normal', marketPrice: 2, lowPrice: 1, midPrice: 2, highPrice: 3 },
      ] });
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await p.tcgcsvGroupJob.deleteMany({ where: { groupId: { in: groups } } });
    await p.cardSet.deleteMany({ where: { id: { in: sets } } });
    await p.priceIngestionRun.deleteMany({ where: { groupId: { in: groups } } });
    for (const row of registry) await p.priceSyncSet.update({ where: { setId: row.setId }, data: { enabled: row.enabled } });
    await p.providerRateLimit.deleteMany({ where: { providerId: 'tcgcsv' } });
    if (rate) await p.providerRateLimit.create({ data: rate });
    if (discovery) await p.tcgcsvDiscoveryState.update({ where: { id: 'global' }, data: discovery });
    await p.tcgcsvDailyBatch.deleteMany({ where: { syncDate: { in: batchDates } } });
    if (batches.length) await p.tcgcsvDailyBatch.createMany({ data: batches });
    if (batchGroups.length) await p.tcgcsvBatchGroup.createMany({ data: batchGroups });
    if (flag === undefined) delete process.env.ENABLE_TCGCSV_INGESTION; else process.env.ENABLE_TCGCSV_INGESTION = flag;
    await p.$disconnect();
  });

  it('una consulta matinal y una señal manual conservan demanda local sin descargar', async () => {
    at = new Date(day.getTime() + 13 * 3600000);
    await service.enqueueCards([sets[1]]);
    expect(await service.signalDaily()).toBe(0);
    await service.poll();
    expect(await service.runOne()).toBe(false);
    expect(client.fetchFeed).not.toHaveBeenCalled();
    expect(await p.priceSyncSetDay.count({ where: { provider: 'tcgcsv', setId: sets[1], syncDate: day } })).toBe(0);
  });

  it('a las 18 reúne el alcance en un lote y exceptúa el grupo ya importado hoy', async () => {
    at = evening;
    await service.signalDaily();
    expect(await p.tcgcsvGroupJob.findMany({ where: { groupId: { in: groups.slice(1, 3) } }, select: { origin: true, syncDate: true } }))
      .toEqual([{ origin: 'daily', syncDate: day }, { origin: 'daily', syncDate: day }]);
    expect(await p.tcgcsvGroupJob.findUnique({ where: { groupId: groups[0] } })).toMatchObject({ status: 'completed' });
    // Regresión del upgrade: todos los objetivos preexisten, pero todavía no hay apertura durable.
    await p.priceSyncSetDay.updateMany({ where: { provider: 'tcgcsv', setId: { in: sets }, syncDate: day },
      data: { createdAt: new Date(day.getTime() + 13 * 3600000) } });
    await p.tcgcsvDailyBatch.delete({ where: { syncDate: day } });
    await service.signalDaily();
    await p.priceSyncSet.update({ where: { setId: sets[3] }, data: { enabled: true } });
    await service.signalDaily();
    expect(await p.tcgcsvGroupJob.findUnique({ where: { groupId: groups[3] } })).toBeNull();
    await p.priceSyncSet.updateMany({ where: { setId: { in: sets.slice(0, 3) } }, data: { enabled: false } });
    await service.signalDaily();
    expect(await p.tcgcsvGroupJob.findUnique({ where: { groupId: groups[3] } })).toBeNull();
    await p.priceSyncSet.updateMany({ where: { setId: { in: sets.slice(0, 3) } }, data: { enabled: true } });
    expect(client.fetchFeed).not.toHaveBeenCalled();
  });

  it('si el proveedor todavía muestra el feed de ayer, espera sin descargar contenido ni reservarlo', async () => {
    feedBuild = new Date(build.getTime() - 86400000);
    await service.poll();
    expect(client.fetchFeed).toHaveBeenCalledExactlyOnceWith('last-updated.txt', 4096);
    expect(await p.cardPrice.count({ where: { cardId: sets[1] } })).toBe(0);
    expect(await p.tcgcsvGroupJob.findUnique({ where: { groupId: groups[1] } })).toMatchObject({ downloadStartedAt: null });
    // Sólo adelanta la espera del manifest de este fixture; no hubo descarga ni reserva de archivo.
    await p.tcgcsvGroupJob.update({ where: { groupId: groups[1] }, data: { status: 'pending', availableAt: new Date(0) } });
    await p.priceSyncSetDay.update({ where: { provider_setId_syncDate: { provider: 'tcgcsv', setId: sets[1], syncDate: day } }, data: { nextAttemptAt: new Date(0) } });
    await p.tcgcsvDailyBatch.update({ where: { syncDate: day }, data: { nextAttemptAt: null } });
    feedBuild = build;
    vi.mocked(client.fetchFeed).mockClear();
  });

  it('publica serialmente y las lecturas no adelantan ni vuelven a descargar un grupo terminado', async () => {
    await p.tcgcsvGroupJob.update({ where: { groupId: groups[2] }, data: { availableAt: new Date(Date.now() + 60000), downloadStartedAt: new Date() } });
    await service.enqueueCards([sets[2]]);
    expect(await p.tcgcsvGroupJob.findUnique({ where: { groupId: groups[2] } })).toMatchObject({ origin: 'daily' });
    await service.poll();
    expect(await p.cardPrice.count({ where: { cardId: sets[1], feedPublishedAt: build } })).toBe(1);
    expect(client.fetchFeed).toHaveBeenCalledTimes(5);
    await service.enqueueCards([sets[1]]);
    await service.poll();
    expect(client.fetchFeed).toHaveBeenCalledTimes(5);
    await p.tcgcsvGroupJob.update({ where: { groupId: groups[2] }, data: { availableAt: new Date(0), downloadStartedAt: new Date(Date.now() - 25 * 3600000) } });
    await service.poll();
    expect(await p.cardPrice.count({ where: { cardId: sets[2], feedPublishedAt: build } })).toBe(1);
    expect(client.fetchFeed).toHaveBeenCalledTimes(9);
  });

  it('al día siguiente espera otra vez las 18 e incluye el grupo exceptuado y las demandas nuevas', async () => {
    at = new Date(day.getTime() + 86400000 + 13 * 3600000);
    await service.enqueueCards([sets[0]]);
    await service.resumeDaily();
    await service.poll();
    expect(client.fetchFeed).toHaveBeenCalledTimes(9);
    at = new Date(evening.getTime() + 86400000);
    await service.signalDaily();
    const tomorrow = new Date(day.getTime() + 86400000);
    expect(await p.priceSyncSetDay.count({ where: { provider: 'tcgcsv', setId: { in: sets }, syncDate: tomorrow } })).toBe(4);
    expect(await p.tcgcsvGroupJob.findUnique({ where: { groupId: groups[0] } })).toMatchObject({ origin: 'daily', syncDate: tomorrow, status: 'pending' });
    expect(client.fetchFeed).toHaveBeenCalledTimes(9);
  });
});
