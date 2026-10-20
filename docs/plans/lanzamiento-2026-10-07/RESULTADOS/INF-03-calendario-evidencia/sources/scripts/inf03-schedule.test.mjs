import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, link, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BackupInventory, initializeInventory, RETENTION_MS } from './inf03-inventory-common.mjs';
import { backup } from './inf03-inventory-test-fixture.mjs';
import { initializeTransfer, LocalSimulatedTransfer } from './inf03-transfer-common.mjs';
import { initializeCustody } from './inf03-custody-common.mjs';
import { initializeSchedule, LocalSimulatedSchedule, planCalendar } from './inf03-schedule-common.mjs';

const encode = v => JSON.stringify(v) + '\n';
async function setup(t, { initialize = true } = {}) {
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), 'inf03-schedule-test-'))); await chmod(base, 0o700);
  t.after(() => rm(base, { recursive: true, force: true }));
  const host = path.join(base, 'host'); await mkdir(host, { mode: 0o700 });
  const dirs = {};
  for (const name of ['repository', 'inventory', 'inventoryCheckpoint', 'journal', 'journalCheckpoint', 'schedule', 'objects', 'store', 'anchor']) {
    dirs[name] = path.join(['repository', 'inventory', 'inventoryCheckpoint', 'journal', 'journalCheckpoint'].includes(name) ? host : base, name); await mkdir(dirs[name], { mode: 0o700 });
  }
  const key = () => randomBytes(32).toString('hex');
  const clockState = { now: Date.now() + 100 }, clock = () => clockState.now;
  const inventoryConfig = { repository: dirs.repository, inventory: dirs.inventory, checkpoint: dirs.inventoryCheckpoint, key: key() };
  const journalConfig = { journalDirectory: dirs.journal, checkpointDirectory: dirs.journalCheckpoint, hmacKey: key() };
  // Doble de journal por bytes sólo para orchestration; no acredita HMAC/cadena del backend.
  const checkpoint = { version: 1, journalId: randomUUID(), coverageStartsAt: new Date(clock() - RETENTION_MS - 60_000).toISOString(), sequence: 0, head: '0'.repeat(64), mac: '1'.repeat(64) };
  const journalBytes = { genesis: encode(checkpoint), entries: '', checkpoint: encode(checkpoint) };
  const files = [path.join(dirs.journal, 'genesis.json'), path.join(dirs.journal, 'entries.jsonl'), path.join(dirs.journalCheckpoint, 'checkpoint.json')];
  for (const [i, bytes] of Object.values(journalBytes).entries()) await writeFile(files[i], bytes, { mode: 0o600, flag: 'wx' });
  const journalFactory = async config => {
    const locks = [], owner = randomUUID();
    return {
      async open() { for (const dir of [config.journalDirectory, config.checkpointDirectory].sort()) { const file = path.join(dir, 'writer.lock'); await writeFile(file, owner, { flag: 'wx', mode: 0o600 }); locks.push(file); } await this.snapshot(); },
      async snapshot() { for (const [i, bytes] of Object.values(journalBytes).entries()) assert.equal(await readFile(files[i], 'utf8'), bytes); for (const file of locks) assert.equal(await readFile(file, 'utf8'), owner); return { checkpoint: structuredClone(checkpoint), entries: [] }; },
      async close() { for (const file of locks.splice(0)) { assert.equal(await readFile(file, 'utf8'), owner); await unlink(file); } },
    };
  };
  const config = { mode: 'local-simulated', directory: dirs.schedule, key: key(), startsAt: new Date(clock()).toISOString(), cadenceMs: 3600_000, inventoryConfig, objects: dirs.objects, transferKey: key(), store: dirs.store, anchor: dirs.anchor, custodyKey: key(), journalConfig, journalFactory, clock, source: { runId: 'inf03-123456abcdef', container: 'inf03-123456abcdef-source-pg', database: 'inf03_source', user: 'inf03_source', recipient: 'age1' + 'a'.repeat(58), age: path.join(base, 'age-fixture') } };
  await initializeInventory(inventoryConfig); await initializeTransfer({ ...inventoryConfig, objects: config.objects, key: config.transferKey });
  await initializeCustody({ ...config, key: config.custodyKey });
  if (initialize) await initializeSchedule(config);
  const s = { base, dirs, config, clockState, files, calls: 0 };
  s.withSchedule = async fn => { const scheduler = new LocalSimulatedSchedule(config); try { await scheduler.open(); return await fn(scheduler); } finally { await scheduler.close(); } };
  s.withInventory = async fn => { const inventory = new BackupInventory(inventoryConfig, { clock }); try { await inventory.open(); return await fn(inventory); } finally { await inventory.close(); } };
  s.syntheticBackup = async ({ output }) => { s.calls++; return s.withInventory(i => backup({ config: inventoryConfig, inventory: i }, new Date(clock()).toISOString(), path.basename(output))); };
  s.cycle = options => s.withSchedule(c => c.cycle({ apply: true, backup: s.syntheticBackup, ...options }));
  s.state = () => s.withInventory(i => i.refresh());
  return s;
}

