import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { BackupInventory, expired, originalTime, RETENTION_MS, privateDirectory, privateFile, syncDirectory } from './inf03-inventory-common.mjs';
import { LocalSimulatedTransfer, TRANSFER_CIPHERTEXT_MAX, TRANSFER_RECEIPT_MAX } from './inf03-transfer-common.mjs';

const MAX_METADATA = 16 * 1024 * 1024;
const MAX_RECORDS = 1000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEX = /^[a-f0-9]{64}$/;
const FILES = ['repository-marker.json', 'inventory.json', 'inventory-checkpoint.json', 'journal-genesis.json', 'journal-entries.jsonl', 'journal-checkpoint.json'];
const fail = () => { throw new Error('INF03_CUSTODY_UNVERIFIED'); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mac = (key, body) => createHmac('sha256', key).update(JSON.stringify(body)).digest('hex');
const signed = (key, body) => JSON.stringify({ body, mac: mac(key, body) }) + '\n';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keys = (value, expected) => { if (!value || typeof value !== 'object' || Array.isArray(value) || !same(Object.keys(value).sort(), [...expected].sort())) fail(); };
const canonical = input => {
  if (!path.isAbsolute(input ?? '') || input.includes('\0') || input.includes('://')) fail();
  const p = path.resolve(input);
  return process.platform === 'darwin' ? p.replace(/^\/tmp(?=\/|$)/, '/private/tmp').replace(/^\/var(?=\/|$)/, '/private/var') : p;
};
const overlap = (a, b) => a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
function disjoint(dirs) { const values = Object.values(dirs); if (values.some((a, i) => values.some((b, j) => i !== j && overlap(a, b)))) fail(); }
async function absent(file) { try { await lstat(file); fail(); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
async function writeNew(file, bytes) {
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(path.dirname(file));
  return privateFile(file, Math.max(MAX_METADATA, Buffer.byteLength(bytes)));
}
function decode(bytes, key) {
  const text = bytes.toString('utf8'), wrapped = JSON.parse(text); keys(wrapped, ['body', 'mac']);
  if (typeof wrapped.mac !== 'string' || !HEX.test(wrapped.mac) || !timingSafeEqual(Buffer.from(wrapped.mac, 'hex'), Buffer.from(mac(key, wrapped.body), 'hex')) || signed(key, wrapped.body) !== text) fail();
  return wrapped.body;
}
const identity = st => ({ dev: st.dev, ino: st.ino });
async function assertIdentity(dir, expected) { await privateDirectory(dir); if (!same(identity(await lstat(dir)), expected)) fail(); }
function sourcePaths(config) {
  return { repository: canonical(config.inventoryConfig.repository), inventory: canonical(config.inventoryConfig.inventory), inventoryCheckpoint: canonical(config.inventoryConfig.checkpoint), journal: canonical(config.journalConfig.journalDirectory), journalCheckpoint: canonical(config.journalConfig.checkpointDirectory) };
}
function sourceFiles(p) { return [path.join(p.repository, '.inf03-repository.json'), path.join(p.inventory, 'inventory.json'), path.join(p.inventoryCheckpoint, 'checkpoint.json'), path.join(p.journal, 'genesis.json'), path.join(p.journal, 'entries.jsonl'), path.join(p.journalCheckpoint, 'checkpoint.json')]; }
function outsideHost(paths, others) {
  disjoint({ ...paths, ...others });
  // Los cinco originales delimitan el árbol lógico del host; sus custodios deben quedar afuera.
  let common = paths.repository;
  while (!Object.values(paths).every(p => p === common || p.startsWith(common + path.sep))) common = path.dirname(common);
  if (common !== path.parse(common).root && Object.values(others).some(p => p === common || p.startsWith(common + path.sep))) fail();
}
function checkConfig(c) {
  if (typeof c.journalFactory !== 'function') fail();
  const secrets = [c.key, c.inventoryConfig?.key, c.journalConfig?.hmacKey];
  if (secrets.some(k => typeof k !== 'string' || Buffer.byteLength(k) < 32) || secrets.some((k, i) => secrets.some((v, j) => i !== j && k === v))) fail();
  if (c.transferKey !== undefined && (typeof c.transferKey !== 'string' || Buffer.byteLength(c.transferKey) < 32 || secrets.includes(c.transferKey))) fail();
  const paths = sourcePaths(c), others = { store: canonical(c.store), anchor: canonical(c.anchor) }; outsideHost(paths, others);
  return { paths, ...others };
}
function inventoryHead(state) { return { version: 1, repositoryId: state.repositoryId, sequence: state.sequence, head: hash(JSON.stringify(state)) }; }
function journalHead(checkpoint) { return { journalId: checkpoint.journalId, coverageStartsAt: checkpoint.coverageStartsAt, sequence: checkpoint.sequence, head: checkpoint.head }; }
function activeRecords(state, now, fresh = true) {
  if (!Array.isArray(state.records) || state.records.length > 10_000 || state.records.filter(r => r.status === 'active').length > MAX_RECORDS) fail();
  for (const r of state.records) {
    if (!UUID.test(r.backupId) || typeof r.filename !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}\.age$/.test(r.filename) || !['active', 'retired'].includes(r.status)) fail();
    originalTime(r.originalCreatedAt, now);
    if (fresh && r.status === 'active' && expired(r.originalCreatedAt, now)) fail();
  }
  return state.records.filter(r => r.status === 'active');
}
function expiresAt(state) {
  const dates = state.records.filter(r => r.status === 'active').map(r => Date.parse(r.originalCreatedAt) + RETENTION_MS);
  return dates.length ? new Date(Math.min(...dates)).toISOString() : null;
}
function checkCoverage(state, journal, now) {
  const start = originalTime(journal.coverageStartsAt, now);
  if (typeof journal.journalId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(journal.journalId) || !Number.isSafeInteger(journal.sequence) || journal.sequence < 0 || journal.sequence > 100_000 || typeof journal.head !== 'string' || !HEX.test(journal.head)) fail();
  if (state.records.some(r => r.status === 'active' && originalTime(r.originalCreatedAt, now) < start)) fail();
}
function monotonic(prior, next) {
  const a = prior.descriptor, b = next.descriptor;
  if (!same(a.paths, b.paths) || a.inventory.repositoryId !== b.inventory.repositoryId || b.inventory.sequence < a.inventory.sequence || (a.inventory.sequence === b.inventory.sequence && !same(a.inventory, b.inventory)) || a.journal.journalId !== b.journal.journalId || a.journal.coverageStartsAt !== b.journal.coverageStartsAt || b.journal.sequence < a.journal.sequence || (a.journal.sequence === b.journal.sequence && !same(a.journal, b.journal))) fail();
  if (!next.bytes[3].equals(prior.bytes[3]) || !next.bytes[4].subarray(0, prior.bytes[4].length).equals(prior.bytes[4])) fail();
  for (const old of prior.state.records) {
    const current = next.state.records.find(r => r.backupId === old.backupId);
    if (!current || !same({ ...old, status: undefined, deletion: undefined }, { ...current, status: undefined, deletion: undefined }) || (old.status === 'retired' && !same(old, current))) fail();
  }
}

/** La factory inyectada es la autoridad del protocolo de bajas; este módulo no lo reimplementa. */
export class LocalSimulatedCustody {
  constructor(config) { this.config = config; this.dirs = checkConfig(config); this.now = config.clock ?? Date.now; this.owner = randomUUID(); this.locks = []; }
  async open() {
    if (this.opened || this.locks.length) fail();
    try {
      for (const dir of [this.dirs.store, this.dirs.anchor].sort()) {
        await privateDirectory(dir); const st = await lstat(dir);
        const file = path.join(dir, 'custody.lock'); const value = await writeNew(file, this.owner);
        this.locks.push({ dir, file, directory: identity(st), fileIdentity: identity(value.stat) });
      }
      this.storeMarker = decode((await privateFile(path.join(this.dirs.store, '.inf03-custody-store.json'))).bytes, this.config.key);
      this.anchorMarker = decode((await privateFile(path.join(this.dirs.anchor, '.inf03-custody-anchor.json'))).bytes, this.config.key);
      keys(this.storeMarker, ['version', 'kind', 'storeId', 'anchorId', 'store']); keys(this.anchorMarker, ['version', 'kind', 'storeId', 'anchorId', 'anchor']);
      const s = this.storeMarker, a = this.anchorMarker;
      if (s.version !== 1 || a.version !== 1 || s.kind !== 'inf03-custody-store-local-simulated' || a.kind !== 'inf03-custody-anchor-local-simulated' || !UUID.test(s.storeId) || !UUID.test(s.anchorId) || s.storeId === s.anchorId || a.storeId !== s.storeId || a.anchorId !== s.anchorId || s.store !== this.dirs.store || a.anchor !== this.dirs.anchor) fail();
      this.opened = true; await this.current(); return this;
    } catch (error) { await this.close(); throw error; }
  }
  async guard() {
    if (!this.opened) fail();
    for (const lock of this.locks) {
      await assertIdentity(lock.dir, lock.directory); const value = await privateFile(lock.file, 100);
      if (value.bytes.toString() !== this.owner || !same(identity(value.stat), lock.fileIdentity)) fail();
    }
    if (!same(decode((await privateFile(path.join(this.dirs.store, '.inf03-custody-store.json'))).bytes, this.config.key), this.storeMarker) || !same(decode((await privateFile(path.join(this.dirs.anchor, '.inf03-custody-anchor.json'))).bytes, this.config.key), this.anchorMarker)) fail();
  }
  async close() {
    const errors = [];
    if (this.resultState && this.opened) {
      try { activeRecords(this.resultState, this.now()); if (!(await this.current()).bytes.equals(this.resultAnchor)) fail(); } catch (error) { errors.push(error); }
    }
    for (const lock of this.locks.splice(0)) {
      try { await assertIdentity(lock.dir, lock.directory); const value = await privateFile(lock.file, 100); if (value.bytes.toString() !== this.owner || !same(identity(value.stat), lock.fileIdentity)) fail(); await unlink(lock.file); await syncDirectory(lock.dir); } catch (error) { errors.push(error); }
    }
    this.opened = false;
    if (this.resultState) { try { activeRecords(this.resultState, this.now()); } catch (error) { errors.push(error); } }
    if (errors.length) throw errors[0];
  }
  async current() {
    await this.guard();
    if ((await readdir(this.dirs.anchor)).some(n => !['.inf03-custody-anchor.json', 'current.json', 'custody.lock'].includes(n))) fail();
    const value = await privateFile(path.join(this.dirs.anchor, 'current.json')), body = decode(value.bytes, this.config.key);
    keys(body, ['version', 'storeId', 'anchorId', 'generation', 'snapshotId', 'snapshotSha256', 'inventory', 'journal']);
    if (body.version !== 1 || body.storeId !== this.storeMarker.storeId || body.anchorId !== this.anchorMarker.anchorId || !Number.isSafeInteger(body.generation) || body.generation < 0) fail();
    if (body.generation === 0) { if (body.snapshotId !== null || body.snapshotSha256 !== null || body.inventory !== null || body.journal !== null) fail(); }
    else if (!UUID.test(body.snapshotId) || !HEX.test(body.snapshotSha256)) fail();
    return { body, bytes: value.bytes, stat: value.stat };
  }
  async load(current, { fresh = true } = {}) {
    const a = current.body; if (a.generation < 1) fail();
    const dir = path.join(this.dirs.store, a.snapshotId); await privateDirectory(dir);
    if (!same((await readdir(dir)).sort(), [...FILES, 'commit.json'].sort())) fail();
    const commit = (await privateFile(path.join(dir, 'commit.json'), MAX_METADATA)).bytes;
    if (hash(commit) !== a.snapshotSha256) fail();
    const descriptor = decode(commit, this.config.key); keys(descriptor, ['version', 'kind', 'storeId', 'anchorId', 'snapshotId', 'generation', 'publishedAt', 'paths', 'inventory', 'journal', 'files']);
    if (descriptor.version !== 1 || descriptor.kind !== 'inf03-custody-snapshot-local-simulated' || descriptor.storeId !== a.storeId || descriptor.anchorId !== a.anchorId || descriptor.snapshotId !== a.snapshotId || descriptor.generation !== a.generation || !same(descriptor.inventory, a.inventory) || !same(descriptor.journal, a.journal) || !same(descriptor.paths, this.dirs.paths)) fail();
    originalTime(descriptor.publishedAt, this.now()); outsideHost(descriptor.paths, { store: this.dirs.store, anchor: this.dirs.anchor });
    keys(descriptor.files, FILES);
    const bytes = [];
    for (const name of FILES) { const value = (await privateFile(path.join(dir, name), MAX_METADATA)).bytes; if (!same(descriptor.files[name], { bytes: value.length, sha256: hash(value) })) fail(); bytes.push(value); }
    const marker = decode(bytes[0], this.config.inventoryConfig.key), state = decode(bytes[1], this.config.inventoryConfig.key), checkpoint = decode(bytes[2], this.config.inventoryConfig.key);
    if (marker.repository !== descriptor.paths.repository || marker.repositoryId !== state.repositoryId || !same(checkpoint, inventoryHead(state)) || !same(checkpoint, descriptor.inventory)) fail();
    const journalCheckpoint = JSON.parse(bytes[5].toString());
    if (!same(journalHead(journalCheckpoint), descriptor.journal)) fail();
    activeRecords(state, this.now(), fresh); checkCoverage(state, descriptor.journal, this.now()); return { descriptor, bytes, state };
  }
  async withSources(work) {
    const inventory = new BackupInventory(this.config.inventoryConfig, { clock: this.now });
    let journal;
    try {
      await inventory.open(); journal = await this.config.journalFactory(this.config.journalConfig); await journal.open();
      return await work(inventory, journal);
    } finally { try { if (journal) await journal.close(); } finally { await inventory.close(); } }
  }
  async capture(inventory, journal, generation) {
    for (const p of Object.values(this.dirs.paths)) await privateDirectory(p);
    const state = await inventory.refresh(), snapshot = await journal.snapshot();
    activeRecords(state, this.now()); checkCoverage(state, journalHead(snapshot.checkpoint), this.now());
    if (snapshot.entries.some(e => originalTime(e.acceptedAt, this.now()) < Date.parse(snapshot.checkpoint.coverageStartsAt))) fail();
    const bytes = [];
    for (const file of sourceFiles(this.dirs.paths)) bytes.push((await privateFile(file, MAX_METADATA)).bytes);
    if (!same(decode(bytes[1], this.config.inventoryConfig.key), state) || !same(decode(bytes[2], this.config.inventoryConfig.key), inventoryHead(state)) || bytes[5].toString() !== JSON.stringify(snapshot.checkpoint) + '\n' || bytes[4].toString() !== snapshot.entries.map(e => JSON.stringify(e) + '\n').join('')) fail();
    const descriptor = { version: 1, kind: 'inf03-custody-snapshot-local-simulated', storeId: this.storeMarker.storeId, anchorId: this.anchorMarker.anchorId, snapshotId: randomUUID(), generation, publishedAt: new Date(this.now()).toISOString(), paths: this.dirs.paths, inventory: inventoryHead(state), journal: journalHead(snapshot.checkpoint), files: Object.fromEntries(FILES.map((name, i) => [name, { bytes: bytes[i].length, sha256: hash(bytes[i]) }])) };
    if (!same(await inventory.refresh(), state) || !same(await journal.snapshot(), snapshot)) fail();
    return { descriptor, bytes, state };
  }
  async publish() {
    return this.withSources(async (inventory, journal) => {
      const initial = await this.current(), prior = initial.body.generation ? await this.load(initial, { fresh: false }) : null;
      const next = await this.capture(inventory, journal, initial.body.generation + 1);
      if (prior) {
        monotonic(prior, next);
        if (same(prior.descriptor.inventory, next.descriptor.inventory) && same(prior.descriptor.journal, next.descriptor.journal)) {
          if (!next.bytes.every((b, i) => b.equals(prior.bytes[i]))) fail();
          if (!(await this.current()).bytes.equals(initial.bytes)) fail();
          this.resultState = next.state; this.resultAnchor = initial.bytes;
          return { mode: 'local-simulated', published: true, idempotent: true, expiresAt: expiresAt(next.state), restoreEligible: false };
        }
      }
      await this.guard(); const dir = path.join(this.dirs.store, next.descriptor.snapshotId); await mkdir(dir, { mode: 0o700 }); await syncDirectory(this.dirs.store);
      const id = identity(await lstat(dir));
      for (let i = 0; i < FILES.length; i++) { await assertIdentity(dir, id); await writeNew(path.join(dir, FILES[i]), next.bytes[i]); }
      const again = await this.capture(inventory, journal, next.descriptor.generation);
      if (!same(again.descriptor.inventory, next.descriptor.inventory) || !same(again.descriptor.journal, next.descriptor.journal) || !again.bytes.every((b, i) => b.equals(next.bytes[i]))) fail();
      await assertIdentity(dir, id); const commit = signed(this.config.key, next.descriptor); await writeNew(path.join(dir, 'commit.json'), commit); await syncDirectory(dir); await syncDirectory(this.dirs.store);
      const current = await this.current(); if (!current.bytes.equals(initial.bytes) || !same(identity(current.stat), identity(initial.stat))) fail();
      const body = { version: 1, storeId: next.descriptor.storeId, anchorId: next.descriptor.anchorId, generation: next.descriptor.generation, snapshotId: next.descriptor.snapshotId, snapshotSha256: hash(commit), inventory: next.descriptor.inventory, journal: next.descriptor.journal };
      // El checkpoint mutable es la única sustitución autorizada y sucede después del commit durable.
      const temp = path.join(this.dirs.anchor, `.current-${randomUUID()}.partial`); await writeNew(temp, signed(this.config.key, body));
      await this.guard(); const last = await privateFile(path.join(this.dirs.anchor, 'current.json')); if (!last.bytes.equals(initial.bytes) || !same(identity(last.stat), identity(initial.stat))) fail();
      await rename(temp, path.join(this.dirs.anchor, 'current.json')); await syncDirectory(this.dirs.anchor);
      const final = await this.current(); if (!same(final.body, body)) fail(); await this.load(final);
      this.resultState = next.state; this.resultAnchor = final.bytes;
      return { mode: 'local-simulated', published: true, idempotent: false, activeRecords: activeRecords(next.state, this.now()).length, suppressionSequence: next.descriptor.journal.sequence, expiresAt: expiresAt(next.state), restoreEligible: false };
    });
  }
  async verify() {
    const initial = await this.current(), snapshot = await this.load(initial);
    const result = await this.withSources(async (inventory, journal) => {
      const actual = await this.capture(inventory, journal, snapshot.descriptor.generation);
      if (!same(actual.descriptor.inventory, snapshot.descriptor.inventory) || !same(actual.descriptor.journal, snapshot.descriptor.journal) || !actual.bytes.every((b, i) => b.equals(snapshot.bytes[i]))) fail();
      if (!(await this.current()).bytes.equals(initial.bytes)) fail(); await this.load(await this.current());
      return { mode: 'local-simulated', verified: true, activeRecords: activeRecords(actual.state, this.now()).length, suppressionSequence: actual.descriptor.journal.sequence, expiresAt: expiresAt(actual.state), restoreEligible: false };
    });
    this.resultState = snapshot.state; this.resultAnchor = initial.bytes;
    activeRecords(snapshot.state, this.now()); if (!(await this.current()).bytes.equals(initial.bytes)) fail();
    return result;
  }
  async recover({ objects, transferKey = this.config.transferKey } = {}) {
    if (typeof transferKey !== 'string' || Buffer.byteLength(transferKey) < 32 || [this.config.key, this.config.inventoryConfig.key, this.config.journalConfig.hmacKey].includes(transferKey)) fail();
    const initial = await this.current(), snapshot = await this.load(initial), paths = snapshot.descriptor.paths;
    const objectPath = canonical(objects); outsideHost(paths, { store: this.dirs.store, anchor: this.dirs.anchor, objects: objectPath });
    const parents = new Map();
    for (const dir of Object.values(paths)) { const parent = await privateDirectory(path.dirname(dir)); parents.set(parent, identity(await lstat(parent))); await absent(dir); }
    const created = new Map();
    const guardTargets = async () => {
      await this.guard(); if (!(await this.current()).bytes.equals(initial.bytes)) fail();
      for (const [parent, id] of parents) await assertIdentity(parent, id);
      for (const [dir, id] of created) await assertIdentity(dir, id);
      activeRecords(snapshot.state, this.now());
    };
    const transfer = new LocalSimulatedTransfer({ objects: objectPath, key: transferKey, clock: this.now });
    try {
      await transfer.open(); const records = activeRecords(snapshot.state, this.now()), verified = new Map();
      const verifyRecord = async r => {
        await transfer.guard(); const v = await transfer.verifyObject(r.backupId), d = v.descriptor;
        if (v.retired || d.originalCreatedAt !== r.originalCreatedAt || d.ciphertextBytes !== r.ciphertextBytes || d.ciphertextSha256 !== r.ciphertextSha256 || d.receiptSha256 !== r.receiptSha256) fail(); return d;
      };
      // Preflight completo antes del primer mkdir: incluye todos los objetos que el audit normal exigirá.
      for (const r of records) verified.set(r.backupId, await verifyRecord(r));
      await guardTargets();
      for (const dir of Object.values(paths)) {
        await guardTargets(); await absent(dir); await mkdir(dir, { mode: 0o700 }); created.set(dir, identity(await lstat(dir))); await syncDirectory(path.dirname(dir)); await guardTargets();
      }
      const targets = sourceFiles(paths);
      for (let i = 0; i < FILES.length; i++) { await guardTargets(); await writeNew(targets[i], snapshot.bytes[i]); const copied = await privateFile(targets[i], MAX_METADATA); if (!copied.bytes.equals(snapshot.bytes[i])) fail(); }
      for (const r of records) {
        await guardTargets(); const d = await verifyRecord(r); if (!same(d, verified.get(r.backupId))) fail();
        for (const [source, target, max, expected, size] of [['ciphertext.age', r.filename, TRANSFER_CIPHERTEXT_MAX, r.ciphertextSha256, r.ciphertextBytes], ['receipt.json', r.filename + '.receipt.json', TRANSFER_RECEIPT_MAX, r.receiptSha256, d.receiptBytes]]) {
          await guardTargets(); await transfer.guard();
          const sourcePath = path.join(transfer.directory(r.backupId), source), value = await privateFile(sourcePath, max);
          if (value.bytes.length !== size || hash(value.bytes) !== expected) fail();
          await writeNew(path.join(paths.repository, target), value.bytes);
          const sourceAgain = await privateFile(sourcePath, max), copied = await privateFile(path.join(paths.repository, target), max);
          if (!same(identity(sourceAgain.stat), identity(value.stat)) || !sourceAgain.bytes.equals(value.bytes) || copied.bytes.length !== size || hash(copied.bytes) !== expected) fail();
          await transfer.guard(); await guardTargets();
        }
        if (!same(await verifyRecord(r), d)) fail();
      }
      for (const dir of Object.values(paths)) await syncDirectory(dir);
      await this.withSources(async (inventory, journal) => {
        const final = await this.capture(inventory, journal, snapshot.descriptor.generation);
        if (!same(final.descriptor.inventory, snapshot.descriptor.inventory) || !same(final.descriptor.journal, snapshot.descriptor.journal) || !final.bytes.every((b, i) => b.equals(snapshot.bytes[i]))) fail();
        for (const r of records) await verifyRecord(r); await guardTargets();
      });
      await guardTargets(); await this.load(await this.current());
      this.resultState = snapshot.state; this.resultAnchor = initial.bytes;
      return { mode: 'local-simulated', recovered: true, activeRecords: records.length, suppressionSequence: snapshot.descriptor.journal.sequence, expiresAt: expiresAt(snapshot.state), restoreEligible: false };
    } finally { await transfer.close(); }
  }
}

export async function initializeCustody(config) {
  const dirs = checkConfig(config);
  for (const dir of [dirs.store, dirs.anchor, ...Object.values(dirs.paths)]) await privateDirectory(dir);
  for (const dir of [dirs.store, dirs.anchor]) if ((await readdir(dir)).length) fail();
  const storeId = randomUUID(), anchorId = randomUUID();
  await writeNew(path.join(dirs.store, '.inf03-custody-store.json'), signed(config.key, { version: 1, kind: 'inf03-custody-store-local-simulated', storeId, anchorId, store: dirs.store }));
  await writeNew(path.join(dirs.anchor, '.inf03-custody-anchor.json'), signed(config.key, { version: 1, kind: 'inf03-custody-anchor-local-simulated', storeId, anchorId, anchor: dirs.anchor }));
  await writeNew(path.join(dirs.anchor, 'current.json'), signed(config.key, { version: 1, storeId, anchorId, generation: 0, snapshotId: null, snapshotSha256: null, inventory: null, journal: null }));
  return { mode: 'local-simulated', initialized: true, restoreEligible: false };
}
