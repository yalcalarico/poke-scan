/** Corrida prolongada del service real en procesos propios, sin HTTP ni DB. */
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { VisualIdentifyService } from '../dist/modules/cards/visual-identify.service.js';
const exec=promisify(execFile);
const [manifestPath,output,minutesArg='10']=process.argv.slice(2);
if(!manifestPath||!output||manifestPath==='--help'){
 console.log('Desde backend tras check: node --env-file-if-exists=.env scripts/scanner-soak-smoke.mjs MANIFIESTO REPORTE [MINUTOS=10]. Manifiesto [{path}], maximo 30 min; 5 consultas cada ~5 s, SIGKILL propio a mitad, RSS y progreso cada 30 s. Sin HTTP/DB ni descargas.');process.exit(manifestPath==='--help'?0:1);
}
const minutes=Number(minutesArg);assert(Number.isFinite(minutes)&&minutes>=1&&minutes<=30,'Duracion entre 1 y 30 minutos.');
assert.notEqual(resolve(manifestPath),resolve(output));
try{await access(output);throw new Error('El reporte ya existe.');}catch(error){if(error.code!=='ENOENT')throw error;}
const queries=JSON.parse(await readFile(manifestPath));assert(Array.isArray(queries)&&queries.length>0&&queries.length<=20);
const photos=[];
for(const q of queries){assert(typeof q.path==='string');const bytes=await readFile(resolve(q.path));assert(bytes.length>0&&bytes.length<=6*1024*1024);photos.push({hash:createHash('sha256').update(bytes).digest('hex'),dto:{image:'data:image/png;base64,'+bytes.toString('base64')}});}
process.env.SCANNER_VISUAL_ENABLED='1';
const service=new VisualIdentifyService();
const rows=[],resources=[],events=[],baseline=new Map();
const started=performance.now(), duration=minutes*60000;
let phase=0,restarted=false,lastProgress=0,sequence=0;
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]:null;
const timing=values=>({n:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99)});
const child=()=>{const c=Reflect.get(service,'child');assert(c?.connected&&c.pid);return c;};
async function query(){
 const sample=sequence++%photos.length,start=performance.now();
 const r=await service.identify(photos[sample].dto);
 const ranking=r.candidates.map(c=>c.id);
 if(baseline.has(sample))assert.deepEqual(ranking,baseline.get(sample),'Ranking reproducible por foto.');else baseline.set(sample,ranking);
 rows.push({phase,sample,elapsedMs:performance.now()-started,cold:r.cold,latencyMs:performance.now()-start,references:r.references,indexVersion:r.indexVersion});
}
async function memory(){
 const c=child(),listeners=Object.fromEntries(['message','exit','error','disconnect'].map(e=>[e,c.listenerCount(e)]));
 assert.deepEqual(listeners,{message:0,exit:1,error:1,disconnect:1});
 const {stdout}=await exec('/bin/ps',['-o','rss=','-p',String(c.pid)]);
 const workerRssMiB=Number(stdout.trim())/1024;assert(Number.isFinite(workerRssMiB)&&workerRssMiB>0);
 resources.push({phase,elapsedMs:performance.now()-started,pid:c.pid,workerRssMiB,parentRssMiB:process.memoryUsage().rss/1024/1024,listeners});
}
function resourceSummary(phase){
 const samples=resources.filter(r=>r.phase===phase);if(!samples.length)return null;
 const origin=samples[0].elapsedMs;
 const steady=samples.filter(r=>r.elapsedMs-origin>=60000);
 const x=steady.map(r=>(r.elapsedMs-origin)/60000),y=steady.map(r=>r.workerRssMiB);
 const xm=x.reduce((a,b)=>a+b,0)/(x.length||1),ym=y.reduce((a,b)=>a+b,0)/(y.length||1);
 const denominator=x.reduce((a,v)=>a+(v-xm)**2,0);
 const slope=denominator?x.reduce((a,v,i)=>a+(v-xm)*(y[i]-ym),0)/denominator:null;
 return {samples:samples.length,pids:[...new Set(samples.map(r=>r.pid))],startMiB:samples[0].workerRssMiB,endMiB:samples.at(-1).workerRssMiB,minMiB:Math.min(...samples.map(r=>r.workerRssMiB)),maxObservedMiB:Math.max(...samples.map(r=>r.workerRssMiB)),afterFirstMinuteSamples:steady.length,linearTrendMiBPerMinute:slope};
}
let status='passed',failure;
try{
 while(performance.now()-started<duration){
  const cycle=performance.now();
  if(!restarted&&cycle-started>=duration/2){
   const old=child();const pending=assert.rejects(service.identify(photos[0].dto),/interrumpió/);
   old.kill('SIGKILL');await pending;
   events.push({type:'expected-interruption',elapsedMs:performance.now()-started,pid:old.pid});
   restarted=true;phase=1;await query();assert(rows.at(-1).cold);assert.notEqual(child().pid,old.pid);
   events.push({type:'recovery',elapsedMs:performance.now()-started,pid:child().pid});
  }
  for(let i=0;i<5;i++)await query();
  await memory();
  const elapsed=performance.now()-started;
  if(elapsed-lastProgress>=30000){lastProgress=elapsed;console.log(JSON.stringify({elapsedSeconds:Math.round(elapsed/1000),successfulQueries:rows.length,phase,rssMiB:resources.at(-1).workerRssMiB,maxObservedMiB:Math.max(...resources.filter(r=>r.phase===phase).map(r=>r.workerRssMiB))}));}
  await delay(Math.min(Math.max(0,5000-(performance.now()-cycle)),Math.max(0,duration-(performance.now()-started))));
 }
 assert(restarted,'Interrupcion y recuperacion ejercitadas.');
 await query();await memory();
 for(const p of [0,1])assert.equal(new Set(resources.filter(r=>r.phase===p).map(r=>r.pid)).size,1,'Un worker por fase.');
}catch(error){status='failed';failure=error.message;process.exitCode=1;}
finally{
 service.onModuleDestroy();
 const report={evaluatedAt:new Date().toISOString(),status,failure,durationRequestedMinutes:minutes,elapsedMs:performance.now()-started,scope:'Service compilado y DINOv2 reales, 5 consultas por ciclo de 5 s con pausas. Fotos repetidas, RSS observado entre ciclos, SIGKILL en proceso propio a mitad. Sin HTTP/DB/red/camara ni certificacion de precision o ausencia de fuga.',productionReady:false,photoHashes:photos.map(p=>p.hash),successfulQueries:rows.length,expectedInterruptions:events.filter(e=>e.type==='expected-interruption').length,coldTiming:timing(rows.filter(r=>r.cold).map(r=>r.latencyMs)),warmTiming:timing(rows.filter(r=>!r.cold).map(r=>r.latencyMs)),resourcesByPhase:[resourceSummary(0),resourceSummary(1)],events,resources,rows};
 await writeFile(resolve(output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status,successfulQueries:rows.length,elapsedSeconds:Math.round(report.elapsedMs/1000),resourcesByPhase:report.resourcesByPhase,warmTiming:report.warmTiming}));
}
