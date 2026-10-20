import { constants } from 'node:fs';
import { open, lstat, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export interface SuppressionCheckpoint {
  version: 1; journalId: string; coverageStartsAt: string; sequence: number; head: string; mac: string;
}
export interface SuppressionEntry { sequence: number; userId: string; acceptedAt: string; previous: string; mac: string }
export interface SuppressionSnapshot { checkpoint: SuppressionCheckpoint; entries: readonly SuppressionEntry[] }
export interface SuppressionJournal {
  open(): Promise<void>; close(): Promise<void>; snapshot(): Promise<SuppressionSnapshot>; accept(userId: string): Promise<void>;
}
export const SUPPRESSION_JOURNAL = Symbol('SUPPRESSION_JOURNAL');
export interface LocalJournalConfig { journalDirectory: string; checkpointDirectory: string; hmacKey: string }
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 100_000;
const ZERO = '0'.repeat(64);
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const HEX = /^[a-f0-9]{64}$/;
function fail(): never { throw new Error('SUPPRESSION_REGISTRY_UNVERIFIED'); }
function iso(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function sign(key: string, value: object): string { return createHmac('sha256', key).update(JSON.stringify(value)).digest('hex'); }
function equal(left: string, right: string): boolean { return HEX.test(left) && HEX.test(right) && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex')); }
function checkpointBody(c: SuppressionCheckpoint) { return { version: c.version, journalId: c.journalId, coverageStartsAt: c.coverageStartsAt, sequence: c.sequence, head: c.head }; }
function entryBody(e: SuppressionEntry) { return { sequence: e.sequence, userId: e.userId, acceptedAt: e.acceptedAt, previous: e.previous }; }
function decodeCheckpoint(text: string, key: string): SuppressionCheckpoint {
  const c = JSON.parse(text) as SuppressionCheckpoint;
  if (!c || c.version !== 1 || (typeof c.journalId !== 'string' || !ID.test(c.journalId)) || !iso(c.coverageStartsAt) || !Number.isSafeInteger(c.sequence) || c.sequence < 0 || c.sequence > MAX_ENTRIES || !HEX.test(c.head) || !equal(c.mac, sign(key, checkpointBody(c))) || text !== JSON.stringify({ ...checkpointBody(c), mac: c.mac }) + '\n') fail();
  return c;
}
async function secureDirectory(input: string): Promise<string> {
  if (!isAbsolute(input)) fail();
  const path = resolve(input);
  let current = parse(path).root;
  for (const part of path.slice(current.length).split('/').filter(Boolean)) {
    current = join(current, part);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
  }
  const stat = await lstat(path);
  if ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.() || await realpath(path) !== path) fail();
  return path;
}
async function readPrivate(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.() || stat.size > MAX_BYTES) fail();
    const content = await handle.readFile('utf8');
    if (Buffer.byteLength(content) > MAX_BYTES) fail();
    return content;
  } finally { await handle.close(); }
}
async function syncDirectory(path: string): Promise<void> { const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY); try { await handle.sync(); } finally { await handle.close(); } }
async function writeNew(path: string, value: string): Promise<void> {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(dirname(path));
}
async function directories(config: LocalJournalConfig) {
  if (config.hmacKey.length < 32) fail();
  const journal = await secureDirectory(config.journalDirectory);
  const checkpoint = await secureDirectory(config.checkpointDirectory);
  if (journal === checkpoint || journal.startsWith(checkpoint + '/') || checkpoint.startsWith(journal + '/')) fail();
  return { journal, checkpoint };
}
/** Sólo provisión explícita: un arranque jamás crea/repara un registro ausente. */
export async function initializeLocalSuppressionJournal(config: LocalJournalConfig, coverageStartsAt: string): Promise<SuppressionCheckpoint> {
  if (!iso(coverageStartsAt) || Date.parse(coverageStartsAt) > Date.now()) fail();
  const dirs = await directories(config);
  const body = { version: 1 as const, journalId: randomUUID(), coverageStartsAt, sequence: 0, head: ZERO };
  const checkpoint = { ...body, mac: sign(config.hmacKey, body) };
  // Si interrumpe, queda incompleto y falla cerrado; no permite reinicializar encima.
  await writeNew(join(dirs.journal, 'genesis.json'), JSON.stringify(checkpoint) + '\n');
  await writeNew(join(dirs.journal, 'entries.jsonl'), '');
  await writeNew(join(dirs.checkpoint, 'checkpoint.json'), JSON.stringify(checkpoint) + '\n');
  return checkpoint;
}

