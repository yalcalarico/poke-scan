import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { link, mkdir, readFile, rename, symlink, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture, backup } from './inf03-inventory-test-fixture.mjs';
import { initializeTransfer, LocalSimulatedTransfer } from './inf03-transfer-common.mjs';
import { RETENTION_MS } from './inf03-inventory-common.mjs';

async function setup(t) {
  const cleanups = [];
  const f = await fixture({ after: (fn) => cleanups.push(fn) }), objects = path.join(f.base, 'objects'), quarantineParent = path.join(f.base, 'quarantine-parent');
  await mkdir(objects, { mode: 0o700 }); await mkdir(quarantineParent, { mode: 0o700 });
  const key = randomBytes(32).toString('hex');
  await initializeTransfer({ ...f.config, objects, key });
  const transfer = await new LocalSimulatedTransfer({ objects, key, inventoryConfig: f.config }).open();
  t.after(async () => { try { await transfer.close(); } finally { for (const cleanup of cleanups) await cleanup(); } });
  return { f, objects, quarantineParent, key, transfer };
}

test('sube bytes, verifica integridad e idempotencia; descarga a cuarentena sin habilitar restore', async (t) => {
  const s = await setup(t), b = await backup(s.f, undefined, 'source.age', 'ciphertext-payload');
  const receiptPath = `${b.output}.receipt.json`, receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  const first = await s.transfer.upload({ input: b.output, receiptPath, receipt, inventory: s.f.inventory });
  assert.equal(first.idempotent, false);
  assert.equal((await s.transfer.upload({ input: b.output, receiptPath, receipt, inventory: s.f.inventory })).idempotent, true);
  const destination = path.join(s.quarantineParent, 'download');
  const result = await s.transfer.download({ backupId: b.record.backupId, destination, inventory: s.f.inventory });
  assert.equal(result.restoreEligible, false);
  assert.deepEqual(await readFile(path.join(destination, 'ciphertext.age')), await readFile(b.output));
  assert.deepEqual(await readFile(path.join(destination, 'receipt.json')), await readFile(receiptPath));
  assert.equal((await stat(destination)).mode & 0o777, 0o700);
  await assert.rejects(s.transfer.download({ backupId: b.record.backupId, destination, inventory: s.f.inventory }));
});

test('descriptor alterado bloquea descarga y colisión de subida', async (t) => {
  const s = await setup(t), b = await backup(s.f, undefined, 'source.age', 'payload');
  const receiptPath = `${b.output}.receipt.json`, receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  await s.transfer.upload({ input: b.output, receiptPath, receipt, inventory: s.f.inventory });
  const descriptor = path.join(s.objects, b.record.backupId, 'descriptor.json');
  await writeFile(descriptor, '{}\n', { mode: 0o600 });
  await assert.rejects(s.transfer.download({ backupId: b.record.backupId, destination: path.join(s.quarantineParent, 'tampered'), inventory: s.f.inventory }));
  await assert.rejects(s.transfer.upload({ input: b.output, receiptPath, receipt, inventory: s.f.inventory }));
});

test('falla cerrado si el checkpoint original fue alterado o hay hardlinks', async (t) => {
  const s = await setup(t), b = await backup(s.f, undefined, 'source.age', 'payload');
  const receiptPath = `${b.output}.receipt.json`, receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  await link(b.output, path.join(s.f.config.repository, 'unexpected-link.age'));
  await assert.rejects(s.transfer.upload({ input: b.output, receiptPath, receipt, inventory: s.f.inventory }));
  await unlink(path.join(s.f.config.repository, 'unexpected-link.age'));
  await writeFile(path.join(s.f.config.checkpoint, 'checkpoint.json'), '{}\n', { mode: 0o600 });
  await assert.rejects(s.transfer.upload({ input: b.output, receiptPath, receipt, inventory: s.f.inventory }));
});

