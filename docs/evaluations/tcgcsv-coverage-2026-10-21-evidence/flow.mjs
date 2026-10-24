import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(resolve('package.json'));

const url = new URL(process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL);
if (!process.env.DATABASE_URL_TEST) url.pathname += '_test';
assert(url.pathname.includes('test'));
Object.assign(process.env, { DATABASE_URL: url.href, ENABLE_TCGCSV_INGESTION: 'false', PRICE_QUEUE_ENABLED: 'false',
  ENABLE_CATALOG_SYNC_CRON: 'false', ENABLE_PRICE_BACKFILL_CRON: 'false', ENABLE_RETENTION_CRON: 'false',
  ENABLE_COLLECTION_COMPARISON_CRON: 'false', ENABLE_PORTFOLIO_SNAPSHOTS_CRON: 'false', SCANNER_VISUAL_ENABLED: '0',
  ENABLE_ACCOUNT_DELETION_CRON: 'false' });
const load = (name) => import(pathToFileURL(resolve(`dist/${name}.js`)).href);
const [{ NestFactory }, { ValidationPipe }, { AppModule }, { PrismaService }, { TcgcsvService }, { TcgcsvClient }] = await Promise.all([
  import(pathToFileURL(require.resolve('@nestjs/core')).href), import(pathToFileURL(require.resolve('@nestjs/common')).href), load('app.module'), load('prisma/prisma.service'),
  load('jobs/tcgcsv/tcgcsv.service'), load('jobs/tcgcsv/tcgcsv.client'),
]);
const id = `test-tcgcsv-flow-${Date.now()}`;
const groupId = 998822111;
const productId = 998822112;
const build = new Date(Date.now() - 60000).toISOString();
const products = JSON.stringify({ success: true, errors: [], results: [{ productId, groupId, categoryId: 3, name: 'FlowFixture - 1/1', extendedData: [{ name: 'Number', value: '1/1' }] }] });
const prices = JSON.stringify({ success: true, errors: [], results: [{ productId, subTypeName: 'Normal', lowPrice: 0, midPrice: null, highPrice: null, marketPrice: 1.25 }] });
const originalFetch = globalThis.fetch;
const requests = [];
const feed = createServer((req, res) => {
  requests.push({ path: req.url, conditional: Boolean(req.headers['if-none-match']) });
  if (req.url === '/last-updated.txt') { res.end(build); return; }
  if (req.url.endsWith('/products')) {
    if (req.headers['if-none-match'] === '"fixture-v1"') { res.writeHead(304); res.end(); return; }
    res.setHeader('ETag', '"fixture-v1"'); res.end(products); return;
  }
  if (req.url.endsWith('/prices')) { res.end(prices); return; }
  res.writeHead(404); res.end();
});
feed.listen(0, '127.0.0.1'); await once(feed, 'listening');
const feedPort = feed.address().port;
globalThis.fetch = (input, init) => {
  const url = String(input);
  if (url.startsWith('https://tcgcsv.com/')) return originalFetch(`http://127.0.0.1:${feedPort}/${url.slice('https://tcgcsv.com/'.length)}`, init);
  if (url.startsWith('http://127.0.0.1:')) return originalFetch(input, init);
  throw new Error('Red externa bloqueada en el flujo aislado');
};
let app; let prisma;
try {
  app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const port = app.getHttpServer().address().port;
  prisma = app.get(PrismaService);
  assert.equal(await prisma.tcgcsvGroupJob.count({ where: { groupId } }), 0);
  await prisma.cardSet.create({ data: { id, name: 'Flow fixture', printedTotal: 1 } });
  await prisma.card.create({ data: { id, setId: id, name: 'FlowFixture', number: '1', language: 'en', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} } });
  await prisma.tcgcsvSetGroup.create({ data: { groupId, setId: id } });
  const service = app.get(TcgcsvService);
  process.env.ENABLE_TCGCSV_INGESTION = 'true';
  await service.enqueue(groupId);
  assert.equal(await service.runOne(groupId), true);
  const job = await prisma.tcgcsvGroupJob.findUniqueOrThrow({ where: { groupId } });
  assert.equal(job.status, 'completed');
  const response = await fetch(`http://127.0.0.1:${port}/api/cards/${id}/prices`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.prices[0].provider, 'tcgcsv');
  assert.equal(body.prices[0].market, 1.25);
  const before = requests.length;
  assert.equal(await service.runOne(groupId), false);
  assert.equal(requests.length, before);
  const cache = await prisma.tcgcsvProductCache.findUniqueOrThrow({ where: { groupId } });
  // Sólo contra el feed local de fixtures: demuestra caché durable entre instancias sin alterar reservas del worker.
  assert.equal(await new TcgcsvClient(prisma).fetchFeed(`tcgplayer/3/${groupId}/products`, 10000), products);
  const after = await prisma.tcgcsvProductCache.findUniqueOrThrow({ where: { groupId } });
  assert.equal(after.receivedAt.toISOString(), cache.receivedAt.toISOString());
  const logs = await prisma.tcgcsvHttpRequest.findMany({ where: { groupId }, select: { file: true, status: true, receivedBytes: true, reusedCache: true } });
  assert(logs.some((r) => r.status === 304 && r.receivedBytes === 0 && r.reusedCache));
  const result = { passed: true, source: 'fixture HTTP local; PostgreSQL de tests; AppModule real',
    api: { status: response.status, provider: body.prices[0].provider, market: body.prices[0].market },
    requests, telemetry: logs, cooldownPreserved: true, receivedAtPreserved: true };
  writeFileSync(resolve('../docs/evaluations/tcgcsv-coverage-2026-10-21-evidence/flow.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  process.env.ENABLE_TCGCSV_INGESTION = 'false';
  if (prisma) {
    await prisma.cardSet.deleteMany({ where: { id } });
    await prisma.priceIngestionRun.deleteMany({ where: { provider: 'tcgcsv', groupId } });
    await prisma.tcgcsvGroupJob.deleteMany({ where: { groupId } });
    await prisma.tcgcsvProductCache.deleteMany({ where: { groupId } });
    await prisma.tcgcsvHttpRequest.deleteMany({ where: { groupId } });
  }
  await app?.close(); globalThis.fetch = originalFetch;
  feed.close(); await once(feed, 'close');
}
