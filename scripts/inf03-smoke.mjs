#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile, symlink, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGE, unpack, assertResource, sql as query } from './inf03-common.mjs';
import { initializeInventory } from './inf03-inventory-common.mjs';
import { initializeLocalSuppressionJournal } from '../backend/dist/modules/account-deletion/suppression-journal.js';
import { appFixture, fixtureSQL, runAppFlow } from './inf03-app-flow.mjs';
process.umask(0o077);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsArgument=process.argv.indexOf('--tools-dir');
const suppliedToolsDir=toolsArgument>=0?process.argv[toolsArgument+1]:undefined;
if(!suppliedToolsDir&&!process.argv.includes('--download-tools')){process.stderr.write('Usá --tools-dir con age oficial local o --download-tools sólo con autorización de red.\n');process.exit(1);}
const resultsDir = path.join(root, 'docs/plans/lanzamiento-2026-10-07/RESULTADOS');
const appMode = process.argv.includes('--app-flow');
const evidenceName = `INF-03-smoke-inventory-${Date.now()}.json`;
const fail = (message) => { throw new Error(message); };
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) fail(`Proceso ${path.basename(command)} falló (${result.status ?? 'timeout'}); salida sanitizada.`);
  return result.stdout;
};
const maybe = (command, args, options = {}) => spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024, ...options });
const sha = (data) => createHash('sha256').update(data).digest('hex');
const runId = `inf03-${randomBytes(6).toString('hex')}`;
const projectDir = await realpath(await mkdtemp(path.join(os.tmpdir(), `${runId}-`)));
await chmod(projectDir, 0o700);
const ageDir = path.join(projectDir, 'age');
await mkdir(ageDir, { mode: 0o700 });
const repository=path.join(projectDir,'repository'),inventoryDirectory=path.join(projectDir,'inventory'),inventoryCheckpoint=path.join(projectDir,'inventory-custody'),suppressionJournal=path.join(projectDir,'suppression-journal'),suppressionCheckpoint=path.join(projectDir,'suppression-custody');
for(const directory of [repository,inventoryDirectory,inventoryCheckpoint,suppressionJournal,suppressionCheckpoint]) await mkdir(directory,{mode:0o700});
const inventoryKey=randomBytes(32).toString('hex'),suppressionKey=randomBytes(32).toString('hex');
await initializeInventory({repository,inventory:inventoryDirectory,checkpoint:inventoryCheckpoint,key:inventoryKey});
await initializeLocalSuppressionJournal({journalDirectory:suppressionJournal,checkpointDirectory:suppressionCheckpoint,hmacKey:suppressionKey},new Date().toISOString());
const inventoryArgs=['--repository',repository,'--inventory',inventoryDirectory,'--inventory-checkpoint',inventoryCheckpoint];
const suppressionArgs=['--suppression-journal',suppressionJournal,'--suppression-checkpoint',suppressionCheckpoint];
const artifact = path.join(repository, 'backup.tar.age');
const restoreCounter = path.join(projectDir, 'restore-counter');
const startAt = new Date().toISOString();
const measurements = { runId, startedAt: startAt, steps: {}, tests: { positive: 0, negative: 0 }, ownedResources: [], cleanup: { attempted: false, complete: false } };
if (appMode) measurements.mode = 'backup-restore-with-app-flow';
const resources = [];
let sourceContainer = '';
let destinationContainer = '';
let volumeNames = [];
let networkNames = [];
let recipient = '';
let identity = '';
let age = '';
const appOperation = appMode ? appFixture() : undefined;
try {
  if(process.platform !== 'darwin' || process.arch !== 'arm64') fail('Este ensayo sólo está validado para macOS ARM64.');
  const ageVersion = 'v1.2.1';
  const osName = process.platform === 'darwin' ? 'darwin' : process.platform;
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'amd64' : process.arch;
  const archiveName = `age-${ageVersion}-${osName}-${arch}.tar.gz`;
  const url = `https://github.com/FiloSottile/age/releases/download/${ageVersion}/${archiveName}`;
  const ageArchive = path.join(ageDir, archiveName);
  if(!suppliedToolsDir){
    const downloaded=spawnSync('curl',['--fail','--location','--silent','--show-error','--max-time','45',url,'-o',ageArchive],{encoding:'utf8',timeout:50_000,maxBuffer:1024*1024});
    if(downloaded.error||downloaded.status!==0) fail('No se pudo obtener age oficial v1.2.1.');
    run('tar',['-xzf',ageArchive,'-C',ageDir,'age/age','age/age-keygen']);
  }
  age=path.join(suppliedToolsDir??path.join(ageDir,'age'),'age');
  const ageKeygen=path.join(suppliedToolsDir??path.join(ageDir,'age'),'age-keygen');
  const ageVer = run(age, ['--version']).trim();
  if (!ageVer.includes('1.2.1')) fail('La versión age recuperada no coincide con el pin.');
  const keygen = spawnSync(ageKeygen, ['-o', path.join(projectDir, 'identity.txt')], { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024 });
  if (keygen.error || keygen.status !== 0) fail('No se pudo generar la identidad temporal age.');
  identity = path.join(projectDir, 'identity.txt');
  await chmod(identity, 0o600);
  const keyText = await readFile(identity, 'utf8');
  recipient = keyText.match(/# public key: (age1\S+)/)?.[1] ?? '';
  if (!recipient) fail('age-keygen no produjo un destinatario público válido.');
  measurements.tooling = { node:process.version,pnpm:run('pnpm',['--version']).trim(),platform:process.platform,arch:process.arch,age:ageVer,ageRelease:url,ageArchiveSha256:suppliedToolsDir?null:sha(await readFile(ageArchive)),toolSource:suppliedToolsDir?'provided-local-no-download':'official-HTTPS-release',ageBinarySha256:sha(await readFile(age)),postgresImage:IMAGE };
  if(process.version !== 'v22.20.0' || measurements.tooling.pnpm !== '10.17.1') fail('Runtime del proyecto incompatible.');
  const imageInfo = JSON.parse(run('docker', ['image', 'inspect', IMAGE, '--format', '{{json .}}']));
  measurements.tooling.postgresImageId = imageInfo.Id;
  measurements.tooling.postgresRepoDigests = imageInfo.RepoDigests;
  if (!Array.isArray(imageInfo.RepoDigests) || imageInfo.RepoDigests.length === 0) fail('No se pudo fijar digest de la imagen oficial PostgreSQL.');
  const sharedHealthBefore=JSON.parse(run('docker',['inspect','pokemon-scanner-db','pokemon-scanner-redis'])).map((item)=>({name:item.Name.slice(1),id:item.Id,health:item.State.Health?.Status}));
  if(sharedHealthBefore.some((item)=>item.health!=='healthy'))fail('El stack compartido no está healthy.');
  measurements.sharedHealthBefore=sharedHealthBefore;
  const before = run('docker', ['ps', '--format', '{{.Names}} {{.ID}}']).trim().split('\n').filter(Boolean).sort();
  if (before.some((line) => !/^pokemon-scanner-(db|redis)\s/.test(line))) fail('Apareció un contenedor ajeno inesperado antes del ensayo.');
  measurements.sharedContainersBefore = before;

  const makePostgres = async (role) => {
    const net = `${runId}-${role}-net`;
    const volume = `${runId}-${role}-pgdata`;
    const container = `${runId}-${role}-pg`;
    run('docker', ['network', 'create', '--internal', '--label', `com.pokescan.inf03.run=${runId}`, '--label', `com.pokescan.inf03.role=${role}`, net]);
    networkNames.push(net);
    measurements.ownedResources.push({ type: 'network', name: net, runId, role });
    run('docker', ['volume', 'create', '--label', `com.pokescan.inf03.run=${runId}`, '--label', `com.pokescan.inf03.role=${role}`, volume]);
    volumeNames.push(volume);
    measurements.ownedResources.push({ type: 'volume', name: volume, runId, role });
    const password = randomBytes(24).toString('hex');
    run('docker', ['run', '--detach', '--name', container, '--network', net, '--label', `com.pokescan.inf03.run=${runId}`, '--label', `com.pokescan.inf03.role=${role}`, '--label', `com.pokescan.inf03.project=pokemon-cards-scanner-app`, '--mount', `type=volume,source=${volume},target=/var/lib/postgresql/data`, '--env', 'POSTGRES_PASSWORD=ephemeral-bootstrap-only', '--health-cmd', 'pg_isready -h 127.0.0.1 -U postgres', '--health-interval', '1s', '--health-timeout', '1s', '--health-retries', '60', IMAGE]);
    resources.push(container);
    if(role==='source') sourceContainer=container;else destinationContainer=container;
    measurements.ownedResources.push({ type: 'container', name: container, runId, role });
    const until = Date.now() + 45_000;
    while (Date.now() < until) {
      const health = maybe('docker', ['inspect', '--format', '{{.State.Health.Status}}', container]);
      if (health.status === 0 && health.stdout.trim() === 'healthy') break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    const healthy = run('docker', ['inspect', '--format', '{{.State.Health.Status}}', container]).trim();
    if (healthy !== 'healthy') fail(`PostgreSQL ${role} no quedó healthy.`);
    const db = `inf03_${role}`;
    const user = `inf03_${role}`;
    const marker = `${runId}-${role}-fresh`;
    const appPassword = randomBytes(24).toString('hex') + ':\\with-colon';
    const bootstrap = `CREATE ROLE ${user} LOGIN PASSWORD E'${appPassword.replaceAll('\\','\\\\')}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; CREATE DATABASE ${db} OWNER ${user}; COMMENT ON DATABASE ${db} IS '${marker}';`;
    run('docker', ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: bootstrap });
    return { container, db, user, password: appPassword, marker, network: net, volume };
  };
  const source = await makePostgres('source');
  sourceContainer = source.container;
  const destination = await makePostgres('destination');
  destinationContainer = destination.container;
  if (source.network === destination.network || source.volume === destination.volume || source.container === destination.container) fail('Origen y destino no tienen identidad independiente.');

  const migrationRoot = path.join(root, 'backend/prisma/migrations');
  const { readdir } = await import('node:fs/promises');
  const migrationIds = (await readdir(migrationRoot)).filter((entry) => /^\d{14}_[a-z0-9_]+$/.test(entry)).sort();
  const migrationStart = Date.now();
  const initMigrations = `CREATE TABLE "_prisma_migrations" ("id" VARCHAR(36) NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMP(3), "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMP(3), "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "applied_steps_count" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id"));`;
  run('docker', ['exec', '-i', source.container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', source.user, '-d', source.db], { input: initMigrations });
  for (const migration of migrationIds) {
    const sql = await readFile(path.join(migrationRoot, migration, 'migration.sql'), 'utf8');
    run('docker', ['exec', '-i', source.container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', source.user, '-d', source.db], { input: sql });
    const checksum = sha(sql);
    const id = randomUUID();
    const escapedMigration = migration.replaceAll("'", "''");
    run('docker', ['exec', '-i', source.container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', source.user, '-d', source.db], { input: `INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES ('${id}','${checksum}',now(),'${escapedMigration}',1);` });
  }
  measurements.steps.sourceBootstrapMs = Date.now() - migrationStart;

  const fixtureSql = `INSERT INTO users (id,email,username,"passwordHash","displayName","createdAt","updatedAt") VALUES ('11111111-1111-4111-8111-111111111111','fixture-a@example.invalid','fixture_a','synthetic-hash-a','Fixture A',now(),now()),('22222222-2222-4222-8222-222222222222','fixture-b@example.invalid','fixture_b','synthetic-hash-b','Fixture B',now(),now());
INSERT INTO card_sets (id,name,series,"printedTotal",total,"rawJson","syncedAt") VALUES ('inf03set','Synthetic INF03 Set','Synthetic',1,1,'{}',now());
INSERT INTO cards (id,name,supertype,subtypes,types,number,"setId","imageSmall","imageLarge","rawJson","syncedAt") VALUES ('inf03set-1','Synthetic Fixture Card','Pokémon',ARRAY[]::text[],ARRAY['Colorless'],'1','inf03set','https://example.invalid/s.png','https://example.invalid/l.png','{}',now());
INSERT INTO friendships (id,"requesterId","addresseeId",status,"createdAt","updatedAt") VALUES ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','accepted',now(),now());
INSERT INTO collections (id,"userId",name,"isDefault","createdAt","updatedAt") VALUES ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','Synthetic collection',true,now(),now());
INSERT INTO collection_items (id,"collectionId","cardId",variant,condition,quantity,"isForTrade","addedAt","updatedAt") VALUES ('55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','inf03set-1','normal','NM',2,false,now(),now()),('66666666-6666-4666-8666-666666666666','44444444-4444-4444-8444-444444444444','inf03set-1','holofoil','LP',3,true,now(),now());
INSERT INTO collection_item_add_operations ("userId",key,"payloadHash","resultItemId","expiresAt","createdAt") VALUES ('11111111-1111-4111-8111-111111111111','inf03-idempotency-key','synthetic-payload','55555555-5555-4555-8555-555555555555',now()+interval '1 day',now());
INSERT INTO share_links (id,"userId","collectionId",slug,"isActive","viewCount","createdAt","expiresAt") VALUES ('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','inf03-fixture-share',true,0,now(),now()+interval '7 days');`;
  run('docker', ['exec', '-i', source.container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', source.user, '-d', source.db], { input: fixtureSql });
  if (appMode) query(source.container, source.db, fixtureSQL(appOperation), source.user);
  const fixtureStatementAt = run('docker', ['exec', source.container, 'psql', '-U', source.user, '-d', source.db, '-Atc', `SELECT to_char(max("updatedAt") AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') FROM collections WHERE id='44444444-4444-4444-8444-444444444444'`]).trim();
  const fixtureCommitObservedAt = new Date().toISOString();
  const fullFixture = `SELECT json_build_object('users',(SELECT json_agg(row_to_json(t) ORDER BY id) FROM users t),'friendships',(SELECT json_agg(row_to_json(t) ORDER BY id) FROM friendships t),'collections',(SELECT json_agg(row_to_json(t) ORDER BY id) FROM collections t),'items',(SELECT json_agg(row_to_json(t) ORDER BY id) FROM collection_items t),'operations',(SELECT json_agg(row_to_json(t) ORDER BY key) FROM collection_item_add_operations t),'shares',(SELECT json_agg(row_to_json(t) ORDER BY id) FROM share_links t),'migrations',(SELECT json_agg(row_to_json(t) ORDER BY migration_name) FROM "_prisma_migrations" t));`;
  const fixtureDigest = sha(query(source.container,source.db,fullFixture,source.user).trim());
  const padding = randomBytes(256*1024).toString('hex');
  query(source.container,source.db,`UPDATE cards SET "rawJson"=json_build_object('syntheticPadding','${padding}');`,source.user);
  const backupStart = Date.now();
  const backup = run('node', ['scripts/inf03-backup.mjs', '--run', runId, '--container', source.container, '--database', source.db, '--db-user', source.user, '--recipient', recipient, '--age', age, '--output', artifact,...inventoryArgs], { env: { ...process.env, INF03_INVENTORY_HMAC_KEY:inventoryKey, INF03_SUPPRESSION_HMAC_KEY:suppressionKey, INF03_DB_PASSWORD: source.password } });
  const backupSummary = JSON.parse(backup.trim());
  measurements.steps.backupMs = Date.now() - backupStart;
  measurements.backup = { ...backupSummary, receiptSha256: sha(await readFile(`${artifact}.receipt.json`)), fixtureStatementAt, includedCommitObservedAfterSQL:fixtureCommitObservedAt };
  measurements.multichunk = {ciphertextBytes:backupSummary.ciphertextBytes,minimumChunks:Math.floor((backupSummary.ciphertextBytes-1024)/65552)};
  if(measurements.multichunk.minimumChunks<2) fail('El paquete no ejercita múltiples chunks age.');
  const excludedCommitStart = new Date().toISOString();
  query(source.container,source.db,`UPDATE collections SET name='Synthetic excluded commit',"updatedAt"=now();`,source.user);
  measurements.backup.excludedCommitObservedAfterSQL=new Date().toISOString();
  measurements.backup.excludedCommitStartedAt=excludedCommitStart;
  const collision = maybe('node',['scripts/inf03-backup.mjs','--run',runId,'--container',source.container,'--database',source.db,'--db-user',source.user,'--recipient',recipient,'--age',age,'--output',artifact,...inventoryArgs],{env:{...process.env,INF03_INVENTORY_HMAC_KEY:inventoryKey,INF03_SUPPRESSION_HMAC_KEY:suppressionKey,INF03_DB_PASSWORD:source.password}});
  if(collision.status===0 || sha(await readFile(artifact))!==backupSummary.ciphertextSha256) fail('La colisión sobrescribió backup.');
  measurements.backupCollisionRejected=true;
  measurements.backupSourceStagingClean=query(source.container,source.db,'SELECT 1;').trim()==='1' && run('docker',['exec',source.container,'find','/tmp','-maxdepth','1','-name',`${runId}-backup-*`]).trim()==='';
  assertResource(runId,source.container,'source');
  const sourceLabels = JSON.parse(run('docker', ['inspect', '--format', '{{json .Config.Labels}}', source.container]));
  if (sourceLabels['com.pokescan.inf03.run'] !== runId) fail('Se perdió propiedad origen antes de eliminarlo.');
  run('docker', ['rm', '--force', source.container]);
  resources.splice(resources.indexOf(source.container), 1);
  measurements.sourceDestroyedAfterCiphertext = true;
  const incidentPoint = new Date();
  measurements.backup.incidentPoint = incidentPoint.toISOString();
  measurements.backup.pointRecovered = 'commit fixture confirmado antes del dump; modificación posterior excluida';
  measurements.backup.observedGapMs = incidentPoint.getTime() - Date.parse(fixtureCommitObservedAt);

  const originalCiphertext = await readFile(artifact);
  const invokeRestore = (input, receipt, marker = destination.marker, identityPath = identity) => maybe('node', ['scripts/inf03-restore.mjs', '--run', runId, '--container', destination.container, '--database', destination.db, '--db-user', destination.user, '--identity', identityPath, '--age', age, '--input', input, '--receipt', receipt, '--marker', marker,...inventoryArgs,...suppressionArgs], { env: { ...process.env, INF03_INVENTORY_HMAC_KEY:inventoryKey, INF03_SUPPRESSION_HMAC_KEY:suppressionKey, INF03_DB_PASSWORD: destination.password, INF03_RESTORE_COUNTER: restoreCounter } });
  const expectRejected=(name,result,reason)=>{
    if(result.error||result.status===0||!String(result.stderr).includes(reason)) fail(`${name}: no alcanzó la guarda esperada ${reason}.`);
    if(query(destination.container,destination.db,"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','S');").trim()!=='0' && name!=='occupied-target') fail(`${name}: mutó target vacío.`);
    measurements.tests.negative++; (measurements.rejectionStages??=[]).push({name,reason});
  };
  const receiptFor=async(file)=>{const receiptFile=file+'.receipt.json';await writeFile(receiptFile,JSON.stringify({...JSON.parse(await readFile(artifact+'.receipt.json','utf8')),ciphertextBytes:(await stat(file)).size,ciphertextSha256:sha(await readFile(file))}),{mode:0o600});return receiptFile;};
  for (const [name, mutate] of [
    ['altered-final-chunk', (buf) => { const copy = Buffer.from(buf); copy[copy.length-1] ^= 0x40; return copy; }],
    ['truncated-final-chunk', (buf) => buf.subarray(0, Math.max(1, buf.length - 8))]
  ]) {
    const bad = path.join(projectDir, `${name}.age`);
    await writeFile(bad, mutate(originalCiphertext), { mode: 0o600 });
    const direct=spawnSync(age,['-d','-i',identity,bad],{timeout:5000,maxBuffer:2*1024*1024});
    if(direct.status===0 || direct.stdout.length<65536) fail('La prueba age no produjo output parcial autenticado.');
    (measurements.multichunk.partialOutputs??=[]).push({name,bytes:direct.stdout.length,status:direct.status});
    expectRejected(name,invokeRestore(bad,await receiptFor(bad)),'INF03_INVENTORY_UNVERIFIED');
  }
  const wrongIdentity = path.join(projectDir, 'wrong-identity.txt');
  const wrongKey = spawnSync(ageKeygen, ['-o', wrongIdentity], { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024 });
  if (wrongKey.status !== 0) fail('No se pudo crear la identidad negativa.');
  expectRejected('wrong-identity', invokeRestore(artifact, `${artifact}.receipt.json`, destination.marker, wrongIdentity),'age rechazó');
  const wrongReceipt = path.join(projectDir, 'wrong.receipt.json');
  await writeFile(wrongReceipt, JSON.stringify({ ...JSON.parse(await readFile(`${artifact}.receipt.json`, 'utf8')), ciphertextSha256: '0'.repeat(64) }), { mode: 0o600 });
  expectRejected('wrong-receipt-digest', invokeRestore(artifact, wrongReceipt),'INF03_INVENTORY_UNVERIFIED');
  expectRejected('wrong-target-marker', invokeRestore(artifact, `${artifact}.receipt.json`, `${destination.marker}-wrong`),'Argumentos/propiedad');

  const originalTar = path.join(projectDir, 'original.tar');
  run(age, ['-d', '-i', identity, '-o', originalTar, artifact]);
  const stage = path.join(projectDir, 'package-stage');
  await mkdir(stage, { mode: 0o700 });
  await unpack(originalTar,stage);
  const makeEncryptedPackage = async (name, mode) => {
    const stagePath = path.join(projectDir, `stage-${name}`);
    await mkdir(stagePath, { mode: 0o700 });
    const manifest = JSON.parse(await readFile(path.join(stage, 'manifest.json'), 'utf8'));
    if (mode === 'wrong-dump-digest') manifest.payload.sha256 = '0'.repeat(64);
    if (mode === 'incompatible-manifest') manifest.manifestVersion = 99;
    if(mode==='manifest-extra-field') manifest.privateConfig='forbidden';
    if(mode==='wrong-migration-checksum') manifest.migrations[0].checksum='0'.repeat(64);
    let dumpData=await readFile(path.join(stage,'database.dump'));
    if(mode==='sql-rollback'){dumpData=dumpData.subarray(0,dumpData.length-100);manifest.payload.bytes=dumpData.length;manifest.payload.sha256=sha(dumpData);}
    await writeFile(path.join(stagePath, 'manifest.json'), `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
    await writeFile(path.join(stagePath, 'database.dump'), dumpData, { mode: 0o600 });
    if (mode === 'extra-entry') await writeFile(path.join(stagePath, 'extra.txt'), 'synthetic', { mode: 0o600 });
    if (mode === 'symlink-entry') {
      await rm(path.join(stagePath, 'database.dump'));
      await symlink('manifest.json', path.join(stagePath, 'database.dump'));
    }
    const tarFile = path.join(projectDir, `${name}.tar`);
    const encryptedFile = path.join(projectDir, `${name}.age`);
    run('tar', ['--format','ustar','-cf', tarFile, '-C', stagePath, ...(mode === 'extra-entry' ? ['manifest.json', 'database.dump', 'extra.txt'] : ['manifest.json', 'database.dump'])]);
    run(age, ['-r', recipient, '-o', encryptedFile, tarFile]);
    await chmod(encryptedFile, 0o600);
    const bytes = await stat(encryptedFile);
    const receiptFile = path.join(projectDir, `${name}.receipt.json`);
    await writeFile(receiptFile, JSON.stringify({ backupId: manifest.backupId, ciphertextBytes: bytes.size, ciphertextSha256: sha(await readFile(encryptedFile)), encryption: 'age-v1.2.1',createdAt:new Date().toISOString() }), { mode: 0o600 });
    return { encryptedFile, receiptFile };
  };
  for (const mode of ['wrong-dump-digest','incompatible-manifest','manifest-extra-field','wrong-migration-checksum','extra-entry','symlink-entry']) {
    const badPackage = await makeEncryptedPackage(mode, mode);
    expectRejected(mode,invokeRestore(badPackage.encryptedFile,badPackage.receiptFile),'INF03_INVENTORY_UNVERIFIED');
  }
  run('docker', ['exec', destination.container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', destination.db, '-c', 'CREATE TABLE public.inf03_occupied_guard(id integer)']);
  expectRejected('occupied-target',invokeRestore(artifact,`${artifact}.receipt.json`),'objetos preexistentes');
  run('docker', ['exec', destination.container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', destination.db, '-c', 'DROP TABLE public.inf03_occupied_guard']);
  query(destination.container,destination.db,`COMMENT ON DATABASE ${destination.db} IS 'incorrect-marker';`);
  expectRejected('actual-marker-mismatch',invokeRestore(artifact,`${artifact}.receipt.json`),'Propietario/marcador');
  query(destination.container,destination.db,`COMMENT ON DATABASE ${destination.db} IS '${destination.marker}';`);
  query(destination.container,destination.db,`ALTER ROLE ${destination.user} CREATEDB;`);
  expectRejected('privileged-role',invokeRestore(artifact,`${artifact}.receipt.json`),'Rol limitado');
  query(destination.container,destination.db,`ALTER ROLE ${destination.user} NOCREATEDB;`);
  const sharedNetworkName=source.network;
  run('docker',['network','connect',sharedNetworkName,destination.container]);
  expectRejected('multiple-networks',invokeRestore(artifact,`${artifact}.receipt.json`),'Red no exclusiva');
  run('docker',['network','disconnect',sharedNetworkName,destination.container]);
  const wrongContainer=maybe('node',['scripts/inf03-restore.mjs','--run',runId,'--container','pokemon-scanner-db','--database',destination.db,'--db-user',destination.user,'--identity',identity,'--age',age,'--input',artifact,'--receipt',artifact+'.receipt.json','--marker',destination.marker,...inventoryArgs,...suppressionArgs],{env:{...process.env,INF03_INVENTORY_HMAC_KEY:inventoryKey,INF03_SUPPRESSION_HMAC_KEY:suppressionKey,INF03_DB_PASSWORD:destination.password}});
  expectRejected('shared-name-rejected',wrongContainer,'Argumentos/propiedad');
  if((await stat(restoreCounter).catch(()=>({size:0}))).size!==0) fail('Se invocó restore antes de terminar los negativos de prevalidación.');
  measurements.prevalidationRestoreCount=0;
  const broken=await makeEncryptedPackage('sql-rollback','sql-rollback');
  const rollback=invokeRestore(broken.encryptedFile,broken.receiptFile);
  expectRejected('unregistered-broken-dump',rollback,'INF03_INVENTORY_UNVERIFIED');
  measurements.sqlRollback={attempts:0,note:'Paquete no registrado rechazado por inventario; no acredita rollback SQL nuevo.'};
  if(run('docker',['exec',destination.container,'find','/tmp','-maxdepth','1','-name',`${runId}-restore-*`]).trim()!=='') fail('Se conservó plaintext interno después del fallo.');
  const restoreStart = Date.now();
  const restored = run('node', ['scripts/inf03-restore.mjs', '--run', runId, '--container', destination.container, '--database', destination.db, '--db-user', destination.user, '--identity', identity, '--age', age, '--input', artifact, '--receipt', `${artifact}.receipt.json`, '--marker', destination.marker,...inventoryArgs,...suppressionArgs], { env: { ...process.env, INF03_INVENTORY_HMAC_KEY:inventoryKey, INF03_SUPPRESSION_HMAC_KEY:suppressionKey, INF03_DB_PASSWORD: destination.password, INF03_RESTORE_COUNTER: restoreCounter } });
  measurements.steps.restoreMs = Date.now() - restoreStart;
  measurements.restore = JSON.parse(restored.trim());
  measurements.localRecoveryMs = Date.now() - Date.parse(startAt);
  const verify = `SELECT (SELECT count(*) FROM users WHERE id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'))||'|'||(SELECT count(*) FROM friendships WHERE id='33333333-3333-4333-8333-333333333333')||'|'||(SELECT string_agg(id||':'||quantity,',' ORDER BY id) FROM collection_items WHERE "collectionId"='44444444-4444-4444-8444-444444444444')||'|'||(SELECT count(*) FROM collection_item_add_operations WHERE key='inf03-idempotency-key' AND "resultItemId"='55555555-5555-4555-8555-555555555555')||'|'||(SELECT count(*) FROM share_links WHERE slug='inf03-fixture-share' AND "collectionId"='44444444-4444-4444-8444-444444444444' AND "isActive"=true)||'|'||(SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL)||'|'||(SELECT count(*) FROM pg_extension WHERE extname='pg_trgm')||'|'||(SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname IN ('cards_name_trgm_idx','card_sets_name_trgm_idx','users_username_trgm_idx','users_display_name_trgm_idx','cards_artist_trgm_idx') AND i.indisvalid);`;
  const observed = run('docker', ['exec', destination.container, 'psql', '-U', 'postgres', '-d', destination.db, '-Atc', verify]).trim();
  const expected = `2|1|55555555-5555-4555-8555-555555555555:2,66666666-6666-4666-8666-666666666666:3|1|1|${migrationIds.length}|1|5`;
  if (observed !== expected) fail(`Las invariantes restauradas no coinciden (${observed.slice(0, 100)}).`);
  measurements.verification = { expectedFixtureSet: true, migrations: migrationIds.length, pgTrgm: true, validTrigramIndexes: measurements.restore.validTrigramIndexes, validatedConstraints: measurements.restore.validatedConstraints, schemaFingerprint: measurements.restore.schemaFingerprint, checks: 11 };
  if(sha(query(destination.container,destination.db,fullFixture,destination.user).trim())!==fixtureDigest) fail('Los conjuntos completos de fixtures/migraciones no coinciden.');
  if(query(destination.container,destination.db,"SELECT name FROM collections;").trim()!=='Synthetic collection') fail('El commit posterior entró en el backup.');
  measurements.verification.fullFixtureDigest=fixtureDigest;measurements.verification.completeFixtureSets=true;
  measurements.verification.excludedCommitAbsent=true;
  measurements.verification.postgresServer= query(destination.container,destination.db,'SHOW server_version;').trim();
  measurements.verification.pgDump=run('docker',['exec',destination.container,'pg_dump','--version']).trim();
  measurements.verification.pgRestore=run('docker',['exec',destination.container,'pg_restore','--version']).trim();
  if(run('docker',['exec',destination.container,'find','/tmp','-maxdepth','1','-name',`${runId}-restore-*`]).trim()!=='') fail('Se conservó plaintext interno después de éxito.');
  measurements.containerStagingCleanAfterSuccessAndFailure=true;
  measurements.localRecoveryFromIncidentMs=Date.now()-incidentPoint.getTime();
  measurements.tests.positive++;

  const restoreInvocations = (await readFile(restoreCounter, 'utf8')).trim().split('\n').filter(Boolean).length;
  if (restoreInvocations !== 1) fail(`Se invocó pg_restore ${restoreInvocations} veces; se esperaba sólo la positiva registrada.`);
  const afterNegatives = run('docker', ['exec', destination.container, 'psql', '-U', 'postgres', '-d', destination.db, '-Atc', verify]).trim();
  if (afterNegatives !== expected) fail('Los intentos negativos mutaron el destino restaurado.');
  measurements.negativeRestoreBeforeSQL = { altered: true, truncatedFinalChunk: true, wrongIdentity: true, wrongReceiptDigest: true, wrongTargetMarker: true, unregisteredPackagesRejectedByInventory: true, authenticatedPackageNegativeLayersReexecuted: false, occupiedTarget: true, pgRestoreInvocationCount: restoreInvocations, verifiedDestinationUnchanged: true };
  if (appMode) {
    measurements.appFlow = await runAppFlow({ runId, destination, projectDir, fixture: appOperation,
      register: (name, role) => { resources.push(name); measurements.ownedResources.push({ type: 'container', name, runId, role }); },
      registerNetwork: (name) => { networkNames.push(name); measurements.ownedResources.push({ type: 'network', name, runId, role: 'app-ingress' }); } });
  }

  measurements.sharedContainersBefore = before;
  measurements.endedAt = new Date().toISOString();
  measurements.testResult = 'passed';
} catch (error) {
  if (appMode) { try { measurements.appFlow = JSON.parse(await readFile(path.join(projectDir, 'app-flow-result.json'), 'utf8')); } catch {} }
  measurements.testResult = 'failed';
  measurements.error = String(error.message).replace(/(?:postgres(?:ql)?:\/\/|password|token|secret)[^\s]*/gi, '[redacted]').slice(0, 500);
} finally {
  measurements.cleanup.attempted = true;
  measurements.cleanup.errors=[];
  for (const container of resources) {
    const owned = maybe('docker', ['inspect', '--format', '{{json .Config.Labels}}', container]);
    if (owned.status === 0) {
      try {
        const labels = JSON.parse(owned.stdout);
        if (labels['com.pokescan.inf03.run'] === runId) run('docker', ['rm', '--force', container]);
      } catch { measurements.cleanup.errors.push(`Contenedor no retirado: ${container}`); }
    }
  }
  for (const network of networkNames) {
    const owned = maybe('docker', ['network', 'inspect', '--format', '{{json .Labels}}', network]);
    if (owned.status === 0) {
      try { if (JSON.parse(owned.stdout)['com.pokescan.inf03.run'] === runId) run('docker', ['network', 'rm', network]); } catch { measurements.cleanup.errors.push('Red/volumen propio no retirado.'); }
    }
  }
  for (const volume of volumeNames) {
    const owned = maybe('docker', ['volume', 'inspect', '--format', '{{json .Labels}}', volume]);
    if (owned.status === 0) {
      try { if (JSON.parse(owned.stdout)['com.pokescan.inf03.run'] === runId) run('docker', ['volume', 'rm', volume]); } catch { measurements.cleanup.errors.push('Red/volumen propio no retirado.'); }
    }
  }
  measurements.cleanup.complete = measurements.cleanup.errors.length===0 && resources.every((name) => maybe('docker', ['inspect', name]).status !== 0)
    && networkNames.every((name) => maybe('docker', ['network', 'inspect', name]).status !== 0)
    && volumeNames.every((name) => maybe('docker', ['volume', 'inspect', name]).status !== 0);
  const afterCleanup = maybe('docker', ['ps', '--format', '{{.Names}} {{.ID}}']);
  if (afterCleanup.status === 0) {
    const snapshot = afterCleanup.stdout.trim().split('\n').filter(Boolean).sort();
    measurements.sharedContainersAfter = snapshot;
    if (JSON.stringify(measurements.sharedContainersBefore) !== JSON.stringify(snapshot)) {
      measurements.testResult = 'failed';
      measurements.error = 'El conjunto de contenedores activos cambió durante el ensayo.';
    }
  } else {
    measurements.testResult = 'failed';
    measurements.error = 'No se pudo comprobar el snapshot final de Docker.';
  }
  try {
    measurements.sharedHealthAfter=JSON.parse(run('docker',['inspect','pokemon-scanner-db','pokemon-scanner-redis'])).map((item)=>({name:item.Name.slice(1),id:item.Id,health:item.State.Health?.Status}));
    if(JSON.stringify(measurements.sharedHealthBefore)!==JSON.stringify(measurements.sharedHealthAfter)) fail('Cambió salud/identidad compartida.');
    for(const kind of ['container','network','volume']) {const cmd=kind==='container'?['ps','-aq']: [kind,'ls','-q'];if(run('docker',[...cmd,'--filter',`label=com.pokescan.inf03.run=${runId}`]).trim()) fail('Recursos propios restantes.');}
  }catch{measurements.cleanup.complete=false;measurements.testResult='failed';measurements.cleanup.errors.push('No se pudo acreditar aislamiento/cleanup final.');}
  if(measurements.cleanup.complete) await rm(artifact, { force: true });
  if(measurements.cleanup.complete) await rm(`${artifact}.receipt.json`, { force: true });
  if(measurements.cleanup.complete) {await rm(projectDir,{recursive:true,force:true});measurements.cleanup.hostTemporaryRemoved=true;} else {measurements.cleanup.preservedPrivateContext=projectDir;}
  measurements.cleanup.complete &&= measurements.cleanup.hostTemporaryRemoved===true;
  await mkdir(resultsDir, { recursive: true });
  await writeFile(path.join(resultsDir, evidenceName), `${JSON.stringify(measurements, null, 2)}\n`, { mode: 0o600 });
}
if (measurements.testResult !== 'passed' || !measurements.cleanup.complete) {
  process.stderr.write(`${JSON.stringify({ runId, testResult: measurements.testResult, cleanupComplete: measurements.cleanup.complete, error: measurements.error ?? 'cleanup incompleto' })}\n`);
  process.exitCode = 1;
} else {
  if (appMode) {
    process.stdout.write(`${JSON.stringify({ runId, tests: measurements.tests, appChecks: measurements.appFlow.checks.length, cleanupComplete: measurements.cleanup.complete, evidence: path.relative(root, path.join(resultsDir, evidenceName)) })}\n`);
  } else {
  process.stdout.write(`${JSON.stringify({ runId, tests: measurements.tests, migrationCount: measurements.verification?.migrations, localRecoveryMs: measurements.localRecoveryMs, cleanupComplete: measurements.cleanup.complete, evidence: path.relative(root, path.join(resultsDir,evidenceName)) })}\n`);
  }
}
