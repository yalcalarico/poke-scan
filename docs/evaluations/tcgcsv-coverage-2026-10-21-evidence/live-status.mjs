import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const require = createRequire(resolve('package.json'));
const { PrismaClient } = require('@prisma/client');
const { readPriceStatus } = await import(pathToFileURL(resolve('scripts/prices-control.mjs')).href);
const { readCoverage } = await import(pathToFileURL(resolve('scripts/tcgcsv-coverage.mjs')).href);
const p = new PrismaClient();
try {
  const status = await readPriceStatus(p);
  const coverage = await readCoverage(p);
  const appHttp = {};
  for (const [name, url] of [['api', 'http://127.0.0.1:3001/api/health'], ['web', 'http://127.0.0.1:3000/inicio']]) {
    try { appHttp[name] = (await fetch(url, { signal: AbortSignal.timeout(10000) })).status; }
    catch { appHttp[name] = 'unavailable'; }
  }
  const summary = { appHttp, evaluatedAt: status.evaluatedAt, queues: status.queues, cyclePending: status.controls[0]?.cyclePending,
    daily: status.daily.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {}),
    coverage: status.coverage, pauses: status.pauses, traffic: coverage.traffic,
    cachedProductBytes: coverage.estimate.cachedProductBytes,
    freshFeedCards: coverage.sets.reduce((n, r) => n + r.freshCards, 0) };
  writeFileSync(resolve('../docs/evaluations/tcgcsv-coverage-2026-10-21-evidence/live-status.json'), JSON.stringify({ summary, status, coverage }, null, 2));
  const failures = await p.$queryRaw`SELECT j."groupId", pc.content FROM tcgcsv_group_jobs j
    JOIN tcgcsv_product_cache pc ON pc."groupId" = j."groupId" WHERE j.status = 'failed'`;
  const mappings = await p.$queryRaw`SELECT x."externalId", c.id, c.name, c.number, c."setId", c.language, s."printedTotal"
    FROM tcgcsv_set_mappings x JOIN cards c ON c."setId" = x."setId" JOIN card_sets s ON s.id = c."setId"
    WHERE x."externalId" = ANY(${failures.map((r) => String(r.groupId))}::text[])`;
  const { parseProducts, matchProducts } = await import(pathToFileURL(resolve('dist/jobs/tcgcsv/tcgcsv.adapter.js')).href);
  const diagnostics = failures.map((row) => {
    const products = parseProducts(JSON.parse(row.content), row.groupId);
    const cards = mappings.filter((card) => card.externalId === String(row.groupId)).map(({ externalId, ...card }) => card);
    return { groupId: row.groupId, sets: [...new Set(cards.map((c) => c.setId))],
      mapped: matchProducts(cards, products, Object.fromEntries(cards.map((c) => [c.setId, row.groupId]))).size,
      local: cards.slice(0, 3).map(({ name, number, printedTotal }) => ({ name, number, printedTotal })),
      remote: products.filter((r) => r.number !== null).slice(0, 3).map(({ name, number }) => ({ name, number })) };
  });
  writeFileSync(resolve('../docs/evaluations/tcgcsv-coverage-2026-10-21-evidence/failures.json'), JSON.stringify(diagnostics, null, 2));
  console.log(JSON.stringify({ ...summary, failures: diagnostics }));
} finally { await p.$disconnect(); }
