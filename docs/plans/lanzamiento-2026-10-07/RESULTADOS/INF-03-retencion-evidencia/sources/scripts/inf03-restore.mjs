#!/usr/bin/env node
/** La autenticación completa y la allowlist preceden a todo SQL de restauración. */
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, stat, writeFile, appendFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fail, run, hash, safeDirectory, safePath, pgpassText, sql, assertResource, assertDatabase, streamToFile, migrations, migrationRecords, schemaFingerprint, containerStage, cleanupStage, validateReceipt, validateManifest, unpack } from './inf03-common.mjs';
import { BackupInventory, inventoryConfig, privateDirectory } from './inf03-inventory-common.mjs';
import { LocalSuppressionJournal } from '../backend/dist/modules/account-deletion/suppression-journal.js';
import { validateRestoreSnapshot, suppressionReplaySql } from '../backend/dist/modules/account-deletion/restore-policy.js';
const args=process.argv.slice(2); const value=(key)=>{const at=args.indexOf(key);return at<0?undefined:args[at+1];};
const runId=value('--run'),container=value('--container'),database=value('--database'),user=value('--db-user'),identity=value('--identity'),age=value('--age'),input=value('--input'),receiptPath=value('--receipt'),marker=value('--marker');
if(!/^inf03-[a-f0-9]{12}$/.test(runId??'')||container!==`${runId}-destination-pg`||database!=='inf03_destination'||user!=='inf03_destination'||!identity||!age||!input||!receiptPath||marker!==`${runId}-destination-fresh`) fail('Argumentos/propiedad INF-03 inválidos.');
const inventory = new BackupInventory(inventoryConfig(args));
let journal;
let restoreSummary;
try {
await inventory.open();
const journalDirectory = await privateDirectory(value('--suppression-journal'));
const checkpointDirectory = await privateDirectory(value('--suppression-checkpoint'));
const directories = [...Object.values(inventory.dirs), journalDirectory, checkpointDirectory];
if (directories.some((a, i) => directories.some((b, j) => i !== j && (a === b || a.startsWith(b + path.sep))))) fail('Custodia de supresiones debe ser independiente.');
journal = new LocalSuppressionJournal({ journalDirectory, checkpointDirectory, hmacKey: process.env.INF03_SUPPRESSION_HMAC_KEY ?? '' });
await journal.open();
const suppressionSnapshot = await journal.snapshot();
const currentCheckpoint = suppressionSnapshot.checkpoint;
await safePath(receiptPath,{mode:0o600,max:64*1024});
const receipt=JSON.parse(await readFile(receiptPath,'utf8'));validateReceipt(receipt);
const registered = await inventory.admitRestore(input, receiptPath, receipt);
const restoreContext = { originalCreatedAt: registered.originalCreatedAt, currentCheckpoint };
validateRestoreSnapshot(suppressionSnapshot, restoreContext);
const passText=pgpassText(database,user,process.env.INF03_DB_PASSWORD);
await safePath(identity,{mode:0o600,privateParent:true,max:4096}); await safePath(input,{mode:0o600}); await safePath(receiptPath,{mode:0o600,max:64*1024}); await safePath(age);
if(run(age,['--version']).trim()!=='v1.2.1') fail('Versión age incompatible.');
if(process.env.INF03_RESTORE_COUNTER) { await safeDirectory(path.dirname(process.env.INF03_RESTORE_COUNTER),true); try { await safePath(process.env.INF03_RESTORE_COUNTER,{mode:0o600,privateParent:true,max:4096}); } catch(error) { if(error.code!=='ENOENT') throw error; } }
const privateDir=await mkdtemp(path.join(os.tmpdir(),`${runId}-restore-`));await chmod(privateDir,0o700);
const stage=`/tmp/${runId}-restore-${randomUUID()}`;let containerId;let staged=false;
try {
  containerId=assertResource(runId,container,'destination'); assertDatabase(container,database,user,marker,true);
  if(receipt.ciphertextBytes!==(await stat(input)).size||receipt.ciphertextSha256!==await hash(input)) fail('El ciphertext no coincide con el recibo propio.');
  const decrypted=path.join(privateDir,'payload.tar');
  try { await streamToFile(age,['-d','-i',identity,input],decrypted); } catch { fail('age rechazó el ciphertext; restore no invocado.'); }
  await unpack(decrypted,privateDir);
  const manifest=JSON.parse(await readFile(path.join(privateDir,'manifest.json'),'utf8'));validateManifest(manifest);
  if(manifest.backupId!==receipt.backupId) fail('Recibo/manifiesto incompatibles.');
  await inventory.admitRestore(input, receiptPath, receipt, manifest);
  if(JSON.stringify(manifest.migrations)!==JSON.stringify(await migrations())) fail('Migraciones/checksums incompatibles.');
  const dump=path.join(privateDir,'database.dump');const dumpStats=await stat(dump);
  if(dumpStats.size!==manifest.payload.bytes||await hash(dump)!==manifest.payload.sha256) fail('El dump interno no coincide con tamaño/digest.');
  const pgpass=path.join(privateDir,'pgpass');await writeFile(pgpass,passText,{mode:0o600,flag:'wx'});
  // Revalidar el recurso y la DB inmediatamente antes de la única mutación SQL.
  if(assertResource(runId,container,'destination')!==containerId) fail('El target cambió durante la validación.');assertDatabase(container,database,user,marker,true);
  staged=true;await containerStage(container,stage,pgpass,dump);
  await inventory.admitRestore(input, receiptPath, receipt, manifest);
  validateRestoreSnapshot(await journal.snapshot(), restoreContext);
  if(process.env.INF03_RESTORE_COUNTER) await appendFile(process.env.INF03_RESTORE_COUNTER,'pg_restore\n',{mode:0o600});
  run('docker',['exec','-e',`PGPASSFILE=${stage}/pgpass`,container,'pg_restore','-h','localhost','-U',user,'-d',database,'--single-transaction','--exit-on-error','--no-owner','--no-acl','--no-password',`${stage}/database.dump`]);
  // Tráfico cerrado: el destino no es admisible hasta replay+verificación atómica.
  sql(container, database, suppressionReplaySql(suppressionSnapshot), user);
  validateRestoreSnapshot(await journal.snapshot(), restoreContext);
  await inventory.admitRestore(input, receiptPath, receipt, manifest);
  if(schemaFingerprint(container,database,user)!==manifest.database.schemaFingerprint) fail('La huella de columnas/constraints/índices no coincide.');
  if(JSON.stringify(migrationRecords(container,database,user))!==JSON.stringify(manifest.migrations)) fail('Migraciones restauradas incompatibles.');
  const extension=sql(container,database,"SELECT extversion FROM pg_extension WHERE extname='pg_trgm';",user).trim();if(extension!==manifest.extensions[0].version) fail('pg_trgm incompatible.');
  const gin=Number(sql(container,database,"SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am a ON a.oid=c.relam WHERE c.relname IN ('cards_name_trgm_idx','card_sets_name_trgm_idx','users_username_trgm_idx','users_display_name_trgm_idx','cards_artist_trgm_idx') AND i.indisvalid AND i.indisready AND a.amname='gin' AND pg_get_indexdef(i.indexrelid) LIKE '%gin_trgm_ops%';",user).trim());if(gin!==5) fail('Índices GIN incompatibles.');
  const constraints=Number(sql(container,database,"SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype IN ('p','u','f') AND c.convalidated;",user).trim());
  if(sql(container,database,`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m') AND pg_get_userbyid(c.relowner)<>'${user}';`,user).trim()!=='0') fail('Ownership restaurado incompatible.');
  validateRestoreSnapshot(await journal.snapshot(), restoreContext);
  await inventory.admitRestore(input, receiptPath, receipt, manifest);
  restoreSummary = {restored:true,backupId:manifest.backupId,migrations:manifest.migrations.length,dumpBytes:dumpStats.size,schemaFingerprint:manifest.database.schemaFingerprint,pgTrgm:extension,validTrigramIndexes:gin,validatedConstraints:constraints,constraintScope:'public',ownership:true,suppressionsApplied:true};
} finally {
  const errors=[];if(staged){try{cleanupStage(container,containerId,stage);}catch{errors.push('Cleanup de plaintext interno falló; conservá contenedor identificado.');}}
  try{await rm(privateDir,{recursive:true,force:true});}catch{errors.push('Cleanup plaintext local falló.');}
  if(errors.length) fail(errors.join(' '));
}
validateRestoreSnapshot(await journal.snapshot(), restoreContext);
await inventory.admitRestore(input, receiptPath, receipt);
} finally {
  try { if (journal) await journal.close(); } finally { await inventory.close(); }
}
process.stdout.write(JSON.stringify(restoreSummary)+'\n');
