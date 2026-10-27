import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const require = createRequire(resolve('package.json'));
const url = new URL(process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL);
if (!process.env.DATABASE_URL_TEST) url.pathname += '_test';
assert(url.pathname.includes('test') && ['localhost', '127.0.0.1'].includes(url.hostname));
Object.assign(process.env, { DATABASE_URL: url.href, ENABLE_TCGCSV_INGESTION: 'false', ENABLE_CATALOG_SYNC_CRON: 'false',
  ENABLE_RETENTION_CRON: 'false', ENABLE_COLLECTION_COMPARISON_CRON: 'false', ENABLE_PORTFOLIO_SNAPSHOTS_CRON: 'false',
  SCANNER_VISUAL_ENABLED: '0', ENABLE_ACCOUNT_DELETION_CRON: 'false' });
const load = (name) => import(pathToFileURL(resolve(`dist/${name}.js`)).href);
const [{ NestFactory }, { AppModule }, { PrismaService }, { TcgcsvService }, { TcgcsvClient }, { SchedulerRegistry }] = await Promise.all([
  import(pathToFileURL(require.resolve('@nestjs/core')).href), load('app.module'), load('prisma/prisma.service'),
  load('jobs/tcgcsv/tcgcsv.service'), load('jobs/tcgcsv/tcgcsv.client'), import(pathToFileURL(require.resolve('@nestjs/schedule')).href),
]);
const prefix = `test-completion-http-${Date.now()}`;
const ids = [0, 1, 2].map((i) => `${prefix}-${i}`);
const groups = [998272001, 998272002, 998272003];
const day = new Date(new Date().toISOString().slice(0, 10)); day.setUTCDate(day.getUTCDate() - 1);
let clock = new Date(day.getTime() + 13 * 3600000);
const build = new Date(day.getTime() + 20 * 3600000).toISOString();
const requests = [];
const originalFetch = globalThis.fetch;
const feed = createServer((req, res) => {
  requests.push(req.url);
  if (req.url === '/last-updated.txt') { res.end(build); return; }
  const group = Number(req.url.split('/')[3]);
  const i = groups.indexOf(group);
  if (i < 0) { res.writeHead(404); res.end(); return; }
  if (req.url.endsWith('/prices') && i === 1) { res.writeHead(503); res.end('fixture unavailable'); return; }
  if (req.url.endsWith('/products')) res.end(JSON.stringify({ success: true, errors: [], totalItems: 1, results: [
    { productId: group, groupId: group, categoryId: 3, name: `CommonHttpFixture${i}`, extendedData: [{ name: 'Number', value: '1/1' }] },
  ] }));
  else res.end(JSON.stringify({ success: true, errors: [], results: [
    { productId: group, subTypeName: 'Normal', marketPrice: 1.25 + i, lowPrice: 1, midPrice: 2, highPrice: 3 },
  ] }));
});
feed.listen(0, '127.0.0.1'); await once(feed, 'listening');
globalThis.fetch = (input, init) => {
  const address = String(input);
  if (address.startsWith('https://tcgcsv.com/')) return originalFetch(`http://127.0.0.1:${feed.address().port}/${address.slice('https://tcgcsv.com/'.length)}`, init);
  if (address.startsWith('http://127.0.0.1:')) return originalFetch(input, init);
  throw new Error('Red externa bloqueada en el flujo aislado');
};
let app; let prisma; let registry = []; let rate; let discovery; let batches = []; let outcomes = [];
try {
  app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  for (const job of app.get(SchedulerRegistry).getCronJobs().values()) job.stop();
  prisma = app.get(PrismaService);
  registry = await prisma.priceSyncSet.findMany({ select: { setId: true, enabled: true } });
  rate = await prisma.providerRateLimit.findUnique({ where: { providerId: 'tcgcsv' } });
  discovery = await prisma.tcgcsvDiscoveryState.findUnique({ where: { id: 'global' } });
  batches = await prisma.tcgcsvDailyBatch.findMany();
  outcomes = await prisma.tcgcsvBatchGroup.findMany();
  await prisma.tcgcsvDailyBatch.deleteMany();
  assert.equal(await prisma.tcgcsvGroupJob.count({ where: { groupId: { in: groups } } }), 0);
  await prisma.priceSyncSet.updateMany({ data: { enabled: false } });
  await prisma.providerRateLimit.deleteMany({ where: { providerId: 'tcgcsv' } });
  for (const [i, id] of ids.entries()) {
    await prisma.cardSet.create({ data: { id, name: `CommonHttpFixture${i}`, printedTotal: 1 } });
    await prisma.card.create({ data: { id, setId: id, name: `CommonHttpFixture${i}`, number: '1', language: 'en', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} } });
    await prisma.tcgcsvSetGroup.create({ data: { groupId: groups[i], setId: id } });
    await prisma.priceSyncSet.create({ data: { setId: id, enabled: true, origin: 'manual', priority: i + 1 } });
  }
  const oldAt = new Date(day.getTime() - 86400000 + 12 * 3600000);
  await prisma.cardPrice.create({ data: { cardId: ids[1], provider: 'tcgcsv', variant: 'normal', market: 3.5,
    fetchedAt: oldAt, feedPublishedAt: new Date(day.getTime() - 86400000 + 20 * 3600000) } });
  const service = new TcgcsvService(prisma, app.get(TcgcsvClient), { capture: async () => undefined }, () => clock);
  process.env.ENABLE_TCGCSV_INGESTION = 'true';
  assert.equal(await service.enqueueCards(ids), 3);
  assert.equal(await service.signalDaily(), 0);
  await service.poll();
  assert.equal(requests.length, 0);
  clock = new Date(day.getTime() + 21 * 3600000);
  assert.equal(await service.signalDaily(), 3);
  await service.poll();
  clock = new Date(day.getTime() + 86400000 + 5 * 60000);
  const restarted = new TcgcsvService(prisma, app.get(TcgcsvClient), { capture: async () => undefined }, () => clock);
  await restarted.poll(); await restarted.poll();
  assert.equal(requests.length, 12);
  const batch = await prisma.tcgcsvDailyBatch.findUniqueOrThrow({ where: { syncDate: day } });
  assert.equal(batch.status, 'failed');
  const counts = await prisma.tcgcsvBatchGroup.groupBy({ by: ['status'], where: { syncDate: day }, _count: true });
  assert.equal(counts.find((row) => row.status === 'completed')._count, 2);
  assert.equal(counts.find((row) => row.status === 'failed')._count, 1);
  assert(!counts.some((row) => ['pending', 'processing'].includes(row.status)));
  assert.equal(await prisma.priceSyncSetDay.count({ where: { setId: { in: ids }, syncDate: new Date(day.getTime() + 86400000) } }), 0);
  const failure = await prisma.tcgcsvBatchGroup.findUniqueOrThrow({ where: { syncDate_groupId: { syncDate: day, groupId: groups[1] } } });
  assert(failure.lastError.includes('HTTP 503'));
  const results = [];
  for (const [i, id] of ids.entries()) {
    const response = await fetch(`http://127.0.0.1:${app.getHttpServer().address().port}/api/cards/${id}/prices`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.prices[0].market, i === 1 ? 3.5 : 1.25 + i);
    assert.equal(body.prices[0].provider, 'tcgcsv');
    results.push({ status: response.status, market: body.prices[0].market, provider: body.prices[0].provider });
  }
  await restarted.enqueueCards(ids); await restarted.poll();
  assert.equal(requests.length, 12);
  const stored = await prisma.cardPrice.findMany({ where: { cardId: ids[1] } });
  assert.equal(stored.length, 1); assert.equal(stored[0].fetchedAt.toISOString(), oldAt.toISOString());
  const result = { passed: true, source: 'AppModule real, feed HTTP local y PostgreSQL de tests',
    morningRequests: 0, groupsInCommonBatch: 3, completedGroups: 2, failedGroups: 1, pendingGroups: 0,
    resumedAfterMidnight: true, originalBatchDatePreserved: true, failedQuotePreserved: true,
    failure: failure.lastError, totalRequests: requests.length, repeatedReadsRequestNothing: true, api: results, externalRequests: 0 };
  writeFileSync(resolve('../docs/evaluations/tcgcsv-batch-completion-2026-10-26-evidence/flow.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  process.env.ENABLE_TCGCSV_INGESTION = 'false';
  if (prisma) {
    await prisma.tcgcsvGroupJob.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.cardSet.deleteMany({ where: { id: { in: ids } } });
    await prisma.priceIngestionRun.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.tcgcsvProductCache.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.tcgcsvHttpRequest.deleteMany({ where: { groupId: { in: groups } } });
    for (const row of registry) await prisma.priceSyncSet.update({ where: { setId: row.setId }, data: { enabled: row.enabled } });
    await prisma.providerRateLimit.deleteMany({ where: { providerId: 'tcgcsv' } });
    if (rate) await prisma.providerRateLimit.create({ data: rate });
    if (discovery) await prisma.tcgcsvDiscoveryState.update({ where: { id: 'global' }, data: discovery });
    await prisma.tcgcsvDailyBatch.deleteMany();
    if (batches.length) await prisma.tcgcsvDailyBatch.createMany({ data: batches });
    if (outcomes.length) await prisma.tcgcsvBatchGroup.createMany({ data: outcomes });
  }
  await app?.close();
  globalThis.fetch = originalFetch;
  feed.close(); await once(feed, 'close');
}
