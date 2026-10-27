import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(resolve('package.json'));
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
try {
  const before = JSON.parse(readFileSync(resolve('../docs/evaluations/tcgcsv-batch-completion-2026-10-26-evidence/before.json'), 'utf8'));
  const [counts] = await p.$queryRaw`SELECT
    (SELECT COUNT(*)::int FROM cards) AS cards, (SELECT COUNT(*)::int FROM card_sets) AS sets,
    (SELECT COUNT(*)::int FROM users) AS users, (SELECT COUNT(*)::int FROM collections) AS collections,
    (SELECT COUNT(*)::int FROM collection_items) AS items, (SELECT SUM(quantity)::int FROM collection_items) AS copies,
    (SELECT COUNT(*)::int FROM card_prices WHERE provider='tcgcsv') AS observations,
    (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname='public' AND indexdef ILIKE '%USING gin%gin_trgm_ops%') AS gin`;
  assert.deepEqual(counts, before.counts);
  const day = new Date(before.batch.syncDate);
  const batch = await p.tcgcsvDailyBatch.findUniqueOrThrow({ where: { syncDate: day } });
  const groups = await p.tcgcsvBatchGroup.groupBy({ by: ['status'], where: { syncDate: day }, _count: true });
  const results = Object.fromEntries(groups.map((row) => [row.status, row._count]));
  assert.deepEqual(results, { completed: 132, failed: 4, pending: 34, skipped: 3 });
  const [budget] = await p.$queryRaw`SELECT COUNT(*)::int AS unsafe FROM tcgcsv_group_jobs j JOIN (
      SELECT "groupId", MAX("requestedAt" + "durationMs" * INTERVAL '1 millisecond') AS at
      FROM tcgcsv_http_requests WHERE "groupId" IS NOT NULL AND file IN ('products','prices') GROUP BY "groupId"
    ) h ON h."groupId" = j."groupId" WHERE j."availableAt" < h.at + INTERVAL '24 hours'`;
  assert.equal(budget.unsafe, 0);
  const result = { checkedAt: new Date().toISOString(), passed: true, dataPreserved: true, gin: counts.gin,
    priceObservationsPreserved: counts.observations, batchDate: batch.syncDate, targetPublication: batch.feedPublishedAt,
    groups: results, unsafeReservations: budget.unsafe };
  writeFileSync(resolve('../docs/evaluations/tcgcsv-batch-completion-2026-10-26-evidence/migrated.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await p.$disconnect(); }
