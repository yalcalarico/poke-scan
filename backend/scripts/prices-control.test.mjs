import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatStatus, parseOptions, readPriceStatus, requestCycles } from './prices-control.mjs';

test('sync observa por defecto con duración acotada; status sólo lee salvo --watch', () => {
  assert.deepEqual(parseOptions(['sync']), { mode: 'sync', watch: true, seconds: 600, json: false });
  assert.equal(parseOptions(['status']).watch, false);
  assert.equal(parseOptions(['status', '--watch', '--seconds=15']).seconds, 15);
  for (const args of [['unknown'], ['sync', '--seconds=0'], ['sync', '--seconds=86401'], ['status', '--force']]) assert.throws(() => parseOptions(args));
});
test('status sólo ejecuta once lecturas agregadas y no contiene nombres de usuario o colecciones', async () => {
  const queries = [];
  const prisma = { $queryRaw: async (parts) => { queries.push(parts.join('?')); return []; }, $executeRaw: () => { throw new Error('mutación inesperada'); } };
  const status = await readPriceStatus(prisma);
  assert.equal(queries.length, 11);
  assert.ok(queries.every((sql) => !/\b(insert|update|delete|truncate)\b/i.test(sql)));
  assert.ok(queries.every((sql) => !/\b(users|collections|collection_items)\b/i.test(sql)));
  assert.ok(queries.every((sql) => !/tcgdex|price_refresh_jobs/i.test(sql)));
  assert.equal(status.discovery, null);
});
test('pedido manual sólo cambia la señal coalescida, conserva cuotas y leases', async () => {
  let sql;
  const oldFlag = process.env.ENABLE_TCGCSV_INGESTION;
  process.env.ENABLE_TCGCSV_INGESTION = 'true';
  try {
    const requested = await requestCycles({ $executeRaw: async (parts) => { sql = parts.join('?'); return 1; } });
    assert.deepEqual(requested, ['tcgcsv']);
  } finally { if (oldFlag === undefined) delete process.env.ENABLE_TCGCSV_INGESTION; else process.env.ENABLE_TCGCSV_INGESTION = oldFlag; }
  assert.match(sql, /UPDATE price_sync_controls/);
  assert.match(sql, /"requestedGeneration" = "handledGeneration"/);
  assert.doesNotMatch(sql, /tcgcsv_group_jobs|downloadStartedAt|nextCheckAt|leaseUntil|DELETE|TRUNCATE/);
});
test('heartbeat viejo o worker configurado apagado nunca promete un worker activo', () => {
  const status = { evaluatedAt: '2026-10-13', controls: [{ provider: 'tcgcsv', heartbeatRecent: false, schedulerEnabled: true, workerConfiguredEnabled: false, cyclePending: true }], queues: [], coverage: [], catalog: null, discovery: null };
  const text = formatStatus(status);
  assert.match(text, /worker configurado apagado/);
  assert.match(text, /sin heartbeat reciente del planificador/);
  assert.doesNotMatch(text, /worker activo|precios actualizados/);
});

test('actividad supera los topes anteriores y la espera se muestra separada de errores', () => {
  const text = formatStatus({ evaluatedAt: '2026-10-16T00:00:00.000Z', controls: [{ provider: 'tcgcsv', heartbeatRecent: true, schedulerEnabled: true, workerConfiguredEnabled: true }], queues: [{ provider: 'tcgcsv', status: 'waiting', jobs: 12 }, { provider: 'tcgcsv', status: 'failed', jobs: 2 }], coverage: [], catalog: null, discovery: { mappedSets: 143, missingSets: 33, requestCount: 504, downloadCount: 41, nextCheckAt: new Date('2026-10-16T00:10:00Z'), nextGroupAt: new Date('2026-10-16T03:00:00Z') } });
  assert.match(text, /504 requests; 41 grupos \(sin tope global\)/);
  assert.match(text, /en espera: 12, failed: 2/);
  assert.doesNotMatch(text, /500 requests|\/500|\/40|Presupuesto:/);
  assert.match(text, /próxima disponibilidad de cola: 2026-10-16T03:00:00.000Z/);
});
