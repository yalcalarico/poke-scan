import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/index.js';
import type { CollectionComparisonService } from '../collection-comparison.service.js';
import { TcgcsvClient } from './tcgcsv.client.js';
import { TcgcsvService } from './tcgcsv.service.js';

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const carry = `test-tcgcsv-midnight-carry-${suffix}`;
const fresh = `test-tcgcsv-midnight-fresh-${suffix}`;
const groups = [999100101, 999100102];
const now = new Date();
const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const yesterday = new Date(today.getTime() - 86400000);
const downloadedAt = new Date();
const availableAt = new Date(downloadedAt.getTime() + 86400000);

describe('TCGCSV: reanudación al cruzar medianoche', () => {
  const p = new PrismaClient();
  const client = new TcgcsvClient();
  const originalFlag = process.env.ENABLE_TCGCSV_INGESTION;
  const early = new Date(today.getTime() + 5 * 60000);
  const service = new TcgcsvService(p as PrismaService, client, {} as CollectionComparisonService, () => early);
  let originalBatch: Awaited<ReturnType<typeof p.tcgcsvDailyBatch.findUnique>>;
  let originalBatchGroups: Awaited<ReturnType<typeof p.tcgcsvBatchGroup.findMany>> = [];
  beforeAll(async () => {
    originalBatch = await p.tcgcsvDailyBatch.findUnique({ where: { syncDate: today } });
    originalBatchGroups = await p.tcgcsvBatchGroup.findMany({ where: { syncDate: today } });
    await p.tcgcsvDailyBatch.deleteMany({ where: { syncDate: today } });
    process.env.ENABLE_TCGCSV_INGESTION = 'true';
    vi.spyOn(client, 'fetchFeed');
    for (const [i, setId] of [carry, fresh].entries()) {
      await p.cardSet.create({ data: { id: setId, name: setId, printedTotal: 1 } });
      await p.card.create({ data: { id: setId, setId, name: 'MidnightFixture', number: '1', language: 'en', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} } });
      await p.cardSetExternalId.create({ data: { provider: 'tcgcsv', externalId: String(groups[i]), setId } });
      await p.priceSyncSet.create({ data: { setId, enabled: true, origin: 'manual' } });
    }
    await p.tcgcsvGroupJob.create({ data: { groupId: groups[0], origin: 'daily', syncDate: yesterday, status: 'pending', availableAt, downloadStartedAt: downloadedAt } });
    await p.priceSyncSetDay.create({ data: { provider: 'tcgcsv', setId: carry, syncDate: yesterday, status: 'waiting_cooldown', expectedCards: 1, nextAttemptAt: availableAt } });
    await p.priceSyncCardDay.create({ data: { provider: 'tcgcsv', cardId: carry, setId: carry, syncDate: yesterday, status: 'pending' } });
  });
  afterAll(async () => {
    await p.tcgcsvDailyBatch.deleteMany({ where: { syncDate: today } });
    if (originalBatch) await p.tcgcsvDailyBatch.create({ data: originalBatch });
    if (originalBatchGroups.length) await p.tcgcsvBatchGroup.createMany({ data: originalBatchGroups });
    await p.tcgcsvGroupJob.deleteMany({ where: { groupId: { in: groups } } });
    await p.cardSet.deleteMany({ where: { id: { in: [carry, fresh] } } });
    if (originalFlag === undefined) delete process.env.ENABLE_TCGCSV_INGESTION; else process.env.ENABLE_TCGCSV_INGESTION = originalFlag;
    vi.restoreAllMocks();
    await p.$disconnect();
  });
  it('un pendiente de ayer espera las 18 ARG sin adelantar objetivos ni alterar su reserva', async () => {
    await service.resumeDaily();
    await service.signalDaily();
    await service.poll();
    expect(await service.runOne()).toBe(false);
    expect(await p.tcgcsvGroupJob.findUnique({ where: { groupId: groups[0] } })).toMatchObject({ status: 'pending', syncDate: yesterday, availableAt, downloadStartedAt: downloadedAt });
    expect(await p.priceSyncCardDay.count({ where: { provider: 'tcgcsv', cardId: carry, syncDate: today } })).toBe(0);
    expect(await p.priceSyncSetDay.count({ where: { provider: 'tcgcsv', setId: carry, syncDate: today } })).toBe(0);
    expect(client.fetchFeed).not.toHaveBeenCalled();
    await service.resumeDaily();
    expect(await p.tcgcsvGroupJob.count({ where: { groupId: groups[0] } })).toBe(1);
  });
  it('no adelanta el ciclo diario para un set nuevo que nunca estuvo pendiente', async () => {
    expect(await p.priceSyncSetDay.count({ where: { provider: 'tcgcsv', setId: fresh, syncDate: today } })).toBe(0);
    expect(await p.tcgcsvGroupJob.count({ where: { groupId: groups[1] } })).toBe(0);
  });

  it('a las 18 incorpora juntos el pendiente anterior y el set nuevo, conservando las 24 horas', async () => {
    const evening = new TcgcsvService(p as PrismaService, client, {} as CollectionComparisonService,
      () => new Date(today.getTime() + 21 * 60 * 60 * 1000));
    await evening.resumeDaily();
    expect(await p.priceSyncSetDay.count({ where: { provider: 'tcgcsv', setId: { in: [carry, fresh] }, syncDate: today } })).toBe(2);
    expect(await p.tcgcsvGroupJob.findUnique({ where: { groupId: groups[0] } })).toMatchObject({ origin: 'daily', syncDate: today, availableAt, downloadStartedAt: downloadedAt });
    expect(await p.tcgcsvGroupJob.findUnique({ where: { groupId: groups[1] } })).toMatchObject({ origin: 'daily', syncDate: today });
    expect(client.fetchFeed).not.toHaveBeenCalled();
  });
});
