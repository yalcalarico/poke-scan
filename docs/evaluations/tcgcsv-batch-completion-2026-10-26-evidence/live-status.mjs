import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(resolve('package.json'));
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
try {
  const day = new Date('2026-10-26T00:00:00Z');
  const batch = await p.tcgcsvDailyBatch.findUniqueOrThrow({ where: { syncDate: day } });
  const grouped = await p.tcgcsvBatchGroup.groupBy({ by: ['status'], where: { syncDate: day }, _count: true });
  const groups = Object.fromEntries(grouped.map((row) => [row.status, row._count]));
  assert.deepEqual(groups, { completed: 166, failed: 4, skipped: 3 });
  assert.equal(batch.status, 'failed');
  assert.ok(batch.finishedAt);
  const failures = await p.tcgcsvBatchGroup.findMany({
    where: { syncDate: day, status: 'failed' }, orderBy: { groupId: 'asc' },
    select: { groupId: true, setIds: true, lastError: true },
  });
  const [scope] = await p.$queryRaw`SELECT COUNT(*)::int AS enabled,
    COUNT(*) FILTER (WHERE "setId" = ANY(${batch.setIds}))::int AS original
    FROM price_sync_sets WHERE enabled`;
  assert.equal(scope.original, batch.setIds.length);
  const [prices] = await p.$queryRaw`SELECT COUNT(*)::int AS observations,
    COUNT(DISTINCT "cardId")::int AS cards, MIN("fetchedAt") AS first, MAX("fetchedAt") AS last
    FROM card_prices WHERE provider = 'tcgcsv' AND "feedPublishedAt" = ${batch.feedPublishedAt}`;
  const [budget] = await p.$queryRaw`SELECT COUNT(*)::int AS unsafe FROM tcgcsv_group_jobs j JOIN (
    SELECT "groupId", MAX("requestedAt" + "durationMs" * INTERVAL '1 millisecond') AS at
    FROM tcgcsv_http_requests WHERE "groupId" IS NOT NULL AND file IN ('products','prices') GROUP BY "groupId"
  ) h ON h."groupId" = j."groupId" WHERE j."availableAt" < h.at + INTERVAL '24 hours'`;
  assert.equal(budget.unsafe, 0);
  const [reservations] = await p.$queryRaw`SELECT MAX(j."availableAt") AS "latestAvailableAt",
    COUNT(*) FILTER (WHERE j."availableAt" > TIMESTAMPTZ '2026-10-27 21:00:00+00')::int AS "waitingAfterNextOpening"
    FROM tcgcsv_group_jobs j JOIN tcgcsv_batch_groups g ON g."groupId" = j."groupId" WHERE g."syncDate" = ${day}`;
  const [indexes] = await p.$queryRaw`SELECT COUNT(*)::int AS gin FROM pg_indexes
    WHERE schemaname = 'public' AND indexdef ILIKE '%USING gin%gin_trgm_ops%'`;
  assert.equal(indexes.gin, 5);
  const health = [];
  for (const url of ['http://127.0.0.1:3001/api/health', 'http://127.0.0.1:3000/inicio']) {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    health.push({ url, status: response.status });
  }
  const report = {
    checkedAt: new Date().toISOString(), passed: true, batchDate: day,
    status: batch.status, finishedAt: batch.finishedAt, targetPublication: batch.feedPublishedAt,
    sets: batch.setIds.length, groups, pendingGroups: 0, processingGroups: 0,
    failures, nextBatchEnabledSets: scope.enabled, originalScopeStillEnabled: scope.original,
    prices, unsafeReservations: budget.unsafe, reservations, gin: indexes.gin, health,
  };
  writeFileSync(resolve('../docs/evaluations/tcgcsv-batch-completion-2026-10-26-evidence/live-status.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
} finally {
  await p.$disconnect();
}