export class LocalSuppressionJournal implements SuppressionJournal {
  private queue: Promise<unknown> = Promise.resolve();
  private locked: string[] = [];
  private readonly owner = randomUUID();
  private dirs?: { journal: string; checkpoint: string };
  private poisoned = false;
  constructor(private readonly config: LocalJournalConfig) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work); this.queue = result.catch(() => undefined); return result;
  }
  open(): Promise<void> { return this.serial(async () => {
    if (this.dirs || this.poisoned) fail();
    const dirs = await directories(this.config);
    try {
      for (const dir of [dirs.journal, dirs.checkpoint].sort()) {
        const path = join(dir, 'writer.lock'); await writeNew(path, this.owner); this.locked.push(path);
      }
      this.dirs = dirs; await this.readSnapshot();
    } catch (error) { this.poisoned = true; await this.release(); throw error; }
  }); }
  close(): Promise<void> { return this.serial(async () => { await this.release(); this.dirs = undefined; }); }
  private async release(): Promise<void> {
    for (const path of this.locked.splice(0)) {
      if (await readPrivate(path) !== this.owner) fail();
      await unlink(path); await syncDirectory(dirname(path));
    }
  }
  snapshot(): Promise<SuppressionSnapshot> { return this.serial(async () => {
    try { return await this.readSnapshot(); } catch (error) { this.poisoned = true; throw error; }
  }); }
  private async readSnapshot(): Promise<SuppressionSnapshot> {
    if (!this.dirs || this.poisoned) fail();
    for (const lock of this.locked) if (await readPrivate(lock) !== this.owner) fail();
    await directories(this.config);
    const genesis = decodeCheckpoint(await readPrivate(join(this.dirs.journal, 'genesis.json')), this.config.hmacKey);
    const checkpoint = decodeCheckpoint(await readPrivate(join(this.dirs.checkpoint, 'checkpoint.json')), this.config.hmacKey);
    if (genesis.sequence !== 0 || genesis.head !== ZERO || checkpoint.journalId !== genesis.journalId || checkpoint.coverageStartsAt !== genesis.coverageStartsAt) fail();
    const text = await readPrivate(join(this.dirs.journal, 'entries.jsonl'));
    if (text && !text.endsWith('\n')) fail();
    const lines = text ? text.slice(0, -1).split('\n') : [];
    if (lines.length !== checkpoint.sequence) fail();
    let previous = ZERO;
    let previousTime = Date.parse(genesis.coverageStartsAt);
    const entries = lines.map((line, index) => {
      const e = JSON.parse(line) as SuppressionEntry;
      if (!e || e.sequence !== index + 1 || (typeof e.userId !== 'string' || !ID.test(e.userId)) || !iso(e.acceptedAt) || Date.parse(e.acceptedAt) < previousTime || e.previous !== previous || !equal(e.mac, sign(this.config.hmacKey, { journalId: genesis.journalId, ...entryBody(e) })) || line !== JSON.stringify({ ...entryBody(e), mac: e.mac })) fail();
      previous = e.mac; previousTime = Date.parse(e.acceptedAt); return e;
    });
    if (checkpoint.head !== previous) fail();
    return { checkpoint, entries };
  }
  accept(userId: string): Promise<void> { return this.serial(async () => {
    if (!ID.test(userId)) fail();
    try {
      const snapshot = await this.readSnapshot();
      if (snapshot.entries.some((entry) => entry.userId === userId)) return;
      if (snapshot.checkpoint.sequence >= MAX_ENTRIES) fail();
      const acceptedAt = new Date(Math.max(Date.now(), Date.parse(snapshot.entries.at(-1)?.acceptedAt ?? snapshot.checkpoint.coverageStartsAt))).toISOString();
      const body = { sequence: snapshot.checkpoint.sequence + 1, userId, acceptedAt, previous: snapshot.checkpoint.head };
      const entry = { ...body, mac: sign(this.config.hmacKey, { journalId: snapshot.checkpoint.journalId, ...body }) };
      const encoded = JSON.stringify(entry) + '\n';
      const path = join(this.dirs!.journal, 'entries.jsonl');
      const handle = await open(path, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
      try {
        const stat = await handle.stat(); if (stat.nlink !== 1 || !stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.() || stat.size + Buffer.byteLength(encoded) > MAX_BYTES) fail();
        await handle.writeFile(encoded); await handle.sync();
      } finally { await handle.close(); }
      const checkpoint = { ...checkpointBody(snapshot.checkpoint), sequence: entry.sequence, head: entry.mac };
      const temp = join(this.dirs!.checkpoint, `checkpoint-${randomUUID()}.tmp`);
      await writeNew(temp, JSON.stringify({ ...checkpoint, mac: sign(this.config.hmacKey, checkpoint) }) + '\n');
      await rename(temp, join(this.dirs!.checkpoint, 'checkpoint.json')); await syncDirectory(this.dirs!.checkpoint);
      await this.readSnapshot();
    } catch (error) { this.poisoned = true; throw error; }
  }); }
}
