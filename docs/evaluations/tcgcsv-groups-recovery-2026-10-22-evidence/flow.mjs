import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Ejecutar desde backend; sólo fixtures propios en una base de tests y HTTP local.
const require = createRequire(resolve('package.json'));
const url = new URL(process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL);
if (!process.env.DATABASE_URL_TEST && !url.pathname.endsWith('_test')) url.pathname += '_test';
assert(url.pathname.includes('test'));
Object.assign(process.env, { DATABASE_URL: url.href, ENABLE_TCGCSV_INGESTION: 'false', PRICE_QUEUE_ENABLED: 'false',
  ENABLE_CATALOG_SYNC_CRON: 'false', ENABLE_PRICE_BACKFILL_CRON: 'false', ENABLE_RETENTION_CRON: 'false',
  ENABLE_COLLECTION_COMPARISON_CRON: 'false', ENABLE_PORTFOLIO_SNAPSHOTS_CRON: 'false', SCANNER_VISUAL_ENABLED: '0',
  ENABLE_ACCOUNT_DELETION_CRON: 'false' });
const load = (name) => import(pathToFileURL(resolve(`dist/${name}.js`)).href);
const [{ NestFactory }, { ValidationPipe }, { SchedulerRegistry }, { AppModule }, { PrismaService }, { TcgcsvService }] = await Promise.all([
  import(pathToFileURL(require.resolve('@nestjs/core')).href), import(pathToFileURL(require.resolve('@nestjs/common')).href),
  import(pathToFileURL(require.resolve('@nestjs/schedule')).href), load('app.module'), load('prisma/prisma.service'), load('jobs/tcgcsv/tcgcsv.service'),
]);
const id = `test-tcgcsv-recovery-${Date.now()}`;
const other = `${id}-missing`;
const groupId = 998822121;
const productId = 998822122;
const build = new Date(Date.now() - 60000).toISOString();
const oldAt = new Date(Date.now() - 2 * 86400000);
const products = JSON.stringify({ success: true, errors: [], results: [
  { productId, groupId, categoryId: 3, name: 'FlowSubset - TG001/TG030', extendedData: [{ name: 'Number', value: 'TG001/TG030' }] },
  { productId: productId + 1, groupId, categoryId: 3, name: 'UnquotedSubset', extendedData: [{ name: 'Number', value: 'TG002/TG030' }] },
] });
const prices = JSON.stringify({ success: true, errors: [], results: [{ productId, subTypeName: 'Normal', lowPrice: 0, midPrice: null, highPrice: null, marketPrice: 1.25 }] });
const requests = [];
const feed = createServer((req, res) => {
  requests.push(req.url);
  if (req.url === '/last-updated.txt') res.end(build);
  else if (req.url.endsWith('/products')) { res.setHeader('ETag', '"recovery-fixture"'); res.end(products); }
  else if (req.url.endsWith('/prices')) res.end(prices);
  else { res.writeHead(404); res.end(); }
});
feed.listen(0, '127.0.0.1'); await once(feed, 'listening');
const feedPort = feed.address().port;
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const target = String(input);
  if (target.startsWith('https://tcgcsv.com/')) return nativeFetch(`http://127.0.0.1:${feedPort}/${target.slice('https://tcgcsv.com/'.length)}`, init);
  if (target.startsWith('http://127.0.0.1:')) return nativeFetch(input, init);
  throw new Error('Red externa bloqueada en el smoke aislado');
};
let app, p, ownsGroup = false, priorRate, priorCounters;
try {
  app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  for (const job of app.get(SchedulerRegistry).getCronJobs().values()) job.stop();
  p = app.get(PrismaService);
  assert.equal(await p.tcgcsvGroupJob.count({ where: { groupId } }), 0);
  assert.equal(await p.tcgcsvProductCache.count({ where: { groupId } }), 0);
  priorRate = await p.providerRateLimit.findUnique({ where: { providerId: 'tcgcsv' } });
  priorCounters = await p.tcgcsvDiscoveryState.findUnique({ where: { id: 'global' }, select: {
    requestCount: true, requestWindowStartedAt: true, downloadCount: true, downloadWindowStartedAt: true,
  } });
  ownsGroup = true;
  await p.cardSet.create({ data: { id, name: 'Recovery fixture', printedTotal: 30 } });
  await p.card.createMany({ data: [
    { id, setId: id, name: 'FlowSubset', number: 'TG01', language: 'en', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} },
    { id: other, setId: id, name: 'UnquotedSubset', number: 'TG02', language: 'en', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} },
  ] });
  await p.tcgcsvSetGroup.create({ data: { groupId, setId: id } });
  await p.cardPrice.create({ data: { cardId: other, variant: 'normal', market: 3.5, provider: 'tcgcsv', source: 'tcgplayer', currency: 'USD', fetchedAt: oldAt, feedPublishedAt: oldAt } });
  process.env.ENABLE_TCGCSV_INGESTION = 'true';
  const service = app.get(TcgcsvService);
  await service.enqueue(groupId);
  assert.equal(await service.runOne(groupId), true);
  const job = await p.tcgcsvGroupJob.findUniqueOrThrow({ where: { groupId } });
  assert.equal(job.status, 'completed');
  const day = new Date(new Date().toISOString().slice(0, 10));
  const outcome = await p.priceSyncSetDay.findUniqueOrThrow({ where: { provider_setId_syncDate: { provider: 'tcgcsv', setId: id, syncDate: day } } });
  assert.equal(outcome.status, 'partial');
  const missing = await p.priceSyncCardDay.findUniqueOrThrow({ where: { provider_cardId_syncDate: { provider: 'tcgcsv', cardId: other, syncDate: day } } });
  assert.equal(missing.status, 'no_quote');
  const old = await p.cardPrice.findMany({ where: { cardId: other } });
  assert.equal(old.length, 1); assert.equal(old[0].fetchedAt.toISOString(), oldAt.toISOString());
  const port = app.getHttpServer().address().port;
  const response = await fetch(`http://127.0.0.1:${port}/api/cards/${id}/prices`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.prices[0].provider, 'tcgcsv'); assert.equal(body.prices[0].market, 1.25);
  const before = requests.length;
  await service.enqueue(groupId); assert.equal(await service.runOne(groupId), false);
  assert.equal(requests.length, before);
  assert.equal((await p.tcgcsvGroupJob.findUniqueOrThrow({ where: { groupId } })).downloadStartedAt.toISOString(), job.downloadStartedAt.toISOString());
  console.log('RESULT_JSON ' + JSON.stringify({ passed: true, database: 'test', feed: 'HTTP local',
    prefixedNumberPublished: true, status: job.status, setStatus: outcome.status, missingQuote: missing.status,
    previousPricePreserved: true, httpStatus: response.status, market: body.prices[0].market,
    downloadBudgetPreserved: true, requests }));
} finally {
  process.env.ENABLE_TCGCSV_INGESTION = 'false';
  if (p && ownsGroup) {
    await p.cardSet.deleteMany({ where: { id } });
    await p.priceIngestionRun.deleteMany({ where: { provider: 'tcgcsv', groupId } });
    await p.tcgcsvGroupJob.deleteMany({ where: { groupId } });
    await p.tcgcsvProductCache.deleteMany({ where: { groupId } });
    await p.tcgcsvHttpRequest.deleteMany({ where: { groupId } });
    await p.providerRateLimit.deleteMany({ where: { providerId: 'tcgcsv' } });
    if (priorRate) await p.providerRateLimit.create({ data: priorRate });
    if (priorCounters) await p.tcgcsvDiscoveryState.update({ where: { id: 'global' }, data: priorCounters });
  }
  await app?.close(); globalThis.fetch = nativeFetch;
  feed.close(); await once(feed, 'close');
}
