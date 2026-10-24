import { ProviderRateLimitError } from '../../common/errors/provider-rate-limit.error.js';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TcgcsvService } from './tcgcsv.service.js';
import { TcgcsvClient } from './tcgcsv.client.js';
import type { PrismaService } from '../../prisma/index.js';
import type { CollectionComparisonService } from '../collection-comparison.service.js';
import { PriceSyncRegistryService } from '../price-sync-registry.service.js';

const ids = ['test-shared-tcgcsv-a', 'test-shared-tcgcsv-b'];
const sets = ['tk1a', 'tk1b'];
const group = 1543;
const day = new Date(new Date().toISOString().slice(0, 10));
const build = new Date(Date.now() - 60_000).toISOString();

describe('TCGCSV: grupos compartidos y alcance validado en PostgreSQL', () => {
  const p = new PrismaClient();
  const client = new TcgcsvClient();
  const registry = new PriceSyncRegistryService(p as PrismaService);
  const service = new TcgcsvService(p as PrismaService, client, { capture: async () => undefined } as unknown as CollectionComparisonService);
  const flag = process.env.ENABLE_TCGCSV_INGESTION;
  let job: Awaited<ReturnType<typeof p.tcgcsvGroupJob.findUnique>>;
  let previousSets: Awaited<ReturnType<typeof p.priceSyncSet.findMany>>;
  let setDays: Awaited<ReturnType<typeof p.priceSyncSetDay.findMany>>;
  let cardDays: Awaited<ReturnType<typeof p.priceSyncCardDay.findMany>>;
  let links: Awaited<ReturnType<typeof p.tcgcsvSetGroup.findMany>>;
  let pause: Awaited<ReturnType<typeof p.providerRateLimit.findUnique>>;
  let discovery: Awaited<ReturnType<typeof p.tcgcsvDiscoveryState.findUnique>>;
  beforeAll(async () => {
    process.env.ENABLE_TCGCSV_INGESTION = 'true';
    job = await p.tcgcsvGroupJob.findUnique({ where: { groupId: group } });
    previousSets = await p.priceSyncSet.findMany();
    setDays = await p.priceSyncSetDay.findMany({ where: { provider: 'tcgcsv', setId: { in: sets }, syncDate: day } });
    cardDays = await p.priceSyncCardDay.findMany({ where: { provider: 'tcgcsv', setId: { in: sets }, syncDate: day } });
    links = await p.tcgcsvSetGroup.findMany({ where: { groupId: group } });
    pause = await p.providerRateLimit.findUnique({ where: { providerId: 'tcgcsv' } });
    discovery = await p.tcgcsvDiscoveryState.findUnique({ where: { id: 'global' } });
    await p.providerRateLimit.deleteMany({ where: { providerId: 'tcgcsv' } });
    await p.tcgcsvGroupJob.deleteMany({ where: { groupId: group } });
    await p.priceSyncCardDay.deleteMany({ where: { provider: 'tcgcsv', setId: { in: sets }, syncDate: day } });
    await p.priceSyncSetDay.deleteMany({ where: { provider: 'tcgcsv', setId: { in: sets }, syncDate: day } });
    await p.tcgcsvSetGroup.createMany({ data: sets.map((setId) => ({ groupId: group, setId })), skipDuplicates: true });
    for (const [i, setId] of sets.entries()) {
      await p.card.create({ data: { id: ids[i], setId, name: `SharedFixture${i}`, number: '1', language: 'en', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} } });
    }
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await p.card.deleteMany({ where: { id: { in: ids } } });
    await p.priceIngestionRun.deleteMany({ where: { provider: 'tcgcsv', groupId: group, feedPublishedAt: new Date(build) } });
    await p.priceSyncCardDay.deleteMany({ where: { provider: 'tcgcsv', setId: { in: sets }, syncDate: day } });
    await p.priceSyncSetDay.deleteMany({ where: { provider: 'tcgcsv', setId: { in: sets }, syncDate: day } });
    if (setDays.length) await p.priceSyncSetDay.createMany({ data: setDays });
    if (cardDays.length) await p.priceSyncCardDay.createMany({ data: cardDays });
    await p.tcgcsvSetGroup.deleteMany({ where: { groupId: group } });
    if (links.length) await p.tcgcsvSetGroup.createMany({ data: links });
    await p.tcgcsvGroupJob.deleteMany({ where: { groupId: group } });
    if (job) await p.tcgcsvGroupJob.create({ data: job });
    await p.priceSyncSet.deleteMany();
    if (previousSets.length) await p.priceSyncSet.createMany({ data: previousSets });
    await p.providerRateLimit.deleteMany({ where: { providerId: 'tcgcsv' } });
    if (pause) await p.providerRateLimit.create({ data: pause });
    if (discovery) await p.tcgcsvDiscoveryState.update({ where: { id: 'global' }, data: discovery });
    if (flag === undefined) delete process.env.ENABLE_TCGCSV_INGESTION; else process.env.ENABLE_TCGCSV_INGESTION = flag;
    await p.$disconnect();
  });
  it('deduplica dos sets, publica una vez y registra resultados separados', async () => {
    expect(await service.groupForSet('tk1a')).toBe(group);
    expect(await service.groupForSet('tk1b')).toBe(group);
    expect(await service.enqueueCards(ids)).toBe(1);
    expect(await service.enqueueCards(ids)).toBe(0);
    const fetch = vi.spyOn(client, 'fetchFeed').mockImplementation(async (path) => {
      if (path === 'last-updated.txt') return build;
      if (path.endsWith('/products')) return JSON.stringify({ success: true, errors: [], results: sets.map((_, i) => ({
        productId: 998811 + i, categoryId: 3, groupId: group, name: `SharedFixture${i} - 1/10`, extendedData: [{ name: 'Number', value: '1/10' }],
      })) });
      return JSON.stringify({ success: true, errors: [], results: sets.map((_, i) => ({ productId: 998811 + i, subTypeName: 'Normal', lowPrice: 0, midPrice: null, highPrice: null, marketPrice: i })) });
    });
    expect(await service.runOne(group)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(await p.cardPrice.count({ where: { cardId: { in: ids } } })).toBe(2);
    expect(await p.priceSyncSetDay.count({ where: { provider: 'tcgcsv', setId: { in: sets }, syncDate: day, status: 'partial' } })).toBe(2);
    expect(await p.priceSyncCardDay.count({ where: { provider: 'tcgcsv', cardId: { in: ids }, syncDate: day, status: 'quoted' } })).toBe(2);
    expect(await service.runOne(group)).toBe(false);
  });
  it('incorpora nuevos sets validados sin reactivar una baja ni cambiar prioridades', async () => {
    await p.priceSyncSet.upsert({ where: { setId: 'tk1a' }, create: { setId: 'tk1a', enabled: false, priority: 7, origin: 'manual' }, update: { enabled: false, priority: 7 } });
    await p.priceSyncSet.deleteMany({ where: { setId: 'tk1b' } });
    await registry.reconcileValidatedSets();
    expect(await p.priceSyncSet.findUnique({ where: { setId: 'tk1a' } })).toMatchObject({ enabled: false, priority: 7 });
    expect(await p.priceSyncSet.findUnique({ where: { setId: 'tk1b' } })).toMatchObject({ enabled: true, priority: 200, origin: 'validated' });
    expect(await registry.reconcileValidatedSets()).toBe(0);
  });
  it('un 429 no cambia el hermano terminado y agota intentos por set', async () => {
    await p.priceSyncSetDay.updateMany({ where: { provider: 'tcgcsv', setId: 'tk1a', syncDate: day }, data: { status: 'completed' } });
    await p.priceSyncSetDay.updateMany({ where: { provider: 'tcgcsv', setId: 'tk1b', syncDate: day }, data: { status: 'waiting_feed' } });
    await p.priceSyncCardDay.updateMany({ where: { provider: 'tcgcsv', cardId: ids[1], syncDate: day }, data: { status: 'pending', attempts: 4 } });
    await p.tcgcsvGroupJob.update({ where: { groupId: group }, data: { status: 'pending', origin: 'interactive', availableAt: new Date(0), downloadStartedAt: null } });
    vi.mocked(client.fetchFeed).mockRejectedValueOnce(new ProviderRateLimitError('tcgcsv', 120000));
    expect(await service.runOne(group)).toBe(true);
    expect(await p.priceSyncSetDay.findUnique({ where: { provider_setId_syncDate: { provider: 'tcgcsv', setId: 'tk1a', syncDate: day } } })).toMatchObject({ status: 'completed' });
    expect(await p.priceSyncSetDay.findUnique({ where: { provider_setId_syncDate: { provider: 'tcgcsv', setId: 'tk1b', syncDate: day } } })).toMatchObject({ status: 'failed' });
  });
  it('arranque después de las 21 UTC con ingesta apagada no expande ni consulta', async () => {
    process.env.ENABLE_TCGCSV_INGESTION = 'false';
    const query = vi.fn();
    const disabled = new TcgcsvService({ $queryRaw: query } as unknown as PrismaService, client, {} as CollectionComparisonService,
      () => new Date('2026-10-21T22:00:00Z'), registry);
    const reconcile = vi.spyOn(registry, 'reconcileValidatedSets');
    await disabled.onModuleInit();
    expect(query).not.toHaveBeenCalled(); expect(reconcile).not.toHaveBeenCalled();
  });
});