test('calendario explícito, slots perdidos agrupados y pending prioritario', () => {
  const startsAt = '2026-01-01T00:00:00.000Z', start = Date.parse(startsAt), cadenceMs = 60_000;
  assert.equal(planCalendar({ startsAt, cadenceMs, now: start - 1 }).due, false);
  assert.equal(planCalendar({ startsAt, cadenceMs, now: start }).slot, 0);
  assert.equal(planCalendar({ startsAt, cadenceMs, now: start + 9 * cadenceMs }).slot, 9);
  assert.equal(planCalendar({ startsAt, cadenceMs, now: start + 9 * cadenceMs, pendingSlot: 2 }).slot, 2);
  assert.equal(planCalendar({ startsAt, cadenceMs, now: start, completedSlots: [0] }).due, false);
  for (const patch of [{ cadenceMs: 0 }, { cadenceMs: RETENTION_MS + 1 }, { startsAt: 'invalid' }, { completedSlots: [0, 0] }, { pendingSlot: 1 }, { completedSlots: [1] }]) assert.throws(() => planCalendar({ startsAt, cadenceMs, now: start, ...patch }));
});

test('plan no cambia autoridades ni crea intent; cycle dryrun tampoco', async t => {
  const s = await setup(t), files = [path.join(s.dirs.inventory, 'inventory.json'), ...s.files, path.join(s.dirs.anchor, 'current.json')], before = await Promise.all(files.map(f => readFile(f)));
  await s.withSchedule(async c => { assert.equal((await c.plan()).due, true); assert.equal((await c.cycle()).dryRun, true); });
  assert.deepEqual(await Promise.all(files.map(f => readFile(f))), before);
  assert.deepEqual(await readdir(s.dirs.schedule), ['.inf03-schedule.json']); assert.equal(s.calls, 0);
});

test('ciclo real de librerías registra una vez, sube, publica y segunda pasada sólo mantenimiento', async t => {
  const s = await setup(t);
  assert.equal((await s.cycle()).backupCreated, true);
  const first = (await s.state()).records[0], before = await readFile(path.join(s.dirs.inventory, 'inventory.json'));
  assert.equal((await s.cycle()).backupCreated, false); assert.equal(s.calls, 1);
  assert.deepEqual(await readFile(path.join(s.dirs.inventory, 'inventory.json')), before);
  const d = JSON.parse(await readFile(path.join(s.dirs.objects, first.backupId, 'descriptor.json'))).body;
  assert.equal(d.originalCreatedAt, first.originalCreatedAt); assert.equal((await s.state()).records.length, 1);
});

test('backup fallido antes de registro deja intent incierto y no lo vuelve a ejecutar', async t => {
  const s = await setup(t); let attempts = 0;
  await assert.rejects(s.cycle({ backup: async () => { attempts++; throw Error('fixture'); } }));
  await assert.rejects(s.cycle({ backup: async () => { attempts++; } }));
  assert.equal(attempts, 1); assert.equal((await s.state()).records.length, 0);
  assert.equal((await readdir(s.dirs.schedule)).filter(n => n.endsWith('.intent.json')).length, 1);
});

