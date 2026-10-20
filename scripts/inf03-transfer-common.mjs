import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BackupInventory, expired, originalTime, syncDirectory } from './inf03-inventory-common.mjs';

export const TRANSFER_CIPHERTEXT_MAX = 128 * 1024 * 1024;
export const TRANSFER_RECEIPT_MAX = 64 * 1024;
const fail = () => { throw new Error('INF03_TRANSFER_UNVERIFIED'); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_OBJECTS = 1000;
const HEX = /^[0-9a-f]{64}$/;
const digest = (data) => createHash('sha256').update(data).digest('hex');
const mac = (key, body) => createHmac('sha256', key).update(JSON.stringify(body)).digest('hex');
const signed = (key, body) => `${JSON.stringify({ body, mac: mac(key, body) })}\n`;
const keys = (obj, expected) => { if (!obj || typeof obj !== 'object' || Array.isArray(obj) || JSON.stringify(Object.keys(obj).sort()) !== JSON.stringify([...expected].sort())) fail(); };
const canonical = (input) => {
  if (!path.isAbsolute(input ?? '')) fail();
  const resolved = path.resolve(input);
  return process.platform === 'darwin' ? resolved.replace(/^\/tmp(?=\/|$)/, '/private/tmp').replace(/^\/var(?=\/|$)/, '/private/var') : resolved;
};
export async function transferDirectory(input) {
  const dir = canonical(input); let cursor = path.parse(dir).root;
  for (const part of dir.slice(cursor.length).split('/').filter(Boolean)) { cursor = path.join(cursor, part); const st = await lstat(cursor); if (!st.isDirectory() || st.isSymbolicLink()) fail(); }
  const st = await lstat(dir);
  if (st.uid !== process.getuid?.() || (st.mode & 0o777) !== 0o700 || await realpath(dir) !== dir) fail();
  return dir;
}
async function readOwn(file, max) {
  const h = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const a = await h.stat();
    if (!a.isFile() || a.uid !== process.getuid?.() || a.nlink !== 1 || (a.mode & 0o777) !== 0o600 || a.size > max) fail();
    const b = Buffer.alloc(a.size); let offset = 0;
    while (offset < b.length) { const { bytesRead } = await h.read(b, offset, b.length - offset, offset); if (!bytesRead) fail(); offset += bytesRead; }
    const z = await h.stat(); if (z.size !== a.size || z.mtimeMs !== a.mtimeMs || z.ctimeMs !== a.ctimeMs || z.nlink !== 1) fail();
    return { bytes: b, stat: a };
  } finally { await h.close(); }
}
async function writeNew(file, bytes) {
  const h = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
  await syncDirectory(path.dirname(file));
}
async function copyOwn(source, target, max) {
  const input = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  let output;
  try {
    output = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const before = await input.stat();
    if (!before.isFile() || before.uid !== process.getuid?.() || before.nlink !== 1 || (before.mode & 0o777) !== 0o600 || before.size < 1 || before.size > max) fail();
    const buffer = Buffer.alloc(64 * 1024); let offset = 0; const hash = createHash('sha256');
    while (true) { const { bytesRead } = await input.read(buffer, 0, buffer.length, offset); if (!bytesRead) break; offset += bytesRead; if (offset > max) fail(); const part = buffer.subarray(0, bytesRead); hash.update(part); let written = 0; while (written < part.length) { const result = await output.write(part, written, part.length - written); if (!result.bytesWritten) fail(); written += result.bytesWritten; } }
    const after = await input.stat(); if (offset !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || after.nlink !== 1) fail();
    await output.sync();
    const copied = await output.stat(); if (!copied.isFile() || copied.uid !== process.getuid?.() || copied.nlink !== 1 || copied.size !== offset || (copied.mode & 0o777) !== 0o600) fail();
    return { bytes: offset, sha256: hash.digest('hex') };
  } finally { try { if (output) await output.close(); } finally { await input.close(); } }
}
function decode(text, key, shape) {
  const wrapped = JSON.parse(text); keys(wrapped, ['body', 'mac']); keys(wrapped.body, shape);
  if (typeof wrapped.mac !== 'string' || !HEX.test(wrapped.mac) || !timingSafeEqual(Buffer.from(wrapped.mac, 'hex'), Buffer.from(mac(key, wrapped.body), 'hex')) || signed(key, wrapped.body) !== text) fail();
  return wrapped.body;
}
async function writeSigned(file, key, body) { await writeNew(file, signed(key, body)); }
async function assertAbsent(file) { try { await lstat(file); fail(); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
function safePair(dirs) {
  const values = Object.values(dirs);
  if (values.some((a, i) => values.some((b, j) => i !== j && (a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep))))) fail();
}

export async function initializeTransfer({ objects, key, repository, inventory, checkpoint }) {
  if (typeof key !== 'string' || Buffer.byteLength(key) < 32) fail();
  const dirs = { objects: await transferDirectory(objects), repository: await transferDirectory(repository), inventory: await transferDirectory(inventory), checkpoint: await transferDirectory(checkpoint) };
  safePair(dirs);
  if ((await readdir(dirs.objects)).length) fail();
  const body = { version: 1, transferId: randomUUID(), objects: dirs.objects, createdAt: new Date().toISOString(), platform: `${os.platform()}-${os.arch()}` };
  await writeSigned(path.join(dirs.objects, '.inf03-transfer.json'), key, body);
  return body.transferId;
}

export class LocalSimulatedTransfer {
  constructor({ objects, key, inventoryConfig, clock = Date.now }) { this.input = objects; this.key = key; this.inventoryConfig = inventoryConfig; this.now = clock; this.owner = randomUUID(); this.locks = []; }
  async open() {
    if (this.objects || this.locks.length) fail();
    if (typeof this.key !== 'string' || Buffer.byteLength(this.key) < 32) fail();
    this.objects = await transferDirectory(this.input);
    const objectRoot = await lstat(this.objects); this.rootIdentity = {dev:objectRoot.dev,ino:objectRoot.ino};
    if (this.inventoryConfig) {
      const originals = { objects: this.objects, repository: await transferDirectory(this.inventoryConfig.repository), inventory: await transferDirectory(this.inventoryConfig.inventory), checkpoint: await transferDirectory(this.inventoryConfig.checkpoint) };
      safePair(originals);
    }
    const marker = decode((await readOwn(path.join(this.objects, '.inf03-transfer.json'), TRANSFER_RECEIPT_MAX)).bytes.toString(), this.key, ['version', 'transferId', 'objects', 'createdAt', 'platform']);
    if (marker.version !== 1 || !UUID.test(marker.transferId) || marker.objects !== this.objects || !marker.platform) fail(); originalTime(marker.createdAt, this.now()); this.transferId = marker.transferId;
    const entries = await readdir(this.objects); if (entries.length > MAX_OBJECTS + 2) fail();
    for (const name of entries) {
      if (name === '.inf03-transfer.json' || name === 'transfer.lock') continue;
      if (!UUID.test(name)) fail();
      const child = await lstat(path.join(this.objects, name));
      if (!child.isDirectory() || child.isSymbolicLink() || child.uid !== process.getuid?.() || (child.mode & 0o777) !== 0o700) fail();
    }
    this.lock = path.join(this.objects, 'transfer.lock'); await writeNew(this.lock, this.owner); const lock = await lstat(this.lock); this.lockIdentity = { dev: lock.dev, ino: lock.ino }; this.locks.push(this.lock); return this;
  }
  async close() { for (const file of this.locks.splice(0)) { await this.guard(); await unlink(file); await syncDirectory(this.objects); } this.objects=undefined; }
  async guard() { if(!this.objects) fail();const dir=await transferDirectory(this.input);const st=await lstat(dir);if(dir!==this.objects||st.dev!==this.rootIdentity.dev||st.ino!==this.rootIdentity.ino)fail(); const value = await readOwn(this.lock, 100); if (!this.objects || value.bytes.toString() !== this.owner || value.stat.dev !== this.lockIdentity.dev || value.stat.ino !== this.lockIdentity.ino) fail(); }
  directory(id) { if (!UUID.test(id)) fail(); return path.join(this.objects, id); }
  async descriptor(id) {
    const dir = await transferDirectory(this.directory(id)), file = await readOwn(path.join(dir, 'descriptor.json'), TRANSFER_RECEIPT_MAX);
    const body = decode(file.bytes.toString(), this.key, ['version', 'transferId', 'backupId', 'originalCreatedAt', 'ciphertextBytes', 'ciphertextSha256', 'receiptBytes', 'receiptSha256']);
    if (body.version !== 1 || body.transferId !== this.transferId || body.backupId !== id || !Number.isSafeInteger(body.ciphertextBytes) || body.ciphertextBytes < 1 || body.ciphertextBytes > TRANSFER_CIPHERTEXT_MAX || !HEX.test(body.ciphertextSha256) || !Number.isSafeInteger(body.receiptBytes) || body.receiptBytes < 1 || body.receiptBytes > TRANSFER_RECEIPT_MAX || !HEX.test(body.receiptSha256)) fail();
    originalTime(body.originalCreatedAt, this.now()); return body;
  }
  async verifyObject(id) {
    const d = await this.descriptor(id), dir = this.directory(id);
    const directory = await lstat(dir); if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== process.getuid?.() || (directory.mode & 0o777) !== 0o700 || await realpath(dir) !== dir) fail();
    if ((await readdir(dir)).some((name) => !['ciphertext.age', 'receipt.json', 'descriptor.json', 'retired.json'].includes(name))) fail();
    const tombstonePath = path.join(dir, 'retired.json');
    let retired = false, tomb;
    try {
      tomb = decode((await readOwn(tombstonePath, TRANSFER_RECEIPT_MAX)).bytes.toString(), this.key, ['version','backupId','originalCreatedAt','intentId','authorizedAt','status','cipherIdentity','receiptIdentity']);
      if(tomb.version!==1||tomb.backupId!==id||tomb.originalCreatedAt!==d.originalCreatedAt||!UUID.test(tomb.intentId)||!['deleting','retired'].includes(tomb.status)||!expired(d.originalCreatedAt,originalTime(tomb.authorizedAt,this.now())))fail();
      for(const identity of [tomb.cipherIdentity,tomb.receiptIdentity]){keys(identity,['dev','ino','ctimeMs']);if(!Number.isSafeInteger(identity.dev)||!Number.isSafeInteger(identity.ino)||identity.dev<0||identity.ino<0||!Number.isFinite(identity.ctimeMs)||identity.ctimeMs<0)fail();}
      retired=true;
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const cipherPath = path.join(dir, 'ciphertext.age'), receiptPath = path.join(dir, 'receipt.json');
    for (const [file, max, size, hash] of [[cipherPath, TRANSFER_CIPHERTEXT_MAX, d.ciphertextBytes, d.ciphertextSha256], [receiptPath, TRANSFER_RECEIPT_MAX, d.receiptBytes, d.receiptSha256]]) {
      try { const value = await readOwn(file, max); if (value.bytes.length !== size || digest(value.bytes) !== hash) fail(); if(tomb){const identity=file===cipherPath?tomb.cipherIdentity:tomb.receiptIdentity;if(tomb.status==='retired'||value.stat.dev!==identity.dev||value.stat.ino!==identity.ino||value.stat.ctimeMs!==identity.ctimeMs)fail();} }
      catch (error) { if (!retired || error.code !== 'ENOENT') throw error; }
    }
    return { descriptor:d,retired,tomb,completed:tomb?.status==='retired' };
  }
  async upload({ input, receiptPath, receipt, manifest, inventory }) {
    await this.guard();
    const sourceRecord = await inventory.admitRestore(input, receiptPath, receipt, manifest);
    const original = sourceRecord.originalCreatedAt;if(expired(original,this.now()))fail();
    if (manifest && (manifest.backupId !== sourceRecord.backupId || originalTime(original, this.now()) !== originalTime(manifest.createdAt, this.now()))) fail();
    const id = sourceRecord.backupId, dir = this.directory(id);
    try {
      const prior = await this.verifyObject(id); const d = prior.descriptor;
      if (prior.retired || d.originalCreatedAt !== original || d.ciphertextBytes !== sourceRecord.ciphertextBytes || d.ciphertextSha256 !== sourceRecord.ciphertextSha256 || d.receiptSha256 !== sourceRecord.receiptSha256) fail();
      await inventory.admitRestore(input, receiptPath, receipt, manifest); await this.guard();if(expired(original,this.now()))fail(); return { originalCreatedAt:original, backupId: id, idempotent: true, ciphertextBytes: d.ciphertextBytes, ciphertextSha256: d.ciphertextSha256 };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if((await readdir(this.objects)).filter(n=>UUID.test(n)).length>=MAX_OBJECTS)fail();await this.guard();
    await mkdir(dir, { mode: 0o700 }); await syncDirectory(this.objects);
    try {
      const c = await copyOwn(input, path.join(dir, 'ciphertext.age'), TRANSFER_CIPHERTEXT_MAX);
      const r = await copyOwn(receiptPath, path.join(dir, 'receipt.json'), TRANSFER_RECEIPT_MAX);
      await syncDirectory(dir);
      await inventory.admitRestore(input, receiptPath, receipt, manifest);
      if (originalTime(original, this.now()) !== originalTime(sourceRecord.originalCreatedAt, this.now())) fail();
      if (c.bytes !== sourceRecord.ciphertextBytes || c.sha256 !== sourceRecord.ciphertextSha256 || r.sha256 !== sourceRecord.receiptSha256) fail();
      const descriptor = { version: 1, transferId: this.transferId, backupId: id, originalCreatedAt: original, ciphertextBytes: c.bytes, ciphertextSha256: c.sha256, receiptBytes: r.bytes, receiptSha256: r.sha256 };
      await this.guard();if(expired(original,this.now()))fail();await transferDirectory(dir);
      await writeSigned(path.join(dir, 'descriptor.json'), this.key, descriptor); await syncDirectory(dir);
      const verified = await this.verifyObject(id); if (verified.retired || JSON.stringify(verified.descriptor) !== JSON.stringify(descriptor)) fail();
      await inventory.admitRestore(input, receiptPath, receipt, manifest); await this.guard();
      if(expired(original,this.now()))fail();return { originalCreatedAt:original, backupId: id, idempotent: false, ciphertextBytes: c.bytes, ciphertextSha256: c.sha256 };
    } catch (error) { throw error; }
  }
  async download({ backupId, destination, inventory }) {
    await this.guard(); const checked = await this.verifyObject(backupId); if (checked.retired) fail();
    const inv = await inventory.refresh(); const record = inv.records.find((r) => r.backupId === backupId);
    if (!record || record.status !== 'active' || expired(record.originalCreatedAt, this.now())) fail();
    const d = checked.descriptor;
    if (record.originalCreatedAt !== d.originalCreatedAt || record.ciphertextBytes !== d.ciphertextBytes || record.ciphertextSha256 !== d.ciphertextSha256 || record.receiptSha256 !== d.receiptSha256) fail();
    const target = canonical(destination),parent=await transferDirectory(path.dirname(target)),parentIdentity=await lstat(parent);
    const protectedDirs = { objects: this.objects, repository: await transferDirectory(this.inventoryConfig.repository), inventory: await transferDirectory(this.inventoryConfig.inventory), checkpoint: await transferDirectory(this.inventoryConfig.checkpoint) };
    safePair(protectedDirs);
    if (Object.values(protectedDirs).some((dir) => target === dir || target.startsWith(dir + path.sep) || dir.startsWith(target + path.sep))) fail();
    await mkdir(target, { mode: 0o700 }); const st = await lstat(target); if (!st.isDirectory() || st.uid !== process.getuid?.() || (st.mode & 0o777) !== 0o700) fail();
    await syncDirectory(parent);
    const assertTarget=async()=>{await this.guard();await transferDirectory(parent);await transferDirectory(target);const p=await lstat(parent),d=await lstat(target);if(p.dev!==parentIdentity.dev||p.ino!==parentIdentity.ino||d.dev!==st.dev||d.ino!==st.ino)fail();};
    await assertTarget();
    const source = this.directory(backupId); const c = await copyOwn(path.join(source, 'ciphertext.age'), path.join(target, 'ciphertext.age'), TRANSFER_CIPHERTEXT_MAX);
    const r = await copyOwn(path.join(source, 'receipt.json'), path.join(target, 'receipt.json'), TRANSFER_RECEIPT_MAX);
    const descriptor = signed(this.key, d); await writeNew(path.join(target, 'descriptor.json'), descriptor); await syncDirectory(target);
    const copiedCipher = await readOwn(path.join(target, 'ciphertext.age'), TRANSFER_CIPHERTEXT_MAX), copiedReceipt = await readOwn(path.join(target, 'receipt.json'), TRANSFER_RECEIPT_MAX), copiedDescriptor = (await readOwn(path.join(target, 'descriptor.json'), TRANSFER_RECEIPT_MAX)).bytes.toString();
    if (digest(copiedCipher.bytes) !== d.ciphertextSha256 || digest(copiedReceipt.bytes) !== d.receiptSha256 || copiedDescriptor !== descriptor) fail();
    const finalInventory=await inventory.refresh(),finalRecord=finalInventory.records.find(r=>r.backupId===backupId);if(!finalRecord||finalRecord.status!=='active'||finalRecord.originalCreatedAt!==record.originalCreatedAt||finalRecord.ciphertextSha256!==record.ciphertextSha256||finalRecord.receiptSha256!==record.receiptSha256||expired(record.originalCreatedAt,this.now()))fail();await assertTarget(); const again = await this.verifyObject(backupId); if (again.retired || JSON.stringify(again.descriptor) !== JSON.stringify(d) || c.sha256 !== record.ciphertextSha256 || r.sha256 !== record.receiptSha256 || originalTime(record.originalCreatedAt, this.now()) !== originalTime(d.originalCreatedAt, this.now())) fail();
    await assertTarget();if(expired(record.originalCreatedAt,this.now()))fail();return { originalCreatedAt:record.originalCreatedAt,backupId,downloaded:true,quarantine:target,restoreEligible:false };
  }
  async retire({apply=false,role,afterUnlink}) {
    await this.guard();if(role!=='retire')fail();const entries=(await readdir(this.objects)).filter(n=>UUID.test(n)).sort();if(entries.length>MAX_OBJECTS)fail();const candidates=[];
    for(const id of entries){const state=await this.verifyObject(id);if(!state.completed&&expired(state.descriptor.originalCreatedAt,this.now()))candidates.push(state);}
    if(!apply)return {dryRun:true,expired:candidates.map(({descriptor:d,retired})=>({backupId:d.backupId,originalCreatedAt:d.originalCreatedAt,retired}))};
    const retired=[];
    for(const {descriptor:d,retired:already} of candidates){
      await this.guard();const dir=await transferDirectory(this.directory(d.backupId)),file=path.join(dir,'retired.json');
      if(!already){
        const c=await readOwn(path.join(dir,'ciphertext.age'),TRANSFER_CIPHERTEXT_MAX),r=await readOwn(path.join(dir,'receipt.json'),TRANSFER_RECEIPT_MAX);
        if(digest(c.bytes)!==d.ciphertextSha256||digest(r.bytes)!==d.receiptSha256||!expired(d.originalCreatedAt,this.now()))fail();await this.guard();
        const identity=s=>({dev:s.dev,ino:s.ino,ctimeMs:s.ctimeMs});
        const intent={version:1,backupId:d.backupId,originalCreatedAt:d.originalCreatedAt,intentId:randomUUID(),authorizedAt:new Date(this.now()).toISOString(),status:'deleting',cipherIdentity:identity(c.stat),receiptIdentity:identity(r.stat)};
        await writeSigned(file,this.key,intent);await syncDirectory(dir);
      }
      const current=await this.verifyObject(d.backupId);if(!current.retired||current.descriptor.originalCreatedAt!==d.originalCreatedAt)fail();
      for(const name of ['ciphertext.age','receipt.json']){
        await this.guard();await transferDirectory(dir);const f=path.join(dir,name),max=name==='receipt.json'?TRANSFER_RECEIPT_MAX:TRANSFER_CIPHERTEXT_MAX,expected=name==='receipt.json'?d.receiptSha256:d.ciphertextSha256,identity=name==='receipt.json'?current.tomb.receiptIdentity:current.tomb.cipherIdentity;
        try {
          const value=await readOwn(f,max);if(digest(value.bytes)!==expected||value.stat.dev!==identity.dev||value.stat.ino!==identity.ino||value.stat.ctimeMs!==identity.ctimeMs)fail();
          await this.guard();const actual=await lstat(f);if(actual.isSymbolicLink()||actual.nlink!==1||actual.dev!==value.stat.dev||actual.ino!==value.stat.ino||actual.ctimeMs!==value.stat.ctimeMs||actual.size!==value.stat.size)fail();
          await unlink(f);await syncDirectory(dir);if(afterUnlink)await afterUnlink({backupId:d.backupId,file:name});
        }catch(error){if(error.code!=='ENOENT')throw error;}
      }
      await this.guard();await this.verifyObject(d.backupId);await assertAbsent(path.join(dir,'ciphertext.age'));await assertAbsent(path.join(dir,'receipt.json'));
      const temp=path.join(dir,'.retire-'+randomUUID()+'.partial');await writeSigned(temp,this.key,{...current.tomb,status:'retired'});await this.guard();await rename(temp,file);await syncDirectory(dir);await this.verifyObject(d.backupId);retired.push(d.backupId);
    }
    await this.guard();return {dryRun:false,retired};
  }
}

export async function openInventory(args, env = process.env) {
  const value = (flag) => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
  const config = { repository: value('--repository'), inventory: value('--inventory'), checkpoint: value('--inventory-checkpoint'), key: env.INF03_INVENTORY_HMAC_KEY };
  const instance = await new BackupInventory(config).open();
  return { instance, config };
}

export async function readTransferReceipt(file) {
  const bytes = (await readOwn(canonical(file), TRANSFER_RECEIPT_MAX)).bytes;
  const value = JSON.parse(bytes.toString('utf8'));
  return value;
}
