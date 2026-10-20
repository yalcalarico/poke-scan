import { randomBytes,randomUUID } from 'node:crypto';
import { chmod,mkdir,mkdtemp,readFile,writeFile,realpath,lstat } from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root='/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app', folder='/private/tmp/pokescan-backup-schedule-20261013';
const {IMAGE,run,sql,sha,assertResource}=await import(pathToFileURL(root+'/scripts/inf03-common.mjs'));
const {initializeInventory}=await import(pathToFileURL(root+'/scripts/inf03-inventory-common.mjs'));
const {initializeTransfer}=await import(pathToFileURL(root+'/scripts/inf03-transfer-common.mjs'));
const {initializeCustody}=await import(pathToFileURL(root+'/scripts/inf03-custody-common.mjs'));
const {initializeLocalSuppressionJournal,LocalSuppressionJournal}=await import(pathToFileURL(root+'/backend/dist/modules/account-deletion/suppression-journal.js'));
process.umask(0o077);
const base=await realpath(await mkdtemp('/private/tmp/pokescan-schedule-runtime-'));await chmod(base,0o700);const host=path.join(base,'host');await mkdir(host,{mode:0o700});
const paths={};for(const n of ['repository','inventory','inventoryCheckpoint','journal','journalCheckpoint']){paths[n]=path.join(host,n);await mkdir(paths[n],{mode:0o700});}
for(const n of ['store','anchor','objects','schedule']){paths[n]=path.join(base,n);await mkdir(paths[n],{mode:0o700});}
const k=()=>randomBytes(32).toString('hex');const keys={inventory:k(),journal:k(),transfer:k(),custody:k(),schedule:k()};
const runId='inf03-'+randomBytes(6).toString('hex'), resources=[];const baseStat=await lstat(base);const owner={base,baseIdentity:{dev:baseStat.dev,ino:baseStat.ino},paths,keys,runId,resources};
const persist=()=>writeFile(folder+'/runtime-owner.json',JSON.stringify(owner,null,2)+'\n',{mode:0o600});await persist();
const makePG=async(role)=>{
 const net=runId+'-'+role+'-net', volume=runId+'-'+role+'-pgdata', container=runId+'-'+role+'-pg';
 const labels=['--label','com.pokescan.inf03.run='+runId,'--label','com.pokescan.inf03.role='+role];
 const netid=run('docker',['network','create','--internal',...labels,net]).trim();resources.push({type:'network',name:net,id:netid,role});await persist();
 run('docker',['volume','create',...labels,volume]);resources.push({type:'volume',name:volume,role});await persist();
 const id=run('docker',['run','-d','--pull','never','--name',container,'--network',net,...labels,'--label','com.pokescan.inf03.project=pokemon-cards-scanner-app','--mount','type=volume,source='+volume+',target=/var/lib/postgresql/data','--env','POSTGRES_PASSWORD=ephemeral-bootstrap-only','--health-cmd','pg_isready -h 127.0.0.1 -U postgres','--health-interval','1s','--health-timeout','1s','--health-retries','60',IMAGE]).trim();resources.push({type:'container',name:container,id,role});await persist();
 const until=Date.now()+45000;while(Date.now()<until){if(run('docker',['inspect','-f','{{.State.Health.Status}}',container]).trim()==='healthy')break;await new Promise(r=>setTimeout(r,400));}
 if(run('docker',['inspect','-f','{{.State.Health.Status}}',container]).trim()!=='healthy')throw Error('PG_NOT_READY');
 const db='inf03_'+role,user=db,password=k(),marker=runId+'-'+role+'-fresh';
 sql(container,'postgres',`CREATE ROLE ${user} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;CREATE DATABASE ${db} OWNER ${user};COMMENT ON DATABASE ${db} IS '${marker}';`);
 assertResource(runId,container,role);return {container,id,db,user,password,marker};
};
owner.source=await makePG('source');await persist();owner.destination=await makePG('destination');await persist();
const s=owner.source;
sql(s.container,s.db,'CREATE TABLE "_prisma_migrations" ("id" varchar(36) PRIMARY KEY,"checksum" varchar(64) NOT NULL,"finished_at" timestamp(3),"migration_name" varchar(255) NOT NULL,"logs" text,"rolled_back_at" timestamp(3),"started_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"applied_steps_count" integer NOT NULL DEFAULT 0);',s.user);
const {readdir}=await import('node:fs/promises');const names=(await readdir(root+'/backend/prisma/migrations')).filter(n=>/^\d{14}_[a-z0-9_]+$/.test(n)).sort();
for(const name of names){const q=await readFile(root+'/backend/prisma/migrations/'+name+'/migration.sql','utf8');sql(s.container,s.db,q,s.user);sql(s.container,s.db,`INSERT INTO "_prisma_migrations" (id,checksum,finished_at,migration_name,applied_steps_count) VALUES ('${randomUUID()}','${sha(q)}',now(),'${name}',1);`,s.user);}
sql(s.container,s.db,`INSERT INTO users (id,email,username,"passwordHash","displayName","createdAt","updatedAt") VALUES ('11111111-1111-4111-8111-111111111111','fixture-a@example.invalid','fixture_a','synthetic-hash-a','Fixture A',now(),now()),('22222222-2222-4222-8222-222222222222','fixture-b@example.invalid','fixture_b','synthetic-hash-b','Fixture B',now(),now());`,s.user);
const inventoryConfig={repository:paths.repository,inventory:paths.inventory,checkpoint:paths.inventoryCheckpoint,key:keys.inventory}, journalConfig={journalDirectory:paths.journal,checkpointDirectory:paths.journalCheckpoint,hmacKey:keys.journal};
await initializeInventory(inventoryConfig);await initializeLocalSuppressionJournal(journalConfig,new Date().toISOString());await initializeTransfer({...inventoryConfig,objects:paths.objects,key:keys.transfer});
const config={store:paths.store,anchor:paths.anchor,key:keys.custody,inventoryConfig,journalConfig,journalFactory:async c=>new LocalSuppressionJournal(c),transferKey:keys.transfer};await initializeCustody(config);const {LocalSimulatedCustody}=await import(pathToFileURL(root+'/scripts/inf03-custody-common.mjs'));const c=new LocalSimulatedCustody(config);try{await c.open();await c.publish();await c.verify();}finally{await c.close();}
owner.age='/private/tmp/pokescan-retention-20261011/tools/age';owner.identity=path.join(base,'identity.txt');const keygen=path.dirname(owner.age)+'/age-keygen';run(keygen,['-o',owner.identity]);await chmod(owner.identity,0o600);owner.recipient=(await readFile(owner.identity,'utf8')).match(/# public key: (age1\S+)/)[1];await persist();
console.log(JSON.stringify({provisioned:true,runId,migrations:names.length,sourceRows:2,ownSourceAndDestination:true,genesisExplicitlyPublished:true,age:'v1.2.1',keysNotInEvidence:true}));
