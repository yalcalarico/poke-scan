import { constants } from 'node:fs';
import { open, lstat, realpath, rename, unlink, readdir } from 'node:fs/promises';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

const MAX_STATE = 4 * 1024 * 1024;
const MAX_RECORDS = 10_000;
const MAX_CIPHERTEXT = 128 * 1024 * 1024;
const HEX = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}\.age$/;
export const RETENTION_MS = 30 * 86400_000;
const fail = () => { throw new Error('INF03_INVENTORY_UNVERIFIED'); };
const equal = (a, b) => typeof a === 'string' && HEX.test(a) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
const sign = (key, body) => createHmac('sha256', key).update(JSON.stringify(body)).digest('hex');
const encoded = (key, body) => JSON.stringify({ body, mac: sign(key, body) }) + '\n';
const ownKeys = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail();
};
export function originalTime(value, now = Date.now()) {
  if (typeof value !== 'string' || !Number.isFinite(now)) fail();
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value || time > now) fail();
  return time;
}
export const expired = (createdAt, now = Date.now()) => now - originalTime(createdAt, now) >= RETENTION_MS;
function canonicalPath(input) {
  const absolute = path.resolve(input);
  return process.platform === 'darwin' ? absolute.replace(/^\/tmp(?=\/|$)/, '/private/tmp').replace(/^\/var(?=\/|$)/, '/private/var') : absolute;
}
export async function privateDirectory(input) {
  if (!path.isAbsolute(input ?? '')) fail();
  const absolute = canonicalPath(input);
  let cursor = path.parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split('/').filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = await lstat(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
  }
  const stat = await lstat(absolute);
  if (stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700 || await realpath(absolute) !== absolute) fail();
  return absolute;
}
export async function syncDirectory(dir) {
  const file = await open(dir, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await file.sync(); } finally { await file.close(); }
}
export async function privateFile(file, max = MAX_STATE) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.uid !== process.getuid?.() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > max) fail();
    const bytes = await handle.readFile();
    if (bytes.length !== stat.size || bytes.length > max) fail();
    const after = await handle.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || after.nlink !== 1) fail();
    return { bytes, stat };
  } finally { await handle.close(); }
}
/** La custodia durable nunca debe adelantarse a los bytes que acredita. */
export async function syncPrivateFile(file, max = MAX_CIPHERTEXT) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.uid !== process.getuid?.() || before.nlink !== 1 || (before.mode & 0o777) !== 0o600 || before.size > max) fail();
    await handle.sync();
    const after = await lstat(file);
    if (after.isSymbolicLink() || after.ino !== before.ino || after.dev !== before.dev || after.nlink !== 1 || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) fail();
  } finally { await handle.close(); }
}
async function writeNew(file, text) {
  if (Buffer.byteLength(text) > MAX_STATE) fail();
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(path.dirname(file));
}
async function replace(file, text) {
  // Un corte entre state y checkpoint deja desacuerdo: jamás se adivina cuál es actual.
  const temp = path.join(path.dirname(file), `.inventory-${randomUUID()}.partial`);
  await writeNew(temp, text);
  await rename(temp, file); await syncDirectory(path.dirname(file));
}
async function decode(file, key) {
  const text = (await privateFile(file)).bytes.toString('utf8');
  const value = JSON.parse(text);
  ownKeys(value, ['body', 'mac']);
  if (!equal(value.mac, sign(key, value.body)) || encoded(key, value.body) !== text) fail();
  return value.body;
}
async function directories(config) {
  if (typeof config.key !== 'string' || config.key.length < 32) fail();
  const dirs = { repository: await privateDirectory(config.repository), inventory: await privateDirectory(config.inventory), checkpoint: await privateDirectory(config.checkpoint) };
  const values = Object.values(dirs);
  if (values.some((a, i) => values.some((b, j) => i !== j && (a === b || a.startsWith(b + path.sep))))) fail();
  return dirs;
}
const head = (state) => createHash('sha256').update(JSON.stringify(state)).digest('hex');
const checkpoint = (state) => ({ version: 1, repositoryId: state.repositoryId, sequence: state.sequence, head: head(state) });
export async function initializeInventory(config) {
  const dirs = await directories(config);
  for (const dir of Object.values(dirs)) if ((await readdir(dir)).length) fail();
  const repositoryId = randomUUID();
  const marker = { version: 1, project: 'pokemon-cards-scanner-app', environment: 'inf03-synthetic-local', repositoryId, repository: dirs.repository };
  const state = { version: 1, repositoryId, sequence: 0, records: [] };
  // Provisión explícita y no reemplazable; una provisión parcial exige intervención.
  await writeNew(path.join(dirs.repository, '.inf03-repository.json'), encoded(config.key, marker));
  await writeNew(path.join(dirs.inventory, 'inventory.json'), encoded(config.key, state));
  await writeNew(path.join(dirs.checkpoint, 'checkpoint.json'), encoded(config.key, checkpoint(state)));
  return repositoryId;
}
export function inventoryConfig(args, env = process.env) {
  const value = (name) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
  return { repository: value('--repository'), inventory: value('--inventory'), checkpoint: value('--inventory-checkpoint'), key: env.INF03_INVENTORY_HMAC_KEY };
}
export class BackupInventory {
  constructor(config, { clock = Date.now } = {}) { this.config = config; this.now = clock; this.owner = randomUUID(); this.locks = []; this.poisoned = false; }
  async open() {
    if (this.dirs || this.poisoned) fail();
    const dirs = await directories(this.config);
    try {
      for (const dir of Object.values(dirs).sort()) {
        const file = path.join(dir, 'inventory.lock'); await writeNew(file, this.owner); this.locks.push(file);
      }
      this.dirs = dirs; this.state = await this.read(); await this.audit(); return this;
    } catch (error) { this.poisoned = true; await this.close(); throw error; }
  }
  async close() {
    for (const file of this.locks.splice(0)) {
      if ((await privateFile(file)).bytes.toString() !== this.owner) fail();
      await unlink(file); await syncDirectory(path.dirname(file));
    }
    this.dirs = undefined;
  }
  async read() {
    if (!this.dirs || this.poisoned) fail();
    await directories(this.config);
    for (const file of this.locks) if ((await privateFile(file)).bytes.toString() !== this.owner) fail();
    const marker = await decode(path.join(this.dirs.repository, '.inf03-repository.json'), this.config.key);
    ownKeys(marker, ['version', 'project', 'environment', 'repositoryId', 'repository']);
    if (marker.version !== 1 || marker.project !== 'pokemon-cards-scanner-app' || marker.environment !== 'inf03-synthetic-local' || !UUID.test(marker.repositoryId) || marker.repository !== this.dirs.repository) fail();
    const state = await decode(path.join(this.dirs.inventory, 'inventory.json'), this.config.key);
    ownKeys(state, ['version', 'repositoryId', 'sequence', 'records']);
    if (state.version !== 1 || state.repositoryId !== marker.repositoryId || !Number.isSafeInteger(state.sequence) || state.sequence < 0 || !Array.isArray(state.records) || state.records.length > MAX_RECORDS) fail();
    const trusted = await decode(path.join(this.dirs.checkpoint, 'checkpoint.json'), this.config.key);
    if (JSON.stringify(trusted) !== JSON.stringify(checkpoint(state))) fail();
    const ids = new Set(), names = new Set(), hashes = new Set();
    for (const r of state.records) {
      ownKeys(r, ['backupId', 'filename', 'originalCreatedAt', 'ciphertextBytes', 'ciphertextSha256', 'receiptSha256', 'status', 'deletion']);
      originalTime(r.originalCreatedAt, this.now());
      if (!UUID.test(r.backupId) || !NAME.test(r.filename) || !Number.isSafeInteger(r.ciphertextBytes) || r.ciphertextBytes < 1 || r.ciphertextBytes > MAX_CIPHERTEXT || !HEX.test(r.ciphertextSha256) || !HEX.test(r.receiptSha256) || !['active', 'deleting', 'retired'].includes(r.status) || ids.has(r.backupId) || names.has(r.filename) || hashes.has(r.ciphertextSha256)) fail();
      ids.add(r.backupId); names.add(r.filename); hashes.add(r.ciphertextSha256);
      if (r.status === 'active') { if (r.deletion !== null) fail(); }
      else {
        ownKeys(r.deletion, ['intentId', 'authorizedAt', 'ciphertextDev', 'ciphertextIno', 'receiptDev', 'receiptIno']);
        if (!UUID.test(r.deletion.intentId) || !expired(r.originalCreatedAt, originalTime(r.deletion.authorizedAt, this.now())) || !['ciphertextDev', 'ciphertextIno', 'receiptDev', 'receiptIno'].every((field) => Number.isSafeInteger(r.deletion[field]) && r.deletion[field] >= 0)) fail();
      }
    }
    return state;
  }
  async refresh() {
    const actual = await this.read();
    if (JSON.stringify(actual) !== JSON.stringify(this.state)) fail();
    await this.audit(); return actual;
  }
  async commit(records) {
    await this.refresh();
    const next = { ...this.state, sequence: this.state.sequence + 1, records };
    try {
      await replace(path.join(this.dirs.inventory, 'inventory.json'), encoded(this.config.key, next));
      await replace(path.join(this.dirs.checkpoint, 'checkpoint.json'), encoded(this.config.key, checkpoint(next)));
      this.state = next; await this.read();
    } catch (error) { this.poisoned = true; throw error; }
  }
  async file(record, receipt = false) {
    const filename = record.filename + (receipt ? '.receipt.json' : '');
    try {
      const value = await privateFile(path.join(this.dirs.repository, filename), receipt ? 64 * 1024 : MAX_CIPHERTEXT);
      const digest = createHash('sha256').update(value.bytes).digest('hex');
      if (digest !== (receipt ? record.receiptSha256 : record.ciphertextSha256) || (!receipt && value.stat.size !== record.ciphertextBytes)) fail();
      if (record.status !== 'active' && (value.stat.dev !== record.deletion[receipt ? 'receiptDev' : 'ciphertextDev'] || value.stat.ino !== record.deletion[receipt ? 'receiptIno' : 'ciphertextIno'])) fail();
      return value;
    } catch (error) { if (error.code === 'ENOENT' && record.status !== 'active') return null; throw error; }
  }
  async audit() {
    for (const record of this.state.records) {
      if (record.status === 'retired') {
        for (const suffix of ['', '.receipt.json']) {
          try { await lstat(path.join(this.dirs.repository, record.filename + suffix)); fail(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      } else { await this.file(record); await this.file(record, true); }
    }
  }
  async registerVerifiedBackup({ manifest, receipt, output }) {
    await this.refresh();
    if (manifest.backupId !== receipt.backupId || expired(manifest.createdAt, this.now())) fail();
    const filename = path.basename(output);
    if (canonicalPath(output) !== path.join(this.dirs.repository, filename) || !NAME.test(filename) || this.state.records.length >= MAX_RECORDS) fail();
    const value = await privateFile(output, MAX_CIPHERTEXT);
    const ciphertextSha256 = createHash('sha256').update(value.bytes).digest('hex');
    const receiptFile = await privateFile(output + '.receipt.json', 64 * 1024);
    if (receipt.ciphertextBytes !== value.stat.size || receipt.ciphertextSha256 !== ciphertextSha256 || JSON.stringify(JSON.parse(receiptFile.bytes.toString())) !== JSON.stringify(receipt)) fail();
    if (this.state.records.some((r) => r.backupId === manifest.backupId || r.filename === filename || r.ciphertextSha256 === ciphertextSha256)) fail();
    const record = { backupId: manifest.backupId, filename, originalCreatedAt: manifest.createdAt, ciphertextBytes: value.stat.size, ciphertextSha256, receiptSha256: createHash('sha256').update(receiptFile.bytes).digest('hex'), status: 'active', deletion: null };
    await this.commit([...this.state.records, record]); return record;
  }
  async admitRestore(input, receiptPath, receipt, manifest) {
    await this.refresh();
    const record = this.state.records.find((r) => r.backupId === receipt.backupId);
    if (!record || record.status !== 'active' || expired(record.originalCreatedAt, this.now()) || canonicalPath(input) !== path.join(this.dirs.repository, record.filename) || canonicalPath(receiptPath) !== path.join(this.dirs.repository, record.filename + '.receipt.json') || record.ciphertextBytes !== receipt.ciphertextBytes || record.ciphertextSha256 !== receipt.ciphertextSha256 || (manifest && (manifest.backupId !== record.backupId || manifest.createdAt !== record.originalCreatedAt))) fail();
    return record;
  }
  async prune({ apply = false, now = this.now(), afterUnlink } = {}) {
    await this.refresh();
    if (!Number.isFinite(now) || now > this.now()) fail();
    const candidates = this.state.records.filter((r) => r.status !== 'retired' && expired(r.originalCreatedAt, now));
    if (!apply) return { dryRun: true, expired: candidates.map((r) => ({ backupId: r.backupId, originalCreatedAt: r.originalCreatedAt, status: r.status })) };
    for (const candidate of candidates) {
      let record = this.state.records.find((r) => r.backupId === candidate.backupId);
      if (record.status === 'active') {
        const cipher = await this.file(record), receipt = await this.file(record, true);
        record = { ...record, status: 'deleting', deletion: { intentId: randomUUID(), authorizedAt: new Date(now).toISOString(), ciphertextDev: cipher.stat.dev, ciphertextIno: cipher.stat.ino, receiptDev: receipt.stat.dev, receiptIno: receipt.stat.ino } };
        await this.commit(this.state.records.map((r) => r.backupId === record.backupId ? record : r));
      }
      for (const receipt of [false, true]) {
        await this.refresh();
        const current = await this.file(record, receipt);
        if (current) {
          const file = path.join(this.dirs.repository, record.filename + (receipt ? '.receipt.json' : ''));
          const actual = await lstat(file);
          if (actual.isSymbolicLink() || actual.nlink !== 1 || actual.dev !== current.stat.dev || actual.ino !== current.stat.ino || actual.ctimeMs !== current.stat.ctimeMs || actual.size !== current.stat.size) fail();
          await unlink(file); await syncDirectory(this.dirs.repository);
          if (afterUnlink) await afterUnlink({ backupId: record.backupId, receipt });
        }
      }
      await this.commit(this.state.records.map((r) => r.backupId === record.backupId ? { ...record, status: 'retired' } : r));
    }
    return { dryRun: false, retired: candidates.map((r) => r.backupId) };
  }
}
