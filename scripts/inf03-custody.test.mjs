import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BackupInventory, initializeInventory, RETENTION_MS } from './inf03-inventory-common.mjs';
import { backup } from './inf03-inventory-test-fixture.mjs';
import { initializeTransfer, LocalSimulatedTransfer } from './inf03-transfer-common.mjs';
import { initializeCustody, LocalSimulatedCustody } from './inf03-custody-common.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const encode = value => JSON.stringify(value) + '\n';
async function setup(t) {
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), 'inf03-custody-test-'))); await chmod(base, 0o700);
  t.after(() => rm(base, { recursive: true, force: true }));
  const host = path.join(base, 'lost-host'); await mkdir(host, { mode: 0o700 });
  const paths = {};
  for (const name of ['repository', 'inventory', 'inventoryCheckpoint', 'journal', 'journalCheckpoint']) { paths[name] = path.join(host, name); await mkdir(paths[name], { mode: 0o700 }); }
  for (const name of ['store', 'anchor', 'objects']) await mkdir(path.join(base, name), { mode: 0o700 });
  const key = () => randomBytes(32).toString('hex'), inventoryConfig = { repository: paths.repository, inventory: paths.inventory, checkpoint: paths.inventoryCheckpoint, key: key() };
  const journalConfig = { journalDirectory: paths.journal, checkpointDirectory: paths.journalCheckpoint, hmacKey: key() };
  const clockState = { now: Date.now() }, clock = () => clockState.now;
  // Doble acotado: compara bytes con una autoridad en memoria. No acredita MAC ni cadena del backend.
  const authority = { checkpoint: { version: 1, journalId: randomUUID(), coverageStartsAt: new Date(clock() - 3600_000).toISOString(), sequence: 0, head: '0'.repeat(64), mac: hash('fixture-checkpoint') }, entries: [] };
  const genesis = encode(authority.checkpoint);
  const approved = () => ({ genesis, entries: authority.entries.map(encode).join(''), checkpoint: encode(authority.checkpoint) });
  const saveJournal = async () => {
    const a = approved(); await writeFile(path.join(paths.journal, 'genesis.json'), a.genesis, { mode: 0o600 }); await writeFile(path.join(paths.journal, 'entries.jsonl'), a.entries, { mode: 0o600 }); await writeFile(path.join(paths.journalCheckpoint, 'checkpoint.json'), a.checkpoint, { mode: 0o600 });
  };
  await saveJournal();
  const journalFactory = async c => {
    let opened = false, locks = []; const owner = randomUUID();
    return {
      async open() { for (const dir of [c.journalDirectory, c.checkpointDirectory].sort()) { const file = path.join(dir, 'writer.lock'); await writeFile(file, owner, { flag: 'wx', mode: 0o600 }); locks.push(file); } opened = true; await this.snapshot(); },
      async snapshot() {
        assert.equal(opened, true); const a = approved();
        assert.equal(await readFile(path.join(c.journalDirectory, 'genesis.json'), 'utf8'), a.genesis);
        assert.equal(await readFile(path.join(c.journalDirectory, 'entries.jsonl'), 'utf8'), a.entries);
        assert.equal(await readFile(path.join(c.checkpointDirectory, 'checkpoint.json'), 'utf8'), a.checkpoint);
        for (const file of locks) assert.equal(await readFile(file, 'utf8'), owner);
        return structuredClone(authority);
      },
      async close() { for (const file of locks.splice(0)) { assert.equal(await readFile(file, 'utf8'), owner); await unlink(file); } opened = false; },
    };
  };
  const config = { store: path.join(base, 'store'), anchor: path.join(base, 'anchor'), key: key(), inventoryConfig, journalConfig, journalFactory, transferKey: key(), clock };
  await initializeInventory(inventoryConfig); await initializeTransfer({ ...inventoryConfig, objects: path.join(base, 'objects'), key: config.transferKey }); await initializeCustody(config);
  clockState.now = Date.now();
  const s = { base, paths, config, objects: path.join(base, 'objects'), authority, saveJournal, clockState, approved };
  s.withCustody = async fn => { const custody = new LocalSimulatedCustody(config); try { await custody.open(); return await fn(custody); } finally { await custody.close(); } };
  s.addBackup = async (name = 'source.age', payload = randomUUID()) => {
    const inventory = new BackupInventory(inventoryConfig, { clock }); let transfer;
    try { await inventory.open(); const b = await backup({ config: inventoryConfig, inventory }, new Date(clock()).toISOString(), name, payload); transfer = await new LocalSimulatedTransfer({ objects: s.objects, key: config.transferKey, inventoryConfig, clock }).open(); await transfer.upload({ input: b.output, receiptPath: b.output + '.receipt.json', receipt: b.receipt, inventory }); return b; }
    finally { try { if (transfer) await transfer.close(); } finally { await inventory.close(); } }
  };
  s.accept = async userId => { const entry = { sequence: authority.checkpoint.sequence + 1, userId, acceptedAt: new Date(clock()).toISOString(), previous: authority.checkpoint.head, mac: hash(randomUUID()) }; authority.entries.push(entry); authority.checkpoint = { ...authority.checkpoint, sequence: entry.sequence, head: entry.mac }; await saveJournal(); };
  s.lose = async () => { for (const dir of Object.values(paths)) await rm(dir, { recursive: true }); };
  s.anchor = async () => JSON.parse(await readFile(path.join(config.anchor, 'current.json'), 'utf8')).body;
  s.publish = () => s.withCustody(c => c.publish()); s.recover = () => s.withCustody(c => c.recover({ objects: s.objects }));
  return s;
}