test('reinicio tras registro y tras upload reconcilia ID original sin nuevo backup', async t => {
  for (const upload of [false, true]) {
    const s = await setup(t);
    await assert.rejects(s.cycle({ backup: async args => {
      const b = await s.syntheticBackup(args);
      if (upload) await s.withInventory(async inventory => {
        const transfer = new LocalSimulatedTransfer({ objects: s.dirs.objects, key: s.config.transferKey, inventoryConfig: s.config.inventoryConfig, clock: s.config.clock });
        try { await transfer.open(); await transfer.upload({ input: b.output, receiptPath: b.output + '.receipt.json', receipt: b.receipt, inventory }); } finally { await transfer.close(); }
      });
      throw Error('fixture-corte');
    } }));
    const before = (await s.state()).records[0]; s.clockState.now += 5000;
    assert.equal((await s.cycle()).reconciled, true); assert.equal(s.calls, 1);
    const after = (await s.state()).records[0]; assert.deepEqual(after, before);
    assert.equal(JSON.parse(await readFile(path.join(s.dirs.objects, after.backupId, 'descriptor.json'))).body.originalCreatedAt, before.originalCreatedAt);
  }
});

test('mantenimiento sin backup debido conserva límite original30d y nunca poda journal ni intents', async t => {
  const s = await setup(t, { initialize: false });
  s.config.startsAt = new Date(s.config.clock() + 3600_000).toISOString();
  const b = await s.withInventory(i => backup({ config: s.config.inventoryConfig, inventory: i }, new Date(s.config.clock() - RETENTION_MS + 1).toISOString(), 'previous.age'));
  await s.withInventory(async inventory => {
    const transfer = new LocalSimulatedTransfer({ objects: s.dirs.objects, key: s.config.transferKey, inventoryConfig: s.config.inventoryConfig, clock: s.config.clock });
    try { await transfer.open(); await transfer.upload({ input: b.output, receiptPath: b.output + '.receipt.json', receipt: b.receipt, inventory }); } finally { await transfer.close(); }
  });
  await initializeSchedule(s.config);
  const journal = await Promise.all(s.files.map(f => readFile(f)));
  assert.equal((await s.cycle()).localRetired, 0);
  s.clockState.now += 1;
  const result = await s.cycle(); assert.equal(result.localRetired, 1); assert.equal(result.remoteRetired, 1);
  const after = (await s.state()).records[0]; assert.equal(after.status, 'retired'); assert.equal(after.originalCreatedAt, b.record.originalCreatedAt);
  assert.equal(JSON.parse(await readFile(path.join(s.dirs.objects, b.record.backupId, 'retired.json'))).body.status, 'retired');
  assert.deepEqual(await Promise.all(s.files.map(f => readFile(f))), journal);
  assert.deepEqual(await readdir(s.dirs.schedule), ['.inf03-schedule.json']); assert.equal(s.calls, 0);
});

test('mantenimiento antes del primer slot retira backup previo sin crear uno nuevo', async t => {
  const s = await setup(t, { initialize: false });
  await s.withInventory(i => backup({ config: s.config.inventoryConfig, inventory: i }, new Date(s.config.clock() - RETENTION_MS + 1).toISOString(), 'previous.age'));
  s.clockState.now += 1; s.config.startsAt = new Date(s.config.clock() + 3600_000).toISOString(); await initializeSchedule(s.config);
  const result = await s.cycle(); assert.equal(result.backupCreated, false); assert.equal(result.localRetired, 1); assert.equal(s.calls, 0);
});

test('prune interrumpido conserva intent deleting y se reanuda en mantenimiento', async t => {
  const s = await setup(t, { initialize: false });
  await s.withInventory(i => backup({ config: s.config.inventoryConfig, inventory: i }, new Date(s.config.clock() - RETENTION_MS + 1).toISOString(), 'previous.age'));
  s.clockState.now += 1;
  await assert.rejects(s.withInventory(i => i.prune({ apply: true, afterUnlink: () => { throw Error('fixture-corte'); } })));
  const before = (await s.state()).records[0]; assert.equal(before.status, 'deleting');
  s.config.startsAt = new Date(s.config.clock() + 3600_000).toISOString(); await initializeSchedule(s.config); await s.cycle();
  const after = (await s.state()).records[0]; assert.equal(after.status, 'retired'); assert.deepEqual(after.deletion, before.deletion); assert.equal(s.calls, 0);
});

