/** HTTP real contra controller/guard compilados, con worker propio y catálogo read-only. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ValidationPipe } from '@nestjs/common';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { VisualIdentifyService } from '../dist/modules/cards/visual-identify.service.js';
import { VisualIdentifyController } from '../dist/modules/cards/visual-identify.controller.js';

const [photo, output] = process.argv.slice(2);
if (!photo || !output || photo === '--help') {
  console.log('Desde backend, tras build: node --env-file-if-exists=.env scripts/scanner-http-cancel-smoke.mjs FOTO REPORTE. Puerto efímero loopback, JWT efímero, controller/guard/worker reales. SIGSTOP sólo a workers propios; no modifica colecciones ni precios.');
  process.exit(photo === '--help' ? 0 : 1);
}
assert.notEqual(resolve(photo), resolve(output));
const bytes = await readFile(photo);
assert(bytes.length > 0 && bytes.length <= 6 * 1024 * 1024);
const body = JSON.stringify({ image: `data:image/png;base64,${bytes.toString('base64')}` });
process.env.SCANNER_VISUAL_ENABLED = '1';
const module = await Test.createTestingModule({
  imports: [JwtModule.register({ secret: randomBytes(32).toString('hex') })],
  controllers: [VisualIdentifyController],
  providers: [VisualIdentifyService, PrismaService],
}).compile();
const app = module.createNestApplication({ logger: false });
app.setGlobalPrefix('api');
app.useBodyParser('json', { limit: '10mb' });
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
const service = app.get(VisualIdentifyService);
const token = await app.get(JwtService).signAsync({ sub: 'http-cancel-smoke' }, { expiresIn: '5m' });
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
const rows = [];
let baseline, url;
async function waitFor(predicate, description) {
  const start = performance.now();
  while (!predicate()) {
    assert(performance.now() - start < 5000, description);
    await delay(10);
  }
  return performance.now() - start;
}
async function recognize(name) {
  const start = performance.now();
  const response = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  const ids = result.candidates.map(c => c.card.id);
  assert.equal(ids.length, 8);
  if (baseline) assert.deepEqual(ids, baseline); else baseline = ids;
  assert.equal(Reflect.get(service, 'busy'), false);
  const child = Reflect.get(service, 'child');
  assert(child?.connected);
  const listeners = Object.fromEntries(['message', 'exit', 'error', 'disconnect'].map(event => [event, child.listenerCount(event)]));
  assert.deepEqual(listeners, { message: 0, exit: 1, error: 1, disconnect: 1 });
  rows.push({ name, status: 200, cold: result.cold, pid: child.pid, httpMs: performance.now() - start, references: result.references, ids, listeners });
  console.log(`PASS ${name}`);
  return result;
}
try {
  await app.listen(0, '127.0.0.1');
  url = `${await app.getUrl()}/api/cards/identify-visual`;
  const unauthorized = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal(unauthorized.status, 401);
  await unauthorized.arrayBuffer();
  await recognize('arranque HTTP');
  for (let round = 1; round <= 3; round++) {
    const child = Reflect.get(service, 'child');
    const exited = once(child, 'exit');
    // Frenar nuestro worker vuelve determinista la consulta en curso: no puede
    // completarse antes de que se observe el cierre real de la conexión HTTP.
    assert(child.kill('SIGSTOP'));
    const abort = new AbortController();
    const pending = fetch(url, { method: 'POST', headers, body, signal: abort.signal });
    const cancelled = assert.rejects(pending, error => error.name === 'AbortError');
    await waitFor(() => Reflect.get(service, 'busy'), 'La consulta debe llegar al service.');
    const busy = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(5000) });
    assert.equal(busy.status, 503);
    assert.match((await busy.json()).message, /ocupado/);
    const start = performance.now();
    abort.abort();
    await cancelled;
    const releaseMs = await waitFor(() => !Reflect.get(service, 'busy') && !Reflect.get(service, 'child'), 'El cierre HTTP debe liberar el service.');
    await Promise.race([exited, delay(5000).then(() => { throw new Error('El worker cancelado debe terminar.'); })]);
    rows.push({ name: 'cancelación HTTP', round, clientError: 'AbortError', busyStatus: 503, cancelledPid: child.pid, releaseMs, exitMs: performance.now() - start });
    const recovered = await recognize(`reintento ${round}`);
    assert.equal(recovered.cold, true);
    assert.notEqual(Reflect.get(service, 'child').pid, child.pid);
    assert.equal((await recognize(`reutilización ${round}`)).cold, false);
  }
  await writeFile(resolve(output), JSON.stringify({
    evaluatedAt: new Date().toISOString(), state: 'passed', unauthorizedStatus: 401,
    photoHash: createHash('sha256').update(bytes).digest('hex'),
    scope: 'HTTP loopback en puerto efímero con controller, DTO, JwtAuthGuard, service, Prisma y DINOv2 reales. JWT efímero del harness; sin login, AppModule, throttler, proxy, navegador ni red de teléfono. SIGSTOP sólo en workers propios para asegurar una consulta activa; sin escrituras de cartas/precios/fotos.',
    productionReady: false, rows,
  }, null, 2) + '\n', { flag: 'wx' });
} finally {
  service.onModuleDestroy();
  await app.close();
}
