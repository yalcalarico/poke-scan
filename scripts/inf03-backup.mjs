#!/usr/bin/env node
/** Backup local: sólo un origen sintético propio y fijado por digest. */
import { randomUUID } from 'node:crypto';
import { chmod, link, mkdtemp, rm, stat, writeFile, lstat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fail, run, sha, hash, safeDirectory, safePath, pgpassText, sql, assertResource, assertDatabase, streamToFile, migrations, migrationRecords, schemaFingerprint, containerStage, cleanupStage, LIMIT } from './inf03-common.mjs';
import { BackupInventory, inventoryConfig, syncPrivateFile } from './inf03-inventory-common.mjs';
const args = process.argv.slice(2);
const value = (key) => { const at = args.indexOf(key); return at < 0 ? undefined : args[at+1]; };
const runId = value('--run'), container = value('--container'), database = value('--database'), user = value('--db-user'), recipient = value('--recipient'), age = value('--age'), output = value('--output');
const password = process.env.INF03_DB_PASSWORD;
if (!/^inf03-[a-f0-9]{12}$/.test(runId ?? '') || container !== `${runId}-source-pg` || database !== 'inf03_source' || user !== 'inf03_source' || !/^age1[a-z0-9]{58}$/.test(recipient ?? '') || !age || !output) fail('Argumentos/propiedad INF-03 inválidos.');
const passText = pgpassText(database,user,password);
const inventory = new BackupInventory(inventoryConfig(args));
let summary;
try {
await inventory.open();
await safePath(age);
if (run(age,['--version']).trim() !== 'v1.2.1') fail('Versión age incompatible.');
const parent = path.dirname(path.resolve(output));
if (await safeDirectory(parent,true) !== inventory.dirs.repository || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}\.age$/.test(path.basename(output))) fail('Backup fuera del repositorio propio.');
for (const file of [output,`${output}.receipt.json`]) { try { await lstat(file); fail('El destino ya existe; no se sobrescribe.'); } catch(error) { if (error.code !== 'ENOENT') throw error; } }
const privateDir = await mkdtemp(path.join(os.tmpdir(),`${runId}-backup-`)); await chmod(privateDir,0o700);
const dump = path.join(privateDir,'database.dump'), tar = path.join(privateDir,'payload.tar');
const encrypted = path.join(parent,`.inf03-${randomUUID()}.partial`), tempReceipt = path.join(parent,`.inf03-${randomUUID()}.receipt.partial`);
const stage = `/tmp/${runId}-backup-${randomUUID()}`;
let containerId; let staged = false; const startedAt = new Date().toISOString();
try {
  containerId = assertResource(runId,container,'source');
  assertDatabase(container,database,user,`${runId}-source-fresh`,false);
  const records = migrationRecords(container,database,user);
  if (JSON.stringify(records) !== JSON.stringify(await migrations())) fail('Migraciones/checksums del origen incompatibles.');
  const fingerprint = schemaFingerprint(container,database,user);
  const extension = sql(container,database,"SELECT extversion FROM pg_extension WHERE extname='pg_trgm';",user).trim();
  if (!extension) fail('Falta pg_trgm en origen.');
  const pgpass = path.join(privateDir,'pgpass'); await writeFile(pgpass,passText,{mode:0o600,flag:'wx'});
  // Se reserva antes del cp para limpiar también si la copia falla.
  staged = true; await containerStage(container,stage,pgpass);
  await streamToFile('docker',['exec','-e',`PGPASSFILE=${stage}/pgpass`,container,'pg_dump','-h','localhost','-U',user,'-d',database,'-Fc','--no-owner','--no-acl','--no-password'],dump);
  const bytes = (await stat(dump)).size;
  const manifest = { manifestVersion:1,backupId:randomUUID(),createdAt:startedAt,source:{project:'pokemon-cards-scanner-app',environment:'synthetic-local',postgresMajor:16},format:{kind:'pg_dump-custom',compression:'pg_dump'},database:{logicalName:'inf03-synthetic',schemaFingerprint:fingerprint},migrations:records,extensions:[{name:'pg_trgm',version:extension}],artifacts:{model:null,index:null,policy:'regenerables-o-versionados-aparte'},payload:{file:'database.dump',bytes,sha256:await hash(dump)},encryption:{format:'age',recipientKeyIds:[sha(recipient).slice(0,16)]},privacy:{photos:false,scannerQueryImages:false,manifestContainsPii:false,dumpContainsPrivateData:true},fixtureCommit:'INF03-FIXTURE-2' };
  await writeFile(path.join(privateDir,'manifest.json'),JSON.stringify(manifest)+'\n',{mode:0o600,flag:'wx'});
  run('tar',['--format','ustar','-cf',tar,'-C',privateDir,'manifest.json','database.dump']); await chmod(tar,0o600);
  if ((await stat(tar)).size > LIMIT) fail('Tar supera límite local.');
  await streamToFile(age,['-r',recipient,tar],encrypted);
  const receipt = {backupId:manifest.backupId,ciphertextBytes:(await stat(encrypted)).size,ciphertextSha256:await hash(encrypted),encryption:'age-v1.2.1',createdAt:new Date().toISOString()};
  await writeFile(tempReceipt,JSON.stringify(receipt)+'\n',{mode:0o600,flag:'wx'});
  let published = false;
  try { await link(encrypted,output); published=true; await link(tempReceipt,`${output}.receipt.json`); }
  catch(error) { if(published) await unlink(output); throw error; }
  // Los temporales no sobreviven como hardlinks: el inventario admite una sola identidad.
  await unlink(encrypted); await unlink(tempReceipt);
  await syncPrivateFile(output);
  await syncPrivateFile(`${output}.receipt.json`, 64 * 1024);
  await inventory.registerVerifiedBackup({ manifest, receipt, output });
  summary = {...receipt,durationMs:Date.now()-Date.parse(startedAt),migrations:records.length,dumpBytes:bytes,dumpSha256:manifest.payload.sha256};
} finally {
  const cleanupErrors = [];
  if (staged) { try { cleanupStage(container,containerId,stage); } catch { cleanupErrors.push('Cleanup del staging interno falló; conservá el contenedor identificado.'); } }
  for (const file of [encrypted,tempReceipt,privateDir]) { try { await rm(file,{recursive:file===privateDir,force:true}); } catch { cleanupErrors.push('Cleanup local falló.'); } }
  if(cleanupErrors.length) fail(cleanupErrors.join(' '));
}
} finally { await inventory.close(); }
process.stdout.write(JSON.stringify(summary)+'\n');