test('missing authority no provisiona calendario ni comienza backup', async t => {
  for (const target of ['inventory', 'journal', 'objects', 'anchor']) {
    const s = await setup(t, { initialize: false });
    const file = { inventory: 'inventory.json', journal: 'genesis.json', objects: '.inf03-transfer.json', anchor: 'current.json' }[target];
    await unlink(path.join(s.dirs[target], file)); await assert.rejects(initializeSchedule(s.config));
    assert.deepEqual(await readdir(s.dirs.schedule), []); assert.equal(s.calls, 0);
  }
});

test('modo, claves iguales, paths solapados, source ajeno y config cambiado se rechazan', async t => {
  const s = await setup(t);
  for (const patch of [{ mode: 'b2' }, { transferKey: s.config.key }, { directory: s.dirs.inventory }, { source: { ...s.config.source, database: 'pokemon_cards' } }]) assert.throws(() => new LocalSimulatedSchedule({ ...s.config, ...patch }));
  s.config.cadenceMs *= 2; await assert.rejects(s.cycle()); assert.equal(s.calls, 0);
});

test('lock propio serializa, lock ajeno no se elimina y directorio alias no se acepta', async t => {
  const s = await setup(t), first = new LocalSimulatedSchedule(s.config); await first.open();
  await assert.rejects(s.cycle()); assert.equal(await readFile(path.join(s.dirs.schedule, 'schedule.lock'), 'utf8'), first.owner); await first.close();
  const alias = path.join(s.base, 'alias'); await symlink(s.dirs.schedule, alias); await assert.rejects(initializeSchedule({ ...s.config, directory: alias }));
});

test('ledger alterado/hardlink/incomplete se rechaza antes de backup', async t => {
  for (const kind of ['tamper', 'hardlink', 'partial']) {
    const s = await setup(t); await s.cycle();
    const file = path.join(s.dirs.schedule, 'slot-0.complete.json');
    if (kind === 'tamper') await writeFile(file, 'invalid', { mode: 0o600 });
    if (kind === 'hardlink') await link(file, path.join(s.base, 'copy'));
    if (kind === 'partial') await writeFile(path.join(s.dirs.schedule, 'arbitrary.partial'), '', { mode: 0o600 });
    s.clockState.now += s.config.cadenceMs; await assert.rejects(s.cycle()); assert.equal(s.calls, 1);
  }
});

test('deadline tras callback espera settlement y conserva accepted original para reconciliar', async t => {
  const s = await setup(t);
  await assert.rejects(s.cycle({ deadlineMs: 500, backup: async args => { await s.syntheticBackup(args); await new Promise(resolve => setTimeout(resolve, 550)); } }));
  assert.equal(s.calls, 1); assert.equal((await s.state()).records.length, 1); await s.cycle(); assert.equal(s.calls, 1);
});


test('pérdida del objeto completo publicado bloquea plan y apply sin recrearlo', async t => {
  const s = await setup(t); await s.cycle();
  const record = (await s.state()).records[0];
  await rm(path.join(s.dirs.objects, record.backupId), { recursive: true });
  const before = await readFile(path.join(s.dirs.inventory, 'inventory.json'));
  s.clockState.now += s.config.cadenceMs;
  await assert.rejects(s.withSchedule(c => c.plan()));
  await assert.rejects(s.cycle());
  assert.equal(s.calls, 1);
  assert.deepEqual(await readFile(path.join(s.dirs.inventory, 'inventory.json')), before);
});


test('pérdida de objeto anterior durante el backup impide finalizar el nuevo slot', async t => {
  const s = await setup(t); await s.cycle();
  const old = (await s.state()).records[0];
  s.clockState.now += s.config.cadenceMs;
  await assert.rejects(s.cycle({ backup: async args => {
    await s.syntheticBackup(args);
    await rm(path.join(s.dirs.objects, old.backupId), { recursive: true });
  } }));
  assert.equal(s.calls, 2);
  const ledger = await readdir(s.dirs.schedule);
  assert.equal(ledger.includes('slot-1.intent.json'), true);
  assert.equal(ledger.includes('slot-1.complete.json'), false);
});
