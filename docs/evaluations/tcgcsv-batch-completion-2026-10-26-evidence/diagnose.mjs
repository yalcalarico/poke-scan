import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const require = createRequire(resolve('package.json'));
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
try {
  const [batch] = await p.$queryRaw`SELECT "syncDate", "openedAt", cardinality("setIds") AS sets FROM tcgcsv_daily_batches ORDER BY "syncDate" DESC LIMIT 1`;
  const http = await p.$queryRaw`SELECT file, status, outcome, COUNT(*)::int AS requests,
    MIN("durationMs") AS min_ms, MAX("durationMs") AS max_ms, ROUND(AVG("durationMs"))::int AS avg_ms
    FROM tcgcsv_http_requests WHERE "requestedAt" >= ${batch.openedAt} GROUP BY file,status,outcome ORDER BY file,status`;
  const errors = await p.$queryRaw`SELECT "groupId", file, status, outcome, "requestedAt", "durationMs", "receivedBytes"
    FROM tcgcsv_http_requests WHERE "requestedAt" >= ${batch.openedAt} AND (status IS NULL OR status >= 400) ORDER BY "requestedAt"`;
  const unresolved = await p.$queryRaw`SELECT "groupId",status,"availableAt","downloadStartedAt","publishedBuild","lastError"
    FROM tcgcsv_group_jobs WHERE status <> 'completed' ORDER BY "groupId"`;
  const imports = await p.$queryRaw`SELECT "feedPublishedAt", COUNT(*)::int AS groups, SUM(observations)::int AS observations
    FROM price_ingestion_runs WHERE provider='tcgcsv' AND "publishedAt">=${batch.openedAt} GROUP BY "feedPublishedAt"`;
  const [counts] = await p.$queryRaw`SELECT
    (SELECT COUNT(*)::int FROM cards) AS cards, (SELECT COUNT(*)::int FROM card_sets) AS sets,
    (SELECT COUNT(*)::int FROM users) AS users, (SELECT COUNT(*)::int FROM collections) AS collections,
    (SELECT COUNT(*)::int FROM collection_items) AS items, (SELECT SUM(quantity)::int FROM collection_items) AS copies,
    (SELECT COUNT(*)::int FROM card_prices WHERE provider='tcgcsv') AS observations,
    (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname='public' AND indexdef ILIKE '%USING gin%gin_trgm_ops%') AS gin`;
  const power = spawnSync('pmset', ['-g', 'log'], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, timeout: 15000 });
  const events = power.stdout.split('\n').filter((line) => /^2026-10-26 (18|19|20|21):/.test(line))
    .map((line) => /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d -\d{4})\s+(Sleep|DarkWake|Wake)\s/.exec(line))
    .filter(Boolean).map((match) => ({ time: match[1], event: match[2] }));
  const result = { checkedAt: new Date().toISOString(), batch, http, errors, unresolved, imports, counts, powerEvents: events };
  writeFileSync(resolve('../docs/evaluations/tcgcsv-batch-completion-2026-10-26-evidence/before.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ imports, unresolved: unresolved.length, interruptedHttpRequests: errors.length,
    consumedFiles: unresolved.filter((row) => row.downloadStartedAt >= batch.openedAt).length, sleepEvents: events.filter((row) => row.event === 'Sleep').length,
    cards: counts.cards, gin: counts.gin }));
} finally { await p.$disconnect(); }
