#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile, symlink, realpath, unlink, rename } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGE, unpack, assertResource, sql as query } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/scripts/inf03-common.mjs';
import { BackupInventory, RETENTION_MS, initializeInventory, syncPrivateFile, syncDirectory } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/scripts/inf03-inventory-common.mjs';
import { LocalSuppressionJournal, initializeLocalSuppressionJournal } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/dist/modules/account-deletion/suppression-journal.js';
import { appFixture, fixtureSQL, runAppFlow } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/scripts/inf03-app-flow.mjs';
process.umask(0o077);

const root = '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app';
const toolsArgument=process.argv.indexOf('--tools-dir');
const suppliedToolsDir=toolsArgument>=0?process.argv[toolsArgument+1]:undefined;
if(!suppliedToolsDir&&!process.argv.includes('--download-tools')){process.stderr.write('Usá --tools-dir con age oficial local o --download-tools sólo con autorización de red.\n');process.exit(1);}
const resultsDir = path.join(root, 'docs/plans/lanzamiento-2026-10-07/RESULTADOS/INF-03-custodia-evidencia');await mkdir(resultsDir,{recursive:true});
const appMode = process.argv.includes('--app-flow');
const evidenceName = 'runtime.json';
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
const hostDirectory=path.join(projectDir,'lost-host');await mkdir(hostDirectory,{mode:0o700});
const repository=path.join(hostDirectory,'repository'),inventoryDirectory=path.join(hostDirectory,'inventory'),inventoryCheckpoint=path.join(hostDirectory,'inventory-custody'),suppressionJournal=path.join(hostDirectory,'suppression-journal'),suppressionCheckpoint=path.join(hostDirectory,'suppression-custody');
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
let app,next,browser;
const ids=new Map();
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
  measurements.startingContainerSnapshotRecorded=true;
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
    run('docker', ['run', '--pull','never','--detach', '--name', container, '--network', net, '--label', `com.pokescan.inf03.run=${runId}`, '--label', `com.pokescan.inf03.role=${role}`, '--label', `com.pokescan.inf03.project=pokemon-cards-scanner-app`, '--mount', `type=volume,source=${volume},target=/var/lib/postgresql/data`, '--env', 'POSTGRES_PASSWORD=ephemeral-bootstrap-only', '--health-cmd', 'pg_isready -h 127.0.0.1 -U postgres', '--health-interval', '1s', '--health-timeout', '1s', '--health-retries', '60', IMAGE]);
    resources.push(container);ids.set(container,run('docker',['inspect','-f','{{.Id}}',container]).trim());
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
  const req=createRequire(path.join(root,'backend/package.json'));
  const {hash:passwordHash}=req('argon2');const password=randomBytes(20).toString('base64url');const encodedPassword=await passwordHash(password);
  query(source.container,source.db,`UPDATE users SET \"passwordHash\"='${encodedPassword}';INSERT INTO collections(id,\"userId\",name,\"createdAt\",\"updatedAt\") VALUES ('88888888-8888-4888-8888-888888888888','22222222-2222-4222-8222-222222222222','Colección conservada',now(),now());`,source.user);
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

  const checks=[];measurements.checks=checks;const transferKey=randomBytes(32).toString('hex'),custodyKey=randomBytes(32).toString('hex');
  const check=(id,pass)=>{checks.push({id,pass:Boolean(pass)});if(!pass)fail('FAILED_'+id);};
  const cli=(script,args,password)=>spawnSync('node',[`scripts/${script}.mjs`,...args],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:1024*1024,env:{...process.env,INF03_INVENTORY_HMAC_KEY:inventoryKey,INF03_SUPPRESSION_HMAC_KEY:suppressionKey,INF03_DB_PASSWORD:password,INF03_TRANSFER_HMAC_KEY:transferKey,INF03_CUSTODY_HMAC_KEY:custodyKey}});
  const restoreArgs=['--run',runId,'--container',destination.container,'--database',destination.db,'--db-user',destination.user,'--identity',identity,'--age',age,'--input',artifact,'--receipt',artifact+'.receipt.json','--marker',destination.marker,...inventoryArgs,...suppressionArgs];
  const counter=path.join(projectDir,'restore-counter');
  process.env.INF03_RESTORE_COUNTER=counter;
  const empty=()=>query(destination.container,destination.db,"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public';").trim()==='0';
  const denied=(id,result,code)=>{check(id,result.status!==0&&!result.stdout.includes('"restored":true')&&result.stderr.includes(code));check(id+'-target-untouched',empty());};
  check('backup-registered-durable',backupSummary.backupId&&JSON.parse(await readFile(path.join(inventoryDirectory,'inventory.json'),'utf8')).body.records.length===1);
  check('backup-staging-clean-before-success',run('docker',['exec',source.container,'find','/tmp','-maxdepth','1','-name',`${runId}-backup-*`]).trim()==='');
  const objectDirectory=path.join(projectDir,'external-objects'),custodyStore=path.join(projectDir,'metadata-custody'),custodyAnchor=path.join(projectDir,'current-head-custody');
  for(const dir of [objectDirectory,custodyStore,custodyAnchor])await mkdir(dir,{mode:0o700});
  const transferBase=['--mode','local-simulated','--objects',objectDirectory,...inventoryArgs];
  const expectSuccess=(id,result)=>{if(result.status!==0)fail('CUSTODY_'+id+'_'+result.stderr.split('\n').find(l=>l.includes('UNVERIFIED')||l.includes('Error:')));const json=JSON.parse(result.stdout);check(id,true);return json;};
  expectSuccess('separate-objects-store-initialized',cli('inf03-transfer',['init',...transferBase]));
  const uploaded=expectSuccess('actual-age-backup-stored-outside-lost-host',cli('inf03-transfer',['upload',...transferBase,'--input',artifact,'--receipt',artifact+'.receipt.json']));
  check('external-simulated-object-hash-preserved',uploaded.ciphertextSha256===backupSummary.ciphertextSha256);
  const custodyBase=['--mode','local-simulated','--store',custodyStore,'--anchor',custodyAnchor,...inventoryArgs,...suppressionArgs];
  expectSuccess('explicit-metadata-and-head-custody-initialized',cli('inf03-custody',['init',...custodyBase]));
  const initial=expectSuccess('first-current-custody-published-before-baja',cli('inf03-custody',['publish',...custodyBase]));check('first-custody-carries-no-baja',initial.suppressionSequence===0);
  const firstAnchor=JSON.parse(await readFile(path.join(custodyAnchor,'current.json'),'utf8')).body;
  const beforeBajaEntries=await readFile(path.join(suppressionJournal,'entries.jsonl')),beforeBajaCheckpoint=await readFile(path.join(suppressionCheckpoint,'checkpoint.json'));
  const journalConfig={journalDirectory:suppressionJournal,checkpointDirectory:suppressionCheckpoint,hmacKey:suppressionKey};
  const liveJournal=new LocalSuppressionJournal(journalConfig);await liveJournal.open();
  try {await liveJournal.accept('11111111-1111-4111-8111-111111111111');} finally {await liveJournal.close();}
  query(source.container,source.db,"DELETE FROM users WHERE id='11111111-1111-4111-8111-111111111111';",source.user);
  check('baja-after-backup-and-first-custody',query(source.container,source.db,'SELECT count(*) FROM users;',source.user).trim()==='1');
  const afterBajaEntries=await readFile(path.join(suppressionJournal,'entries.jsonl')),afterBajaCheckpoint=await readFile(path.join(suppressionCheckpoint,'checkpoint.json'));
  const latest=expectSuccess('latest-custody-includes-authentic-baja',cli('inf03-custody',['publish',...custodyBase]));check('current-journal-sequence-advanced',latest.suppressionSequence===1);
  const currentAnchorFile=path.join(custodyAnchor,'current.json'),anchorBytes=await readFile(currentAnchorFile),currentAnchor=JSON.parse(anchorBytes.toString()).body;
  check('independent-anchor-points-to-new-snapshot',currentAnchor.generation===2&&currentAnchor.snapshotId!==firstAnchor.snapshotId&&currentAnchor.journal.sequence===1);
  const idempotent=expectSuccess('same-authority-publication-idempotent',cli('inf03-custody',['publish',...custodyBase]));check('idempotency-does-not-advance-anchor',idempotent.idempotent&&(await readFile(currentAnchorFile)).equals(anchorBytes));
  await writeFile(path.join(suppressionJournal,'entries.jsonl'),beforeBajaEntries,{mode:0o600});await writeFile(path.join(suppressionCheckpoint,'checkpoint.json'),beforeBajaCheckpoint,{mode:0o600});
  const rollback=cli('inf03-custody',['publish',...custodyBase]);check('valid-signed-old-journal-cannot-rollback-anchor',rollback.status!==0&&rollback.stdout===''&&(await readFile(currentAnchorFile)).equals(anchorBytes));
  await writeFile(path.join(suppressionJournal,'entries.jsonl'),afterBajaEntries,{mode:0o600});await writeFile(path.join(suppressionCheckpoint,'checkpoint.json'),afterBajaCheckpoint,{mode:0o600});
  expectSuccess('source-verified-read-only-against-current-anchor',cli('inf03-custody',['verify',...custodyBase]));check('verify-left-anchor-byte-identical',(await readFile(currentAnchorFile)).equals(anchorBytes));
  const originalInventory=await readFile(path.join(inventoryDirectory,'inventory.json')),originalMarker=await readFile(path.join(repository,'.inf03-repository.json'));
  const originPaths=[repository,inventoryDirectory,inventoryCheckpoint,suppressionJournal,suppressionCheckpoint];
  check('all-origin-state-inside-owned-lost-host',originPaths.every(p=>p.startsWith(hostDirectory+path.sep)));
  const sourceID=assertResource(runId,source.container,'source');check('source-full-id-before-loss',sourceID===ids.get(source.container));run('docker',['rm','-f',sourceID]);resources.splice(resources.indexOf(source.container),1);check('source-postgres-actually-lost',maybe('docker',['inspect',sourceID]).status!==0);
  await rm(hostDirectory,{recursive:true});check('all-origin-ciphertext-inventory-and-journal-lost',(await Promise.all(originPaths.map(p=>stat(p).catch(()=>null)))).every(v=>v===null));
  let normalAuditBlocked=false;try{await new BackupInventory({repository,inventory:inventoryDirectory,checkpoint:inventoryCheckpoint,key:inventoryKey}).open();}catch(e){normalAuditBlocked=e.code==='ENOENT';}check('normal-inventory-still-refuses-missing-origin',normalAuditBlocked);
  await mkdir(hostDirectory,{mode:0o700});
  const targetAbsent=async()=> (await Promise.all(originPaths.map(p=>stat(p).catch(()=>null)))).every(v=>v===null);
  const denyRecovery=async(id,result)=>{check(id,result.status!==0&&result.stdout===''&&result.stderr.trim()==='INF03_CUSTODY_UNVERIFIED');check(id+'-no-origin-materialized',await targetAbsent());};
  const recoveryArgs=['recover',...custodyBase,'--objects',objectDirectory];
  const anchorHold=path.join(projectDir,'held-current-head');await rename(currentAnchorFile,anchorHold);await denyRecovery('missing-current-anchor-no-fallback',cli('inf03-custody',recoveryArgs));await rename(anchorHold,currentAnchorFile);
  const snapshot=path.join(custodyStore,currentAnchor.snapshotId),entriesFile=path.join(snapshot,'journal-entries.jsonl'),entriesBytes=await readFile(entriesFile);
  await writeFile(entriesFile,'corrupt\n',{mode:0o600});await denyRecovery('tampered-custody-journal-rejected-before-materialization',cli('inf03-custody',recoveryArgs));await writeFile(entriesFile,entriesBytes,{mode:0o600});
  const commitFile=path.join(snapshot,'commit.json'),commitBytes=await readFile(commitFile);await writeFile(commitFile,await readFile(path.join(custodyStore,firstAnchor.snapshotId,'commit.json')),{mode:0o600});await denyRecovery('signed-old-snapshot-cannot-override-current-anchor',cli('inf03-custody',recoveryArgs));await writeFile(commitFile,commitBytes,{mode:0o600});
  const expireImport=path.join(projectDir,'expired-fixture-clock.mjs');const deadline=Date.parse(latest.expiresAt);
  await writeFile(expireImport,`const RealDate=Date;const now=${deadline};globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};`,{mode:0o600});
  const expired=spawnSync('node',['--import',expireImport,'scripts/inf03-custody.mjs',...recoveryArgs],{cwd:root,encoding:'utf8',timeout:15000,maxBuffer:1024*1024,env:{...process.env,INF03_INVENTORY_HMAC_KEY:inventoryKey,INF03_SUPPRESSION_HMAC_KEY:suppressionKey,INF03_TRANSFER_HMAC_KEY:transferKey,INF03_CUSTODY_HMAC_KEY:custodyKey}});await denyRecovery('exact-30-day-fixture-refuses-host-recovery',expired);
  check('no-pg-restore-before-custody-admission',(await stat(counter).catch(()=>({size:0}))).size===0);
  const recovered=expectSuccess('fresh-cli-reconstructed-host-from-separate-custody',cli('inf03-custody',recoveryArgs));check('recovery-materialization-is-not-traffic-admission',recovered.recovered&&recovered.activeRecords===1&&recovered.suppressionSequence===1&&recovered.restoreEligible===false);
  check('repository-marker-and-inventory-signatures-preserved',(await readFile(path.join(repository,'.inf03-repository.json'))).equals(originalMarker)&&(await readFile(path.join(inventoryDirectory,'inventory.json'))).equals(originalInventory));
  check('original-baja-bytes-preserved',(await readFile(path.join(suppressionJournal,'entries.jsonl'))).equals(afterBajaEntries)&&(await readFile(path.join(suppressionCheckpoint,'checkpoint.json'))).equals(afterBajaCheckpoint));
  check('all-reconstructed-directories-private',(await Promise.all(originPaths.map(p=>stat(p)))).every(s=>(s.mode&0o777)===0o700));
  const normallyOpen=await new BackupInventory({repository,inventory:inventoryDirectory,checkpoint:inventoryCheckpoint,key:inventoryKey}).open();try{const record=await normallyOpen.admitRestore(artifact,artifact+'.receipt.json',JSON.parse(await readFile(artifact+'.receipt.json','utf8')));check('normal-audit-admits-same-original-id-date-hash',record.backupId===uploaded.backupId&&record.originalCreatedAt===uploaded.originalCreatedAt&&record.ciphertextSha256===backupSummary.ciphertextSha256);}finally{await normallyOpen.close();}
  expectSuccess('reconstructed-source-verified-immediately-before-restore',cli('inf03-custody',['verify',...custodyBase]));
  const restored=cli('inf03-restore',restoreArgs,destination.password);if(restored.status!==0)fail('restore-cli-failed-'+restored.stderr.split('\n').find(l=>l.includes('Error:')));
  expectSuccess('custody-verified-after-replay-before-opening-traffic',cli('inf03-custody',['verify',...custodyBase]));check('current-anchor-still-identical-before-traffic',(await readFile(currentAnchorFile)).equals(anchorBytes));
  measurements.restore=JSON.parse(restored.stdout);check('restore-only-success-after-suppressions',measurements.restore.restored&&measurements.restore.suppressionsApplied);
  check('single-actual-pg-restore',(await readFile(counter,'utf8')).trim()==='pg_restore');
  const remaining="SELECT (SELECT count(*) FROM users WHERE id='11111111-1111-4111-8111-111111111111')+(SELECT count(*) FROM collections WHERE \"userId\"='11111111-1111-4111-8111-111111111111')+(SELECT count(*) FROM collection_items)+(SELECT count(*) FROM share_links)+(SELECT count(*) FROM friendships)+(SELECT count(*) FROM collection_item_add_operations);";
  check('deleted-account-and-all-fixture-relations-stay-gone',query(destination.container,destination.db,remaining,destination.user).trim()==='0');
  check('other-account-and-collection-preserved',query(destination.container,destination.db,'SELECT (SELECT count(*) FROM users)||\'|\'||(SELECT name FROM collections);',destination.user).trim()==='1|Colección conservada');
  check('catalog-preserved',query(destination.container,destination.db,'SELECT count(*) FROM cards;',destination.user).trim()==='1');
  check('migration-and-five-gin-preserved',measurements.restore.migrations===migrationIds.length&&measurements.restore.validTrigramIndexes===5);
  check('restore-plaintext-staging-removed',run('docker',['exec',destination.container,'find','/tmp','-maxdepth','1','-name',`${runId}-restore-*`]).trim()==='');
  // Sólo después del restore verificado se agrega un proxy propio para el consumidor.
  const proxy=runId+'-consumer-proxy';
  const forwarding="const net=require('node:net');net.createServer(s=>{const t=net.connect(5432,'"+destination.container+"');s.pipe(t);t.pipe(s);s.on('error',()=>t.destroy());t.on('error',()=>s.destroy());}).listen(3333,'0.0.0.0');";
  const ingress=runId+'-consumer-net';run('docker',['network','create','--label',`com.pokescan.inf03.run=${runId}`,'--label','com.pokescan.inf03.role=consumer-proxy',ingress]);networkNames.push(ingress);
  run('docker',['run','--pull','never','-d','--name',proxy,'--network',ingress,'--label',`com.pokescan.inf03.run=${runId}`,'--label','com.pokescan.inf03.role=consumer-proxy','-p','127.0.0.1:56608:3333','--entrypoint','node','node:22-alpine','-e',forwarding]);resources.push(proxy);ids.set(proxy,run('docker',['inspect','-f','{{.Id}}',proxy]).trim());
  run('docker',['network','connect',destination.network,proxy]);
  const net=await import('node:net');await new Promise((resolve,reject)=>{const end=Date.now()+5000;const attempt=()=>{const socket=net.connect(56608,'127.0.0.1');socket.once('connect',()=>{socket.destroy();resolve();});socket.once('error',()=>{socket.destroy();if(Date.now()>end)reject(new Error('PROXY_NOT_READY'));else setTimeout(attempt,100);});};attempt();});
  const env={NODE_ENV:'test',DATABASE_URL:`postgresql://${destination.user}:${encodeURIComponent(destination.password)}@127.0.0.1:56608/${destination.db}`,REDIS_URL:'redis://127.0.0.1:56599',JWT_SECRET:randomBytes(40).toString('hex'),JWT_REFRESH_SECRET:randomBytes(40).toString('hex'),RECOVERY_IDENTIFIER_HMAC_KEY:randomBytes(40).toString('hex'),CORS_ORIGINS:'http://localhost:3000',FRONTEND_URL:'http://localhost:3000',RECOVERY_MAIL_MODE:'disabled',ACCOUNT_DELETION_MODE:'local-private',ACCOUNT_DELETION_JOURNAL_DIR:suppressionJournal,ACCOUNT_DELETION_CHECKPOINT_DIR:suppressionCheckpoint,ACCOUNT_DELETION_HMAC_KEY:suppressionKey,PRICE_QUEUE_ENABLED:'false',ENABLE_CATALOG_SYNC_CRON:'false',ENABLE_PRICE_BACKFILL_CRON:'false',ENABLE_RETENTION_CRON:'false',SCANNER_VISUAL_ENABLED:'0',CURRENCY_ARS_ENABLED:'false'};Object.assign(process.env,env);
  const nativeFetch=globalThis.fetch;let external=0;globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)){external++;return Promise.reject(new Error('EXTERNAL_BLOCKED'));}return nativeFetch(input,init);};
  const {Test}=req('@nestjs/testing'),{ValidationPipe,Logger}=req('@nestjs/common');Logger.overrideLogger(false);
  const {AppModule}=await import(path.join(root,'backend/dist/app.module.js'));
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication({logger:false});app.use(req('helmet')());app.setGlobalPrefix('api');app.enableCors({origin:['http://localhost:3000'],credentials:true});app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.listen(3001,'127.0.0.1');
  const api='http://localhost:3001/api',web='http://localhost:3000';
  const request=async(route,body,token)=>{const r=await fetch(api+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:web,'X-Session-Request':'1'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()};};
  check('compiled-api-ready-after-replay',(await request('/ready')).status===200);
  check('old-account-login-denied',(await request('/auth/login',{email:'fixture-a@example.invalid',password})).status===401);
  const other=await request('/auth/login',{email:'fixture-b@example.invalid',password});check('other-account-login-works',other.status===200);
  const {JwtService}=req('@nestjs/jwt');const oldToken=await app.get(JwtService).signAsync({sub:'11111111-1111-4111-8111-111111111111',email:'fixture-a@example.invalid',authVersion:0});
  check('old-signed-access-denied',(await request('/users/me',undefined,oldToken)).status===401);
  check('deleted-share-api-404',(await request('/s/inf03-fixture-share')).status===404);
  check('other-account-api-collection-works',(await request('/collections',undefined,other.body.accessToken)).status===200);
  const nextLog=await import('node:fs');const fd=nextLog.openSync(path.join(projectDir,'next.log'),'w');next=spawn('node',['--import','/private/tmp/local-app-qa-20261010/no-provider-fetch.mjs',path.join(root,'frontend/node_modules/next/dist/bin/next'),'start',path.join(root,'frontend'),'--hostname','127.0.0.1','--port','3000'],{cwd:path.join(root,'frontend'),env:{...process.env,NODE_ENV:'production',API_INTERNAL_URL:api},stdio:['ignore',fd,fd]});nextLog.closeSync(fd);
  const until=Date.now()+15000;let ready=false;while(Date.now()<until){try{if((await fetch(web+'/login')).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}check('compiled-next-started',ready);
  const pw=createRequire('/Users/ysmaelalcalarico/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');browser=await pw.chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await ctx.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());const page=await ctx.newPage();
  await page.goto(web+'/login');await page.locator('#login-email').fill('fixture-b@example.invalid');await page.locator('#login-password').fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/buscar');await page.goto(web+'/colecciones');await page.getByText('Colección conservada',{exact:true}).waitFor();
  check('real-browser-login-and-preserved-collection',await page.getByText('Colección conservada',{exact:true}).isVisible());await page.screenshot({path:path.join(resultsDir,'coleccion-restaurada-mobile.png'),fullPage:true});
  await page.reload();await page.getByText('Colección conservada',{exact:true}).waitFor();check('real-session-persists-after-reload',await page.getByText('Colección conservada',{exact:true}).isVisible());
  await page.goto(web+'/share/inf03-fixture-share');await page.getByText('Este enlace no está disponible',{exact:true}).waitFor();check('restored-deleted-share-unavailable-real-browser',await page.getByText('Este enlace no está disponible',{exact:true}).isVisible());await page.screenshot({path:path.join(resultsDir,'enlace-suprimido-mobile.png'),fullPage:true});
  check('no-external-provider-contact',external===0);await browser.close();browser=null;await app.close();app=null;next.kill('SIGTERM');await new Promise(r=>{if(next.exitCode!==null)r();else next.once('exit',r);});next=null;
  run('docker',['rm','-f',ids.get(proxy)]);resources.splice(resources.indexOf(proxy),1);check('destination-exclusivity-reestablished',assertResource(runId,destination.container,'destination')===ids.get(destination.container));
  measurements.verification={migrations:migrationIds.length,validTrigramIndexes:5};measurements.tests={controls:checks.length,negativeScenarios:5};measurements.localRecoveryMs=Date.now()-Date.parse(startAt);measurements.timeSimulation='Exact 30-day fixture Date confined to one CLI subprocess; no system clock/TTL change or physical 30-day wait';
  measurements.sharedContainersBefore = before;
  measurements.endedAt = new Date().toISOString();
  measurements.testResult = 'passed';
} catch (error) {
  if (appMode) { try { measurements.appFlow = JSON.parse(await readFile(path.join(projectDir, 'app-flow-result.json'), 'utf8')); } catch {} }
  measurements.testResult = 'failed';
  measurements.error = String(error.message).replace(/(?:postgres(?:ql)?:\/\/|password|token|secret)[^\s]*/gi, '[redacted]').slice(0, 500);
} finally {
  await browser?.close();if(app)await app.close();if(next){next.kill('SIGTERM');await new Promise(r=>{if(next.exitCode!==null)r();else{next.once('exit',r);setTimeout(()=>{next.kill('SIGKILL');r();},5000).unref();}});}
  measurements.cleanup.attempted = true;
  measurements.cleanup.errors=[];
  for (const container of resources) {
    const owned = maybe('docker', ['inspect', '--format', '{{json .Config.Labels}}', container]);
    if (owned.status === 0) {
      try {
        const labels = JSON.parse(owned.stdout);
        if (labels['com.pokescan.inf03.run'] === runId && run('docker',['inspect','-f','{{.Id}}',container]).trim()===ids.get(container)) run('docker', ['rm', '--force', ids.get(container)]);else fail('Cleanup identity mismatch');
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
