import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const require = createRequire(resolve('package.json'));
const { PrismaClient } = require('@prisma/client');
const { requestCycles } = await import(pathToFileURL(resolve('scripts/prices-control.mjs')).href);
const p = new PrismaClient();
try {
  const [counts] = await p.$queryRaw`SELECT current_database() AS db,
    (SELECT count(*)::int FROM cards) AS cards, (SELECT count(*)::int FROM card_sets) AS sets,
    (SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM collections) AS collections,
    (SELECT count(*)::int FROM collection_items) AS items,
    (SELECT coalesce(sum(quantity),0)::int FROM collection_items) AS copies,
    (SELECT count(*)::int FROM pg_indexes WHERE schemaname='public' AND indexdef ILIKE '%USING gin%gin_trgm_ops%') AS gin,
    (SELECT count(*)::int FROM card_prices WHERE provider='tcgcsv') AS prices`;
  assert.deepEqual(counts, { db: 'pokemon_cards', cards: 20670, sets: 176, users: 22, collections: 20, items: 66, copies: 69, gin: 5, prices: 170726 });
  const signal = process.argv.includes('--signal') ? await requestCycles(p) : [];
  const control = await p.priceSyncControl.findUniqueOrThrow({ where: { provider: 'tcgcsv' } });
  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10));
  const batches = await p.tcgcsvDailyBatch.findMany({ where: { syncDate: today } });
  const importedToday = await p.priceIngestionRun.findMany({ where: { provider: 'tcgcsv', publishedAt: { gte: new Date(today.getTime() + 3 * 3600000) } },
    select: { groupId: true, feedPublishedAt: true, publishedAt: true, observations: true } });
  const excepted = await p.priceSyncSetDay.findMany({ where: { provider: 'tcgcsv', syncDate: today }, select: { setId: true, status: true } });
  assert.equal(importedToday.length, 3);
  assert.deepEqual(excepted.map((row) => row.setId).sort(), ['bw11', 'bwp', 'pop8']);
  assert(excepted.every((row) => ['completed', 'partial'].includes(row.status)));
  assert.equal(batches.length, 0);
  const http = {};
  for (const [name, address] of [['api', 'http://127.0.0.1:3001/api/health'], ['web', 'http://127.0.0.1:3000/inicio']]) {
    const response = await fetch(address, { signal: AbortSignal.timeout(20000) });
    http[name] = response.status;
    assert.equal(response.status, 200);
  }
  assert(control.schedulerEnabled && control.workerConfiguredEnabled);
  assert(control.heartbeatAt && now.getTime() - control.heartbeatAt.getTime() < 60000);
  const result = { checkedAt: now.toISOString(), passed: true, http, runtimePane: 'w2:p7',
    dataAndInventoryCountsPreserved: true, catalogCards: counts.cards, catalogSets: counts.sets, ginIndexesPreserved: counts.gin,
    observationsPreserved: counts.prices, enabledSets: await p.priceSyncSet.count({ where: { enabled: true } }),
    signal, cyclePending: control.requestedGeneration > control.handledGeneration,
    schedulerEnabled: control.schedulerEnabled, workerConfiguredEnabled: control.workerConfiguredEnabled,
    heartbeatAt: control.heartbeatAt, batchNotOpenedBefore18: batches.length === 0, importedToday, excepted,
    scheduledUtc: new Date(today.getTime() + 21 * 3600000).toISOString(), scheduledArgentina: '18:00' };
  writeFileSync(resolve('../docs/evaluations/tcgcsv-common-batch-2026-10-26-evidence/live-status.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await p.$disconnect(); }