test('publica metadata exacta y recupera todos los originales con marcador canónico sin registrar copias', async t => {
  const s = await setup(t), a = await s.addBackup('a.age', 'payload-a'), b = await s.addBackup('b.age', 'payload-b'); await s.accept('synthetic-deleted');
  const inventoryBytes = await readFile(path.join(s.paths.inventory, 'inventory.json')), marker = await readFile(path.join(s.paths.repository, '.inf03-repository.json'));
  assert.equal((await s.publish()).idempotent, false); assert.equal((await s.publish()).idempotent, true);
  const current = await s.anchor(), dir = path.join(s.config.store, current.snapshotId);
  assert.deepEqual((await readdir(dir)).sort(), ['commit.json', 'inventory-checkpoint.json', 'inventory.json', 'journal-checkpoint.json', 'journal-entries.jsonl', 'journal-genesis.json', 'repository-marker.json'].sort());
  await s.lose(); const result = await s.recover(); assert.equal(result.restoreEligible, false); assert.equal(result.activeRecords, 2);
  assert.deepEqual(await readFile(path.join(s.paths.inventory, 'inventory.json')), inventoryBytes); assert.deepEqual(await readFile(path.join(s.paths.repository, '.inf03-repository.json')), marker);
  for (const backup of [a, b]) { assert.deepEqual(await readFile(backup.output), await readFile(path.join(s.objects, backup.record.backupId, 'ciphertext.age'))); assert.deepEqual(await readFile(backup.output + '.receipt.json'), await readFile(path.join(s.objects, backup.record.backupId, 'receipt.json'))); }
  for (const dir of Object.values(s.paths)) assert.equal((await lstat(dir)).mode & 0o777, 0o700);
  assert.equal((await lstat(a.output)).mode & 0o777, 0o600);
});

test('falta anchor, snapshot alterado o snapshot histórico elegido fuera del anchor fallan cerrado', async t => {
  for (const kind of ['missing-anchor', 'tamper', 'stale']) {
    const s = await setup(t); await s.addBackup(); await s.publish(); const first = await s.anchor();
    await s.accept('second-deletion'); await s.publish(); const current = await s.anchor(); await s.lose();
    if (kind === 'missing-anchor') await unlink(path.join(s.config.anchor, 'current.json'));
    if (kind === 'tamper') await writeFile(path.join(s.config.store, current.snapshotId, 'journal-entries.jsonl'), 'corrupt\n');
    if (kind === 'stale') await writeFile(path.join(s.config.store, current.snapshotId, 'commit.json'), await readFile(path.join(s.config.store, first.snapshotId, 'commit.json')));
    await assert.rejects(s.recover()); await assert.rejects(lstat(s.paths.repository), { code: 'ENOENT' });
  }
});

test('rechaza rollback de inventario, journal y bifurcación con la misma secuencia', async t => {
  for (const kind of ['inventory', 'journal', 'same-sequence', 'prefix']) {
    const s = await setup(t); await s.addBackup('a.age'); await s.accept('first'); await s.publish();
    const priorAuthority = structuredClone(s.authority), priorInventory = await readFile(path.join(s.paths.inventory, 'inventory.json')), priorCheckpoint = await readFile(path.join(s.paths.inventoryCheckpoint, 'checkpoint.json'));
    const b = await s.addBackup('b.age'); await s.accept('second'); await s.publish();
    if (kind === 'inventory') { await writeFile(path.join(s.paths.inventory, 'inventory.json'), priorInventory); await writeFile(path.join(s.paths.inventoryCheckpoint, 'checkpoint.json'), priorCheckpoint); await unlink(b.output); await unlink(b.output + '.receipt.json'); }
    if (kind === 'journal') { s.authority.checkpoint = priorAuthority.checkpoint; s.authority.entries = priorAuthority.entries; await s.saveJournal(); }
    if (kind === 'same-sequence') { s.authority.entries.at(-1).mac = hash('different head'); s.authority.checkpoint.head = s.authority.entries.at(-1).mac; await s.saveJournal(); }
    if (kind === 'prefix') { s.authority.entries[0].userId = 'changed-prefix'; await s.accept('third'); }
    const anchored = await s.anchor(); await assert.rejects(s.publish()); assert.deepEqual(await s.anchor(), anchored);
  }
});