test('el retiro exige vencimiento original, prepara tombstone durable y reanuda idempotentemente', async (t) => {
  const s = await setup(t), b = await backup(s.f, undefined, 'source.age', 'old ciphertext');
  const receiptPath = `${b.output}.receipt.json`, receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  await s.transfer.upload({ input: b.output, receiptPath, receipt, inventory: s.f.inventory });
  const future = Date.parse(b.record.originalCreatedAt) + RETENTION_MS + 1;
  s.transfer.now = () => future;
  const preview = await s.transfer.retire({ role: 'retire' }); assert.equal(preview.dryRun, true); assert.equal(preview.expired.length, 1);
  await assert.rejects(s.transfer.retire({ role: 'read', apply: true }));
  let interrupted = false;
  await assert.rejects(s.transfer.retire({ role: 'retire', apply: true, afterUnlink: async ({ file }) => { if (!interrupted && file === 'ciphertext.age') { interrupted = true; throw new Error('controlled interruption'); } } }));
  assert.equal(interrupted, true);
  const removed = await s.transfer.retire({ role: 'retire', apply: true }); assert.deepEqual(removed.retired, [b.record.backupId]);
  assert.deepEqual((await s.transfer.retire({ role: 'retire', apply: true })).retired, []);
  await assert.rejects(stat(path.join(s.objects, b.record.backupId, 'ciphertext.age')), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(s.objects, b.record.backupId, 'retired.json'), 'utf8').then(Boolean), true);
});

test('no adopta objetos parciales ni registra cuarentena cuando falta un componente', async (t) => {
  const s = await setup(t), b = await backup(s.f, undefined, 'source.age', 'payload');
  const receiptPath = `${b.output}.receipt.json`, receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  await mkdir(path.join(s.objects, b.record.backupId), { mode: 0o700 });
  await assert.rejects(s.transfer.upload({ input: b.output, receiptPath, receipt, inventory: s.f.inventory }));
  await assert.rejects(s.transfer.download({ backupId: b.record.backupId, destination: path.join(s.quarantineParent, 'partial'), inventory: s.f.inventory }));
  await assert.rejects(stat(path.join(s.quarantineParent, 'partial')));
});


test('vencimiento durante descarga nunca devuelve downloaded:true', async (t) => {
  const s = await setup(t), b = await backup(s.f);
  const receiptPath = b.output + '.receipt.json';const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  await s.transfer.upload({input:b.output,receiptPath,receipt,inventory:s.f.inventory});
  const refresh=s.f.inventory.refresh.bind(s.f.inventory);let calls=0;
  s.f.inventory.refresh=async()=>{const state=await refresh();if(++calls===2)s.transfer.now=()=>Date.parse(b.record.originalCreatedAt)+RETENTION_MS;return state;};
  await assert.rejects(s.transfer.download({backupId:b.record.backupId,destination:path.join(s.quarantineParent,'expires-during-copy'),inventory:s.f.inventory}));
});
test('sustitución idéntica de recibo durante retiro conserva el archivo nuevo', async (t) => {
  const s = await setup(t), b = await backup(s.f);const receiptPath=b.output+'.receipt.json';const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
  await s.transfer.upload({input:b.output,receiptPath,receipt,inventory:s.f.inventory});s.transfer.now=()=>Date.parse(b.record.originalCreatedAt)+RETENTION_MS;
  const target=path.join(s.objects,b.record.backupId,'receipt.json');const bytes=await readFile(target);
  await assert.rejects(s.transfer.retire({role:'retire',apply:true,afterUnlink:async({file})=>{if(file==='ciphertext.age'){await unlink(target);await writeFile(target,bytes,{mode:0o600,flag:'wx'});}}}));
  assert.deepEqual(await readFile(target),bytes);
});
test('cambio del directorio a symlink después de open bloquea mutaciones', async (t) => {
  const s=await setup(t),b=await backup(s.f);const receiptPath=b.output+'.receipt.json';const receipt=JSON.parse(await readFile(receiptPath,'utf8'));const moved=s.objects+'-moved';
  await rename(s.objects,moved);await symlink(moved,s.objects);
  try {await assert.rejects(s.transfer.upload({input:b.output,receiptPath,receipt,inventory:s.f.inventory}));}
  finally {await rm(s.objects);await rename(moved,s.objects);}
  await assert.rejects(stat(path.join(s.objects,b.record.backupId)),{code:'ENOENT'});
});

