import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './prices-sets.mjs';

test('rechaza comandos, flags, prioridades e IDs locales desconocidos', async () => {
  await assert.rejects(run({}, ['wat']), /Usá list/);
  await assert.rejects(run({}, ['add', '--set=x', '--force']), /Opciones válidas/);
  await assert.rejects(run({}, ['add', '--set=x', '--priority=0']), /entero positivo/);
  await assert.rejects(run({ cardSet: { findUnique: async () => null } }, ['add', '--set=missing']), /No existe el set/);
});

test('list es de solo lectura y add habilita con prioridad y señal coalescida', async () => {
  let upsert;
  let sql;
  const prisma = {
    cardSet: { findUnique: async () => ({ id: 'swsh7' }) },
    priceSyncSet: { findMany: async () => ['rows'], upsert: async (args) => { upsert = args; return args; } },
    $executeRaw: async (parts, providers) => { sql = parts.join('?'); assert.deepEqual(providers, ['tcgcsv']); },
  };
  assert.deepEqual(await run(prisma, ['list']), ['rows']);
  assert.equal(sql, undefined);
  const previous = process.env.ENABLE_TCGCSV_INGESTION;
  process.env.ENABLE_TCGCSV_INGESTION = 'true';
  try { await run(prisma, ['add', '--set=swsh7', '--priority=7']); }
  finally {
    if (previous === undefined) delete process.env.ENABLE_TCGCSV_INGESTION;
    else process.env.ENABLE_TCGCSV_INGESTION = previous;
  }
  assert.equal(upsert.create.priority, 7);
  assert.equal(upsert.update.enabled, true);
  assert.match(sql, /INSERT INTO price_sync_controls/);
  assert.match(sql, /ON CONFLICT/);
});

test('ingesta apagada registra el set sin señalar ciclos de precios', async () => {
  let signalled = false;
  const previous = process.env.ENABLE_TCGCSV_INGESTION;
  process.env.ENABLE_TCGCSV_INGESTION = 'false';
  try {
    await run({
      cardSet: { findUnique: async () => ({ id: 'swsh7' }) },
      priceSyncSet: { upsert: async () => ({ setId: 'swsh7' }) },
      $executeRaw: async () => { signalled = true; },
    }, ['add', '--set=swsh7']);
    assert.equal(signalled, false);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_TCGCSV_INGESTION;
    else process.env.ENABLE_TCGCSV_INGESTION = previous;
  }
});

test('disable persiste la baja sin pedir un ciclo', async () => {
  let update;
  let signalled = false;
  const prisma = {
    cardSet: { findUnique: async () => ({ id: 'swsh7' }) },
    priceSyncSet: { upsert: async (args) => { update = args; return args; } },
    $executeRaw: async () => { signalled = true; },
  };
  await run(prisma, ['disable', '--set=swsh7']);
  assert.equal(update.update.enabled, false);
  assert.equal(signalled, false);
});

test('rank exige una prioridad nueva y sólo altera el orden de un set ya registrado', async () => {
  let update;
  const prisma = {
    cardSet: { findUnique: async () => ({ id: 'swsh7' }) },
    priceSyncSet: {
      findUnique: async () => ({ setId: 'swsh7' }),
      update: async (args) => { update = args; return args; },
    },
  };
  await run(prisma, ['rank', '--set=swsh7', '--priority=9']);
  assert.deepEqual(update, { where: { setId: 'swsh7' }, data: { priority: 9 } });
});