test('publish exige originales completos y journal aprobado; recovery no necesita esos originales', async t => {
  const s = await setup(t), b = await s.addBackup(); await s.publish(); await unlink(b.output); await assert.rejects(s.publish());
  await s.lose(); assert.equal((await s.recover()).recovered, true);
  await writeFile(path.join(s.paths.journal, 'entries.jsonl'), 'unapproved\n'); await assert.rejects(s.publish());
});

test('preflight rechaza rutas existentes, originales parciales, parent público y symlinks sin sobrescribir', async t => {
  for (const kind of ['existing', 'partial', 'parent-mode', 'symlink']) {
    const s = await setup(t); await s.addBackup(); await s.publish(); await s.lose();
    if (kind === 'existing') { await mkdir(s.paths.repository, { mode: 0o700 }); await writeFile(path.join(s.paths.repository, 'keep'), 'keep'); }
    if (kind === 'partial') await mkdir(s.paths.journalCheckpoint, { mode: 0o700 });
    if (kind === 'parent-mode') await chmod(path.dirname(s.paths.repository), 0o755);
    if (kind === 'symlink') await symlink(s.config.store, s.paths.repository);
    await assert.rejects(s.recover());
    if (kind === 'existing') assert.equal(await readFile(path.join(s.paths.repository, 'keep'), 'utf8'), 'keep');
    await assert.rejects(lstat(s.paths.inventory), { code: 'ENOENT' });
  }
});

test('objetos ausentes, retirados, corruptos o hardlinks bloquean antes de materializar', async t => {
  for (const kind of ['missing', 'corrupt', 'hardlink', 'retired']) {
    const s = await setup(t), b = await s.addBackup(); await s.publish(); await s.lose();
    const cipher = path.join(s.objects, b.record.backupId, 'ciphertext.age');
    if (kind === 'missing') await unlink(cipher);
    if (kind === 'corrupt') await writeFile(cipher, 'corrupt');
    if (kind === 'hardlink') await link(cipher, path.join(s.base, 'link'));
    if (kind === 'retired') { const transfer = await new LocalSimulatedTransfer({ objects: s.objects, key: s.config.transferKey, clock: () => s.clockState.now + RETENTION_MS }).open(); try { await transfer.retire({ role: 'retire', apply: true }); } finally { await transfer.close(); } }
    await assert.rejects(s.recover()); await assert.rejects(lstat(s.paths.repository), { code: 'ENOENT' });
  }
});

test('fecha original vencida y cobertura insuficiente nunca habilitan recovery ni publicación', async t => {
  const s = await setup(t); await s.addBackup(); await s.publish(); await s.lose(); s.clockState.now += RETENTION_MS; await assert.rejects(s.recover()); await assert.rejects(lstat(s.paths.repository), { code: 'ENOENT' });
  const other = await setup(t); await other.addBackup(); other.authority.checkpoint.coverageStartsAt = new Date(other.clockState.now + 1).toISOString(); await other.saveJournal(); await assert.rejects(other.publish());
});

test('intención deleting no se publica y retiro completo mantiene tombstones sin payload', async t => {
  const s = await setup(t); await s.addBackup(); await s.publish(); s.clockState.now += RETENTION_MS;
  let inventory = await new BackupInventory(s.config.inventoryConfig, { clock: s.config.clock }).open();
  try { await assert.rejects(inventory.prune({ apply: true, afterUnlink: () => { throw new Error('interruption'); } })); } finally { await inventory.close(); }
  await assert.rejects(s.publish());
  inventory = await new BackupInventory(s.config.inventoryConfig, { clock: s.config.clock }).open(); try { await inventory.prune({ apply: true }); } finally { await inventory.close(); }
  await s.publish(); await s.lose(); assert.equal((await s.recover()).activeRecords, 0);
  inventory = await new BackupInventory(s.config.inventoryConfig, { clock: s.config.clock }).open(); try { assert.equal(inventory.state.records[0].status, 'retired'); } finally { await inventory.close(); }
});

test('fallo de autoridad al final conserva parcial, bloquea retry y nunca devuelve recovered', async t => {
  const s = await setup(t); await s.addBackup(); await s.publish(); await s.lose();
  const factory = s.config.journalFactory; s.config.journalFactory = async c => { const journal = await factory(c); journal.snapshot = async () => { throw new Error('controlled authority failure'); }; return journal; };
  await assert.rejects(s.recover()); assert.equal((await lstat(s.paths.repository)).isDirectory(), true); s.config.journalFactory = factory; await assert.rejects(s.recover());
});

