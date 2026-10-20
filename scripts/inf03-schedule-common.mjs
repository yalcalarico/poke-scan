import { constants } from 'node:fs';
import { lstat, open, readdir, unlink } from 'node:fs/promises';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { BackupInventory, expired, originalTime, RETENTION_MS, privateDirectory, privateFile, syncDirectory } from './inf03-inventory-common.mjs';
import { LocalSimulatedTransfer, readTransferReceipt } from './inf03-transfer-common.mjs';
import { LocalSimulatedCustody } from './inf03-custody-common.mjs';

const fail = () => { throw new Error('INF03_SCHEDULE_UNVERIFIED'); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const shape = (v, fields) => { if (!v || typeof v !== 'object' || Array.isArray(v) || !same(Object.keys(v).sort(), [...fields].sort())) fail(); };
const identity = stat => ({ dev: stat.dev, ino: stat.ino });
const digest = value => createHash('sha256').update(value).digest('hex');
const sign = (key, body) => createHmac('sha256', key).update(JSON.stringify(body)).digest('hex');
const encoded = (key, body) => JSON.stringify({ body, mac: sign(key, body) }) + '\n';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MAX_CYCLES = 1000;
const canonical = input => {
  if (!path.isAbsolute(input ?? '') || input.includes('://') || input.includes('\0')) fail();
  const value = path.resolve(input);
  return process.platform === 'darwin' ? value.replace(/^\/tmp(?=\/|$)/, '/private/tmp').replace(/^\/var(?=\/|$)/, '/private/var') : value;
};
async function writeNew(file, text) {
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(path.dirname(file));
}
async function decode(file, key) {
  const text = (await privateFile(file, 64 * 1024)).bytes.toString();
  const value = JSON.parse(text); shape(value, ['body', 'mac']);
  if (typeof value.mac !== 'string' || !/^[a-f0-9]{64}$/.test(value.mac) || !timingSafeEqual(Buffer.from(value.mac, 'hex'), Buffer.from(sign(key, value.body), 'hex')) || encoded(key, value.body) !== text) fail();
  return value.body;
}
function settings(c) {
  if (c.mode !== 'local-simulated' || typeof c.journalFactory !== 'function') fail();
  const secrets = [c.key, c.inventoryConfig?.key, c.transferKey, c.custodyKey, c.journalConfig?.hmacKey];
  if (secrets.some(k => typeof k !== 'string' || Buffer.byteLength(k) < 32) || new Set(secrets).size !== secrets.length) fail();
  const origin = Date.parse(c.startsAt);
  if (!Number.isFinite(origin) || new Date(origin).toISOString() !== c.startsAt || !Number.isSafeInteger(c.cadenceMs) || c.cadenceMs < 60_000 || c.cadenceMs > RETENTION_MS) fail();
  const paths = { schedule: c.directory, repository: c.inventoryConfig.repository, inventory: c.inventoryConfig.inventory, inventoryCheckpoint: c.inventoryConfig.checkpoint, objects: c.objects, store: c.store, anchor: c.anchor, journal: c.journalConfig.journalDirectory, journalCheckpoint: c.journalConfig.checkpointDirectory };
  const dirs = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, canonical(value)]));
  const values = Object.values(dirs);
  if (values.some((a, i) => values.some((b, j) => i !== j && (a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep))))) fail();
  const s = c.source;
  shape(s, ['runId', 'container', 'database', 'user', 'recipient', 'age']);
  if (!/^inf03-[a-f0-9]{12}$/.test(s.runId ?? '') || s.container !== `${s.runId}-source-pg` || s.database !== 'inf03_source' || s.user !== 'inf03_source' || !/^age1[a-z0-9]{58}$/.test(s.recipient ?? '')) fail();
  const source = { ...s, age: canonical(s.age) };
  return { dirs, configSha256: digest(JSON.stringify({ mode: c.mode, dirs, source, startsAt: c.startsAt, cadenceMs: c.cadenceMs })) };
}
/** Calendario explícito de simulación; agrupa slots perdidos en el último, sin prometer RPO. */
export function planCalendar({ startsAt, cadenceMs, now, completedSlots = [], pendingSlot = null }) {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(now) || !Number.isFinite(start) || new Date(start).toISOString() !== startsAt || !Number.isSafeInteger(cadenceMs) || cadenceMs < 60_000 || cadenceMs > RETENTION_MS || !Array.isArray(completedSlots) || completedSlots.some(s => !Number.isSafeInteger(s) || s < 0) || new Set(completedSlots).size !== completedSlots.length || (pendingSlot !== null && (!Number.isSafeInteger(pendingSlot) || pendingSlot < 0 || completedSlots.includes(pendingSlot)))) fail();
  const latest = now < start ? null : Math.floor((now - start) / cadenceMs);
  if ((pendingSlot !== null && (latest === null || pendingSlot > latest)) || completedSlots.some(s => latest === null || s > latest)) fail();
  const slot = pendingSlot ?? (latest !== null && !completedSlots.includes(latest) ? latest : null);
  const next = latest === null ? start : start + (latest + 1) * cadenceMs;
  if (!Number.isSafeInteger(next) || !Number.isFinite(Date.parse(new Date(next).toISOString()))) fail();
  return { due: slot !== null, slot, resumed: pendingSlot !== null, nextDueAt: new Date(next).toISOString(), maintenance: true };
}