test('ruta de cuarentena sustituida durante refresh no obtiene éxito', async (t) => {
  const s=await setup(t),b=await backup(s.f);const receiptPath=b.output+'.receipt.json';const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
  await s.transfer.upload({input:b.output,receiptPath,receipt,inventory:s.f.inventory});const refresh=s.f.inventory.refresh.bind(s.f.inventory);let calls=0;const moved=s.quarantineParent+'-moved';
  s.f.inventory.refresh=async()=>{const state=await refresh();if(++calls===2){await rename(s.quarantineParent,moved);await symlink(moved,s.quarantineParent);}return state;};
  try {await assert.rejects(s.transfer.download({backupId:b.record.backupId,destination:path.join(s.quarantineParent,'replaced-path'),inventory:s.f.inventory}));}
  finally {await rm(s.quarantineParent);await rename(moved,s.quarantineParent);}
});

test('CLI no usa red ni modos remotos, ignora cero flags y no emite éxito ante cierre fallido', async(t)=>{
  const s=await setup(t),b=await backup(s.f);await s.transfer.close();await s.f.inventory.close();
  const base=['scripts/inf03-transfer.mjs','upload','--mode','local-simulated','--objects',s.objects,'--repository',s.f.config.repository,'--inventory',s.f.config.inventory,'--inventory-checkpoint',s.f.config.checkpoint,'--input',b.output,'--receipt',b.output+'.receipt.json'];
  const env={...process.env,INF03_TRANSFER_HMAC_KEY:s.key,INF03_INVENTORY_HMAC_KEY:s.f.config.key};const run=(args)=>spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000,env});
  for(const args of [[...base,'--mode','local-simulated'],[...base,'--unknown','value'],[...base,'--now','2099'],base.map(v=>v==='local-simulated'?'b2':v),[...base,'--destination',s.quarantineParent]]){const r=run(args);assert.notEqual(r.status,0);assert.equal(r.stdout,'');}
  const injection=path.join(s.f.base,'close-failure.mjs');
  await writeFile(injection,`import { LocalSimulatedTransfer } from ${JSON.stringify(pathToFileURL(path.resolve('scripts/inf03-transfer-common.mjs')).href)};const close=LocalSimulatedTransfer.prototype.close;LocalSimulatedTransfer.prototype.close=async function(){await close.call(this);throw new Error('controlled close failure');};`,{mode:0o600});
  const fail=run(['--import',injection,...base]);assert.notEqual(fail.status,0);assert.match(fail.stderr,/controlled close failure/);assert.equal(fail.stdout,'');
  const recovered=run(base);assert.equal(recovered.status,0);assert.equal(JSON.parse(recovered.stdout).idempotent,true);
});
test('objetos con hardlinks, payload alterado y permisos públicos no producen descarga',async(t)=>{
  for(const kind of ['hardlink','tampered','mode']){
    const s=await setup(t),b=await backup(s.f);const receiptPath=b.output+'.receipt.json';await s.transfer.upload({input:b.output,receiptPath,receipt:JSON.parse(await readFile(receiptPath,'utf8')),inventory:s.f.inventory});
    const payload=path.join(s.objects,b.record.backupId,'ciphertext.age');
    if(kind==='hardlink')await link(payload,path.join(s.f.base,'extra-hardlink'));
    if(kind==='tampered')await writeFile(payload,'corrupted');
    if(kind==='mode'){const {chmod}=await import('node:fs/promises');await chmod(payload,0o644);}
    const target=path.join(s.quarantineParent,'blocked');await assert.rejects(s.transfer.download({backupId:b.record.backupId,destination:target,inventory:s.f.inventory}));await assert.rejects(stat(target),{code:'ENOENT'});
  }
});
test('rehusar original ausente mantiene guard de inventario sin fallback de recuperación',async(t)=>{
  const s=await setup(t),b=await backup(s.f),receiptPath=b.output+'.receipt.json';await s.transfer.upload({input:b.output,receiptPath,receipt:JSON.parse(await readFile(receiptPath,'utf8')),inventory:s.f.inventory});await unlink(b.output);
  const target=path.join(s.quarantineParent,'no-fallback');await assert.rejects(s.transfer.download({backupId:b.record.backupId,destination:target,inventory:s.f.inventory}));await assert.rejects(stat(target),{code:'ENOENT'});
});