test('vencimiento durante reconstrucción y cambio de anchor durante lectura no devuelven éxito', async t => {
  for (const kind of ['expiry', 'anchor']) {
    const s = await setup(t); await s.addBackup(); await s.publish(); await s.lose();
    await s.withCustody(async custody => {
      const original = custody.guard.bind(custody); let calls = 0;
      custody.guard = async () => { await original(); if (++calls === 20) { if (kind === 'expiry') s.clockState.now += RETENTION_MS; else await writeFile(path.join(s.config.anchor, 'current.json'), '{}\n'); } };
      await assert.rejects(custody.recover({ objects: s.objects }));
    });
  }
});

test('provisión explícita, claves independientes, roots separados, locks y MAC privados', async t => {
  const s = await setup(t); await assert.rejects(initializeCustody(s.config));
  for (const config of [{ ...s.config, key: s.config.inventoryConfig.key }, { ...s.config, journalFactory: undefined }, { ...s.config, store: s.paths.repository }, { ...s.config, store: path.join(path.dirname(s.paths.repository), 'custody') }]) await assert.rejects(async () => new LocalSimulatedCustody(config));
  await s.withCustody(async () => { const second = new LocalSimulatedCustody(s.config); await assert.rejects(second.open()); });
  const marker = path.join(s.config.store, '.inf03-custody-store.json'); await link(marker, path.join(s.base, 'marker-link')); await assert.rejects(s.withCustody(() => {})); await unlink(path.join(s.base, 'marker-link'));
  await writeFile(marker, '{}\n'); await assert.rejects(s.withCustody(() => {}));
});

test('CLI estricto rechaza flags duplicados, remotos, irrelevantes y reloj sin JSONsuccess', async t => {
  const s = await setup(t); const base = ['scripts/inf03-custody.mjs', 'publish', '--mode', 'local-simulated', '--store', s.config.store, '--anchor', s.config.anchor, '--repository', s.paths.repository, '--inventory', s.paths.inventory, '--inventory-checkpoint', s.paths.inventoryCheckpoint, '--suppression-journal', s.paths.journal, '--suppression-checkpoint', s.paths.journalCheckpoint];
  const env = { ...process.env, INF03_CUSTODY_HMAC_KEY: s.config.key, INF03_INVENTORY_HMAC_KEY: s.config.inventoryConfig.key, INF03_SUPPRESSION_HMAC_KEY: s.config.journalConfig.hmacKey };
  for (const args of [[...base, '--now', '2099'], [...base, '--mode', 'local-simulated'], [...base, '--objects', s.objects], base.map(x => x === 'local-simulated' ? 'b2' : x), [...base, '--unknown', 'x']]) {
    const result = spawnSync(process.execPath, args, { env, encoding: 'utf8', timeout: 10_000 }); assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, 'INF03_CUSTODY_UNVERIFIED\n');
  }
});

test('verify enlaza originales normales al anchor actual sin publicar ni modificar bytes', async t => {
  const s = await setup(t); await s.addBackup(); await s.accept('approved-deletion'); await s.publish(); await s.lose(); await s.recover();
  const anchorBytes = await readFile(path.join(s.config.anchor, 'current.json')), inventoryBytes = await readFile(path.join(s.paths.inventory, 'inventory.json'));
  const result = await s.withCustody(c => c.verify()); assert.equal(result.verified, true); assert.equal(result.restoreEligible, false); assert.ok(result.expiresAt);
  assert.deepEqual(await readFile(path.join(s.config.anchor, 'current.json')), anchorBytes); assert.deepEqual(await readFile(path.join(s.paths.inventory, 'inventory.json')), inventoryBytes);
  const checkpointBytes = await readFile(path.join(s.paths.inventoryCheckpoint, 'checkpoint.json'));
  const added = await s.addBackup('new.age'); await s.publish();
  await writeFile(path.join(s.paths.inventory, 'inventory.json'), inventoryBytes); await writeFile(path.join(s.paths.inventoryCheckpoint, 'checkpoint.json'), checkpointBytes); await unlink(added.output); await unlink(added.output + '.receipt.json');
  await assert.rejects(s.withCustody(c => c.verify()));
});

test('vencimiento durante cierre bloquea el resultado aunque publish haya terminado', async t => {
  const s = await setup(t); const b = await s.addBackup(); const custody = await new LocalSimulatedCustody(s.config).open();
  const result = await custody.publish(); assert.equal(result.expiresAt, new Date(Date.parse(b.record.originalCreatedAt) + RETENTION_MS).toISOString());
  s.clockState.now = Date.parse(result.expiresAt); await assert.rejects(custody.close()); await assert.rejects(lstat(path.join(s.config.anchor, 'custody.lock')), { code: 'ENOENT' });
});
