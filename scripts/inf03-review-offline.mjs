#!/usr/bin/env node
/** Checks reales locales sin descargas; no reemplazan el roundtrip autenticado age. */
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, chmod, writeFile, readFile, rm, mkdir, symlink, stat, open } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { IMAGE, LIMIT, run, sha, pgpassText, safePath, safeDirectory, sql, assertResource, assertDatabase, streamToFile, migrations, migrationRecords, schemaFingerprint, unpack, containerStage, cleanupStage } from './inf03-common.mjs';
process.umask(0o077);
const runId=`inf03-${randomBytes(6).toString('hex')}`;
const projectDir=await mkdtemp(path.join(os.tmpdir(),`${runId}-offline-`));await chmod(projectDir,0o700);
const report={runId,kind:'offline-postgresql-filesystem-only',startedAt:new Date().toISOString(),checks:[],cryptoAgeTested:false,resources:[],cleanup:{errors:[]}};
const objects=[];
const checked=(name)=>report.checks.push(name);
const rejected=async(name,fn)=>{let rejection=false;try{await fn();}catch{rejection=true;}if(!rejection)throw new Error(`Caso ${name} no rechazado.`);checked(name);};
const snapshot=()=>run('docker',['ps','--format','{{json .}}']).trim().split('\n').filter(Boolean).map(JSON.parse).filter((c)=>/^pokemon-scanner-(db|redis)$/.test(c.Names)).map((c)=>({name:c.Names,id:c.ID,status:c.Status})).sort((a,b)=>a.name.localeCompare(b.name));
try {
  report.sharedBefore=snapshot();
  if(report.sharedBefore.length!==2||report.sharedBefore.some((c)=>!c.status.includes('healthy')))throw new Error('Stack compartido inesperado.');
  report.tooling={node:process.version,pnpm:run('pnpm',['--version']).trim(),platform:process.platform,arch:process.arch,image:IMAGE,imageId:JSON.parse(run('docker',['image','inspect',IMAGE,'--format','{{json .}}'])).Id};
  await rejected('pgpass-rejects-CRLF',()=>pgpassText('inf03_source','inf03_source','invalid\r\npassword'));
  const sparse=path.join(projectDir,'oversize');const handle=await open(sparse,'wx',0o600);await handle.truncate(LIMIT+1);await handle.close();
  await rejected('file-size-bound',()=>safePath(sparse));await rm(sparse);
  const parentAlias=path.join(projectDir,'alias');await symlink(projectDir,parentAlias);
  await rejected('parent-symlink',()=>safeDirectory(parentAlias));
  const payload=path.join(projectDir,'tar-stage');await mkdir(payload,{mode:0o700});
  await writeFile(path.join(payload,'manifest.json'),'{}',{mode:0o644});await writeFile(path.join(payload,'database.dump'),'synthetic',{mode:0o644});
  const tar=path.join(projectDir,'valid.tar');run('tar',['--format','ustar','-cf',tar,'-C',payload,'manifest.json','database.dump']);
  const dest=path.join(projectDir,'unpacked');await mkdir(dest,{mode:0o700});await unpack(tar,dest);
  if((await stat(path.join(dest,'manifest.json'))).mode%512!==0o600||(await stat(path.join(dest,'database.dump'))).mode%512!==0o600)throw new Error('Permisos plaintext inválidos.');checked('tar-imposes-0600-from-0644');
  const original=await readFile(tar);
  for(const name of ['traversal','absolute','duplicate','hardlink','oversize-entry','truncated-tar']){
    let bad=Buffer.from(original);
    if(name==='truncated-tar') bad=bad.subarray(0,bad.length-1);
    else {
      const header=name==='duplicate'?bad.subarray(1024,1536):bad.subarray(0,512);
      if(name==='traversal'||name==='absolute'||name==='duplicate'){header.fill(0,0,100);header.write(name==='traversal'?'../manifest.json':name==='absolute'?'/tmp/manifest.json':'manifest.json',0);}
      if(name==='hardlink'){header[156]=49;header.write('manifest.json',157);}
      if(name==='oversize-entry')header.write('77777777777\0',124);
      header.fill(32,148,156);const sum=header.reduce((n,b)=>n+b,0);header.write(sum.toString(8).padStart(6,'0')+'\0 ',148);
    }
    const badPath=path.join(projectDir,`${name}.tar`);await writeFile(badPath,bad,{mode:0o600});
    const empty=path.join(projectDir,`reject-${name}`);await mkdir(empty,{mode:0o700});
    await rejected(`tar-${name}`,()=>unpack(badPath,empty));
    if((await (await import('node:fs/promises')).readdir(empty)).length)throw new Error('Tar inválido escribió plaintext.');
  }
  async function postgres(role){
    const network=`${runId}-${role}-net`,volume=`${runId}-${role}-pgdata`,container=`${runId}-${role}-pg`;
    for(const [kind,name]of[['network',network],['volume',volume]]){
      run('docker',[kind,'create',...(kind==='network'?['--internal']:[]),'--label',`com.pokescan.inf03.run=${runId}`,'--label',`com.pokescan.inf03.role=${role}`,name]);objects.push({kind,name});report.resources.push({kind,name,role});
    }
    run('docker',['run','-d','--name',container,'--network',network,'--label',`com.pokescan.inf03.run=${runId}`,'--label',`com.pokescan.inf03.role=${role}`,'--label','com.pokescan.inf03.project=pokemon-cards-scanner-app','--mount',`type=volume,source=${volume},target=/var/lib/postgresql/data`,'--env','POSTGRES_PASSWORD=ephemeral-bootstrap-only',IMAGE]);
    objects.push({kind:'container',name:container,id:run('docker',['inspect','--format','{{.Id}}',container]).trim()});report.resources.push({kind:'container',name:container,role});
    let ready=false;const until=Date.now()+45_000;
    while(Date.now()<until){const health=spawnSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],{timeout:5000,encoding:'utf8'});if(health.status===0){ready=true;break;}await new Promise((r)=>setTimeout(r,400));}
    if(!ready)throw new Error('Postgres no listo.');
    const database=`inf03_${role}`,user=database,password=randomBytes(24).toString('hex')+':\\test',marker=`${runId}-${role}-fresh`;
    sql(container,'postgres',`CREATE ROLE ${user} LOGIN PASSWORD E'${password.replaceAll('\\','\\\\')}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; CREATE DATABASE ${database} OWNER ${user}; COMMENT ON DATABASE ${database} IS '${marker}';`);
    const id=assertResource(runId,container,role);assertDatabase(container,database,user,marker,true);checked(`${role}-ownership-isolation-role-version`);
    return{container,database,user,password,marker,id,network,volume};
  }
  const source=await postgres('source'),target=await postgres('destination');
  sql(target.container,target.database,`COMMENT ON DATABASE ${target.database} IS 'wrong';`);
  await rejected('actual-marker-mismatch',()=>assertDatabase(target.container,target.database,target.user,target.marker,true));
  sql(target.container,target.database,`COMMENT ON DATABASE ${target.database} IS '${target.marker}';`);
  sql(target.container,target.database,`ALTER ROLE ${target.user} CREATEDB;`);
  await rejected('privileged-role',()=>assertDatabase(target.container,target.database,target.user,target.marker,true));sql(target.container,target.database,`ALTER ROLE ${target.user} NOCREATEDB;`);
  sql(target.container,target.database,'CREATE TABLE public.guard(id integer);');
  await rejected('occupied-target',()=>assertDatabase(target.container,target.database,target.user,target.marker,true));sql(target.container,target.database,'DROP TABLE public.guard;');
  run('docker',['network','connect',source.network,target.container]);await rejected('multiple-networks',()=>assertResource(runId,target.container,'destination'));run('docker',['network','disconnect',source.network,target.container]);
  const shared=`${runId}-shadow`;
  run('docker',['run','-d','--name',shared,'--network','none','--label',`com.pokescan.inf03.run=${runId}`,'--mount',`type=volume,source=${target.volume},target=/var/lib/postgresql/data`,'--entrypoint','sleep',IMAGE,'120']);
  objects.push({kind:'container',name:shared,id:run('docker',['inspect','--format','{{.Id}}',shared]).trim()});report.resources.push({kind:'container',name:shared,role:'shadow'});
  await rejected('shared-volume',()=>assertResource(runId,target.container,'destination'));run('docker',['rm','--force',shared]);objects.splice(objects.findIndex((item)=>item.name===shared),1);
  const migrationList=await migrations();
  sql(source.container,source.database,'CREATE TABLE "_prisma_migrations" (id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL, finished_at timestamp(3), migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamp(3), started_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, applied_steps_count integer NOT NULL DEFAULT 0);',source.user);
  for(const migration of migrationList){sql(source.container,source.database,await readFile(path.join('backend/prisma/migrations',migration.name,'migration.sql'),'utf8'),source.user);sql(source.container,source.database,`INSERT INTO "_prisma_migrations"(id,checksum,finished_at,migration_name,applied_steps_count) VALUES ('${randomUUID()}','${migration.checksum}',now(),'${migration.name}',1);`,source.user);}
  const fingerprint=schemaFingerprint(source.container,source.database,source.user);
  const passFile=path.join(projectDir,'pgpass');await writeFile(passFile,pgpassText(source.database,source.user,source.password),{mode:0o600});
  const sourceStage=`/tmp/${runId}-backup-${randomUUID()}`;
  const dump=path.join(projectDir,'database.dump');
  try{await containerStage(source.container,sourceStage,passFile);await streamToFile('docker',['exec','-e',`PGPASSFILE=${sourceStage}/pgpass`,source.container,'pg_dump','-h','localhost','-U',source.user,'-d',source.database,'-Fc','--no-owner','--no-acl','--no-password'],dump);}finally{cleanupStage(source.container,source.id,sourceStage);}
  checked('real-pgpass-colon-backslash-pg-dump');
  await writeFile(passFile,pgpassText(target.database,target.user,target.password),{mode:0o600});
  const dumpData=await readFile(dump),brokenDump=path.join(projectDir,'broken.dump');await writeFile(brokenDump,dumpData.subarray(0,dumpData.length-100),{mode:0o600});
  const targetStage=`/tmp/${runId}-restore-${randomUUID()}`;
  try{await containerStage(target.container,targetStage,passFile,brokenDump);await rejected('real-pg-restore-transaction-failure',()=>run('docker',['exec','-e',`PGPASSFILE=${targetStage}/pgpass`,target.container,'pg_restore','-h','localhost','-U',target.user,'-d',target.database,'--single-transaction','--no-owner','--no-acl','--exit-on-error','--no-password',`${targetStage}/database.dump`]));assertDatabase(target.container,target.database,target.user,target.marker,true);checked('sql-failure-leaves-destination-empty');}finally{cleanupStage(target.container,target.id,targetStage);}
  const positiveStage=`/tmp/${runId}-restore-${randomUUID()}`;
  try{await containerStage(target.container,positiveStage,passFile,dump);run('docker',['exec','-e',`PGPASSFILE=${positiveStage}/pgpass`,target.container,'pg_restore','-h','localhost','-U',target.user,'-d',target.database,'--single-transaction','--no-owner','--no-acl','--exit-on-error','--no-password',`${positiveStage}/database.dump`]);}finally{cleanupStage(target.container,target.id,positiveStage);}
  if(schemaFingerprint(target.container,target.database,target.user)!==fingerprint||JSON.stringify(migrationRecords(target.container,target.database,target.user))!==JSON.stringify(migrationList))throw new Error('Schema/migraciones distintos.');checked('real-schema-columns-constraints-indexes-migration-checksums-roundtrip');
  report.schemaFingerprint=fingerprint;report.migrations=migrationList.length;
  report.constraintsPublic=Number(sql(target.container,target.database,"SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype IN ('p','u','f') AND c.convalidated;",target.user).trim());
  report.pgTrgm=sql(target.container,target.database,"SELECT extversion FROM pg_extension WHERE extname='pg_trgm';",target.user).trim();
  report.postgresVersion=sql(target.container,target.database,'SHOW server_version;').trim();
  report.pgDumpVersion=run('docker',['exec',source.container,'pg_dump','--version']).trim();report.pgRestoreVersion=run('docker',['exec',target.container,'pg_restore','--version']).trim();
  for(const db of[source,target])if(run('docker',['exec',db.container,'find','/tmp','-maxdepth','1','-name',`${runId}-*`]).trim())throw new Error('Staging interno no limpiado.');checked('internal-plaintext-removed-success-and-failure');
  report.status='passed';
}catch(error){report.status='failed';report.error=error.message;}
finally{
  for(const item of [...objects].sort((a,b)=>(a.kind==='container'?0:a.kind==='network'?1:2)-(b.kind==='container'?0:b.kind==='network'?1:2))){
    const inspect=spawnSync('docker',[...(item.kind==='container'?[]:[item.kind]),'inspect','--format',item.kind==='container'?'{{json .Config.Labels}}':'{{json .Labels}}',item.name],{encoding:'utf8',timeout:15000});
    if(inspect.status===0){try{if(JSON.parse(inspect.stdout)['com.pokescan.inf03.run']!==runId)throw new Error('Propiedad cambió.');if(item.id&&run('docker',['inspect','--format','{{.Id}}',item.name]).trim()!==item.id)throw new Error('Identidad cambió.');run('docker',[...(item.kind==='container'?[]:[item.kind]),'rm',...(item.kind==='container'?['--force']:[]),item.name]);}catch{report.cleanup.errors.push(item.name);}}
    else if(!/no such/i.test(String(inspect.stderr))) report.cleanup.errors.push(`No se pudo verificar ${item.name}`);
  }
  report.cleanup.remaining=objects.filter((item)=>spawnSync('docker',[...(item.kind==='container'?[]:[item.kind]),'inspect',item.name],{encoding:'utf8',timeout:15000}).status===0).map((item)=>item.name);
  try{report.sharedAfter=snapshot();if(JSON.stringify(report.sharedBefore.map(({name,id})=>({name,id})))!==JSON.stringify(report.sharedAfter.map(({name,id})=>({name,id}))))throw new Error();}catch{report.cleanup.errors.push('Snapshot compartido no comprobado.');}
  report.cleanup.complete=!report.cleanup.errors.length&&!report.cleanup.remaining.length;
  if(report.cleanup.complete){await rm(projectDir,{recursive:true,force:true});report.cleanup.hostTemporaryRemoved=true;}else report.cleanup.preservedPrivateContext=projectDir;
  report.endedAt=new Date().toISOString();report.durationMs=Date.parse(report.endedAt)-Date.parse(report.startedAt);
  await writeFile('docs/plans/lanzamiento-2026-10-07/RESULTADOS/INF-03-offline-evidencia.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
}
process.stdout.write(JSON.stringify({runId,status:report.status,checks:report.checks.length,cleanup:report.cleanup.complete,cryptoAgeTested:false,error:report.error})+'\n');
if(report.status!=='passed'||!report.cleanup.complete)process.exitCode=1;