export class LocalSimulatedSchedule {
  constructor(config) { this.config = config; this.settings = settings(config); this.now = config.clock ?? Date.now; this.owner = randomUUID(); }
  inventory() { return new BackupInventory(this.config.inventoryConfig, { clock: this.now }); }
  transfer() { return new LocalSimulatedTransfer({ objects: this.config.objects, key: this.config.transferKey, inventoryConfig: this.config.inventoryConfig, clock: this.now }); }
  custody() { const c = this.config; return new LocalSimulatedCustody({ store: c.store, anchor: c.anchor, key: c.custodyKey, inventoryConfig: c.inventoryConfig, journalConfig: c.journalConfig, journalFactory: c.journalFactory, transferKey: c.transferKey, clock: this.now }); }
  async withResource(resource, work) { try { await resource.open(); return await work(resource); } finally { await resource.close(); } }
  async directoryGuard() {
    for (const [name, dir] of Object.entries(this.settings.dirs)) {
      await privateDirectory(dir);
      const id = identity(await lstat(dir));
      if (this.directoryIdentities && !same(id, this.directoryIdentities[name])) fail();
    }
  }
  async authorities() {
    await this.directoryGuard();
    const inventory = await this.withResource(this.inventory(), i => i.refresh());
    const journal = await this.withResource(await this.config.journalFactory(this.config.journalConfig), j => j.snapshot());
    originalTime(journal.checkpoint.coverageStartsAt, this.now());
    if (inventory.records.some(r => r.status === 'active' && Date.parse(r.originalCreatedAt) < Date.parse(journal.checkpoint.coverageStartsAt))) fail();
    const transfer = await this.withResource(this.transfer(), async t => {
      const objects = [];
      for (const name of await readdir(t.objects)) if (UUID.test(name)) objects.push(await t.verifyObject(name));
      for (const o of objects) {
        const d = o.descriptor, r = inventory.records.find(r => r.backupId === d.backupId);
        if (!r || r.originalCreatedAt !== d.originalCreatedAt || r.ciphertextBytes !== d.ciphertextBytes || r.ciphertextSha256 !== d.ciphertextSha256 || r.receiptSha256 !== d.receiptSha256 || (o.retired && r.status === 'active' && !expired(r.originalCreatedAt, this.now()))) fail();
      }
      return { transferId: t.transferId, objects };
    });
    const custody = await this.withResource(this.custody(), async c => {
      const current = await c.current();
      if (current.body.generation) {
        const prior = await c.load(current, { fresh: false });
        if (prior.descriptor.inventory.repositoryId !== inventory.repositoryId || prior.descriptor.inventory.sequence > inventory.sequence || prior.descriptor.journal.journalId !== journal.checkpoint.journalId || prior.descriptor.journal.sequence > journal.checkpoint.sequence) fail();
        // publish() comprobará monotonía completa; preflight evita iniciar backup ante forks visibles.
        if (prior.descriptor.inventory.sequence === inventory.sequence && !same(prior.state, inventory)) fail();
        if (prior.descriptor.journal.sequence === journal.checkpoint.sequence && prior.descriptor.journal.head !== journal.checkpoint.head) fail();
        if (prior.bytes[3].toString() !== (await privateFile(path.join(this.config.journalConfig.journalDirectory, 'genesis.json'))).bytes.toString() || !(await privateFile(path.join(this.config.journalConfig.journalDirectory, 'entries.jsonl'), 16 * 1024 * 1024)).bytes.subarray(0, prior.bytes[4].length).equals(prior.bytes[4])) fail();
        for (const old of prior.state.records) {
          const r = inventory.records.find(r => r.backupId === old.backupId);
          if (!r || !same({ ...r, status: undefined, deletion: undefined }, { ...old, status: undefined, deletion: undefined }) || (old.status === 'retired' && !same(old, r)) || (old.status === 'deleting' && (r.status === 'active' || !same(old.deletion, r.deletion)))) fail();
        }
      }
      return { storeId: c.storeMarker.storeId, anchorId: c.anchorMarker.anchorId };
    });
    const bindings = { repositoryId: inventory.repositoryId, transferId: transfer.transferId, ...custody, journalId: journal.checkpoint.journalId, coverageStartsAt: journal.checkpoint.coverageStartsAt };
    if (this.marker && !same(bindings, this.marker.bindings)) fail();
    return { bindings, inventory, objects: transfer.objects };
  }
  async lock() {
    if (this.lockIdentity) fail();
    await this.directoryGuard();
    this.directoryIdentities = Object.fromEntries(await Promise.all(Object.entries(this.settings.dirs).map(async ([name, dir]) => [name, identity(await lstat(dir))])));
    this.lockPath = path.join(this.settings.dirs.schedule, 'schedule.lock');
    await writeNew(this.lockPath, this.owner);
    this.lockIdentity = identity((await privateFile(this.lockPath, 100)).stat);
  }
  async guard() {
    if (!this.lockIdentity) fail();
    await this.directoryGuard();
    const lock = await privateFile(this.lockPath, 100);
    if (lock.bytes.toString() !== this.owner || !same(identity(lock.stat), this.lockIdentity)) fail();
    if (this.marker && !same(await decode(path.join(this.settings.dirs.schedule, '.inf03-schedule.json'), this.config.key), this.marker)) fail();
  }
  async close() {
    if (this.lockIdentity && !this.preserveLock) { await this.guard(); await unlink(this.lockPath); await syncDirectory(this.settings.dirs.schedule); this.lockIdentity = undefined; }
  }
  async open() {
    try {
      await this.lock();
      const m = await decode(path.join(this.settings.dirs.schedule, '.inf03-schedule.json'), this.config.key);
      shape(m, ['version', 'kind', 'scheduleId', 'directory', 'directoryIdentity', 'configSha256', 'bindings']);
      if (m.version !== 1 || m.kind !== 'inf03-schedule-local-simulated' || !UUID.test(m.scheduleId) || m.directory !== this.settings.dirs.schedule || !same(m.directoryIdentity, this.directoryIdentities.schedule) || m.configSha256 !== this.settings.configSha256) fail();
      this.marker = m; await this.authorities(); await this.ledger(); return this;
    } catch (error) { await this.close(); throw error; }
  }
  async ledger() {
    await this.guard(); const dir = this.settings.dirs.schedule;
    const names = await readdir(dir), cycles = new Map();
    if (names.length > MAX_CYCLES * 2 + 2) fail();
    for (const name of names) {
      if (['schedule.lock', '.inf03-schedule.json'].includes(name)) continue;
      const match = /^slot-(0|[1-9][0-9]{0,10})\.(intent|complete)\.json$/.exec(name); if (!match) fail();
      const slot = Number(match[1]), body = await decode(path.join(dir, name), this.config.key);
      const cycle = cycles.get(slot) ?? {};
      if (match[2] === 'intent') {
        shape(body, ['version', 'scheduleId', 'slot', 'intentId', 'startedAt', 'repositoryId', 'inventorySequence', 'filename']);
        if (body.version !== 1 || body.scheduleId !== this.marker.scheduleId || body.slot !== slot || !UUID.test(body.intentId) || body.repositoryId !== this.marker.bindings.repositoryId || !Number.isSafeInteger(body.inventorySequence) || body.inventorySequence < 0 || body.filename !== this.filename(slot)) fail();
        originalTime(body.startedAt, this.now());
      } else {
        shape(body, ['version', 'scheduleId', 'slot', 'intentId', 'backupId', 'originalCreatedAt', 'remotePublished', 'completedAt']);
        if (body.version !== 1 || body.scheduleId !== this.marker.scheduleId || body.slot !== slot || !UUID.test(body.intentId) || !UUID.test(body.backupId) || typeof body.remotePublished !== 'boolean') fail();
        originalTime(body.completedAt, this.now()); originalTime(body.originalCreatedAt, this.now());
      }
      cycle[match[2]] = body; cycles.set(slot, cycle);
    }
    const pending = [];
    for (const [slot, c] of cycles) { if (!c.intent || (c.complete && c.complete.intentId !== c.intent.intentId)) fail(); if (!c.complete) pending.push(slot); }
    if (pending.length > 1 || cycles.size > MAX_CYCLES) fail();
    return { cycles, pendingSlot: pending[0] ?? null, completedSlots: [...cycles].filter(([, c]) => c.complete).map(([slot]) => slot) };
  }
  filename(slot) { return `cycle-${this.marker.scheduleId}-${slot}.age`; }
  async plan() {
    await this.guard(); const a = await this.authorities(), ledger = await this.ledger();
    const calendar = planCalendar({ ...this.config, now: this.now(), ...ledger });
    for (const c of ledger.cycles.values()) {
      const r = a.inventory.records.find(r => r.filename === c.intent.filename);
      if (c.complete && (!r || r.backupId !== c.complete.backupId || r.originalCreatedAt !== c.complete.originalCreatedAt)) fail();
      if (c.complete) {
        const remote = a.objects.find(o => o.descriptor.backupId === r.backupId);
        if (c.complete.remotePublished && !remote) fail();
        if (!c.complete.remotePublished && (r.status !== 'retired' || !expired(r.originalCreatedAt, this.now()))) fail();
      }
      if (r && (a.inventory.sequence <= c.intent.inventorySequence || Date.parse(r.originalCreatedAt) < Date.parse(c.intent.startedAt))) fail();
    }
    return { mode: 'local-simulated', dryRun: true, ...calendar, localExpired: a.inventory.records.filter(r => r.status !== 'retired' && expired(r.originalCreatedAt, this.now())).length, remoteExpired: a.objects.filter(o => !o.completed && expired(o.descriptor.originalCreatedAt, this.now())).length, restoreEligible: false };
  }
  async cycle({ apply = false, backup, deadlineMs = 600_000 } = {}) {
    const plan = await this.plan(); if (!apply) return plan;
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 600_000 || (plan.due && typeof backup !== 'function')) fail();
    // El deadline real sigue avanzando aunque el calendario use un reloj de fixture.
    const end = Date.now() + deadlineMs;
    const gate = async () => { await this.guard(); if (Date.now() >= end) fail(); };
    await gate(); let record;
    if (plan.due) {
      const ledger = await this.ledger(); let intent = ledger.cycles.get(plan.slot)?.intent;
      const fresh = !intent;
      if (fresh) {
        if (ledger.cycles.size >= MAX_CYCLES) fail();
        const authority = await this.authorities();
        intent = { version: 1, scheduleId: this.marker.scheduleId, slot: plan.slot, intentId: randomUUID(), startedAt: new Date(this.now()).toISOString(), repositoryId: authority.inventory.repositoryId, inventorySequence: authority.inventory.sequence, filename: this.filename(plan.slot) };
        const output = path.join(this.settings.dirs.repository, intent.filename);
        for (const file of [output, output + '.receipt.json']) { try { await lstat(file); fail(); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
        await gate(); await writeNew(path.join(this.settings.dirs.schedule, `slot-${plan.slot}.intent.json`), encoded(this.config.key, intent));
        await gate();
        // Si el callback falla, el intent permanece; no hay retry automático aunque el registro aparezca.
        try { await backup({ output, deadlineMs: Math.max(1, end - Date.now()) }); }
        catch (error) { if (error?.unsettledProcessGroup === true) this.preserveLock = true; throw error; }
      }
      await gate();
      const authority = await this.authorities();
      record = authority.inventory.records.find(r => r.filename === intent.filename);
      if (!record || authority.inventory.sequence <= intent.inventorySequence || Date.parse(record.originalCreatedAt) < Date.parse(intent.startedAt)) fail();
      if (record.status === 'active' && !expired(record.originalCreatedAt, this.now())) {
        await this.withResource(this.inventory(), async inventory => {
          await gate(); const input = path.join(this.settings.dirs.repository, record.filename), receiptPath = input + '.receipt.json';
          const receipt = await readTransferReceipt(receiptPath);
          await this.withResource(this.transfer(), async transfer => { await gate(); await transfer.upload({ input, receiptPath, receipt, inventory }); });
        });
      }
    }
    await gate(); const local = await this.withResource(this.inventory(), async i => { await gate(); return i.prune({ apply: true }); });
    await gate(); const remote = await this.withResource(this.transfer(), async t => { await gate(); return t.retire({ apply: true, role: 'retire' }); });
    await gate(); await this.withResource(this.custody(), async c => { await gate(); await c.publish(); await gate(); await c.verify(); });
    await gate(); await this.plan(); const finalAuthority = await this.authorities();
    if (plan.due) {
      const ledger = await this.ledger(), intent = ledger.cycles.get(plan.slot).intent;
      const actual = finalAuthority.inventory.records.find(r => r.backupId === record.backupId);
      const remotePublished = finalAuthority.objects.some(o => o.descriptor.backupId === record.backupId);
      if (!actual || (!remotePublished && (actual.status !== 'retired' || !expired(actual.originalCreatedAt, this.now())))) fail();
      const complete = { version: 1, scheduleId: this.marker.scheduleId, slot: plan.slot, intentId: intent.intentId, backupId: record.backupId, originalCreatedAt: record.originalCreatedAt, remotePublished, completedAt: new Date(this.now()).toISOString() };
      await writeNew(path.join(this.settings.dirs.schedule, `slot-${plan.slot}.complete.json`), encoded(this.config.key, complete));
    }
    await gate(); await this.plan(); await gate();
    return { mode: 'local-simulated', dryRun: false, completed: true, backupCreated: plan.due && !plan.resumed, reconciled: plan.resumed, localRetired: local.retired.length, remoteRetired: remote.retired.length, nextDueAt: plan.nextDueAt, restoreEligible: false };
  }
}

/** Provisión explícita del calendario; no crea ni recupera autoridades faltantes. */
export async function initializeSchedule(config) {
  const scheduler = new LocalSimulatedSchedule(config);
  try {
    await scheduler.lock();
    if ((await readdir(scheduler.settings.dirs.schedule)).some(n => n !== 'schedule.lock')) fail();
    const { bindings } = await scheduler.authorities(); await scheduler.guard();
    const marker = { version: 1, kind: 'inf03-schedule-local-simulated', scheduleId: randomUUID(), directory: scheduler.settings.dirs.schedule, directoryIdentity: scheduler.directoryIdentities.schedule, configSha256: scheduler.settings.configSha256, bindings };
    await writeNew(path.join(scheduler.settings.dirs.schedule, '.inf03-schedule.json'), encoded(config.key, marker));
    return { mode: 'local-simulated', initialized: true, restoreEligible: false };
  } finally { await scheduler.close(); }
}
