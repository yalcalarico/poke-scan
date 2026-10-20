/** Carga acotada del service local; no genera requests al proveedor ni persiste fotos. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { VisualIdentifyService } from '../dist/modules/cards/visual-identify.service.js';
const exec = promisify(execFile);
const [photo, output, roundsArg = '10'] = process.argv.slice(2);
if (!photo || photo === '--help' || !output) {
  console.log('Desde backend, tras pnpm run check: node --env-file-if-exists=.env scripts/scanner-load-smoke.mjs FOTO REPORTE [RONDAS=10]. Rafagas 1/2/4/8, maximo 50 rondas; service y DINOv2 reales sin HTTP/DB.');
  process.exit(photo === '--help' ? 0 : 1);
}
const rounds = Number(roundsArg);
assert(Number.isInteger(rounds) && rounds >= 1 && rounds <= 50, 'Rondas entre 1 y 50.');
assert.notEqual(resolve(photo), resolve(output), 'El reporte no puede reemplazar la foto.');
const bytes = await readFile(photo);
assert(bytes.length > 0 && bytes.length <= 6 * 1024 * 1024, 'Foto de hasta 6 MiB.');
const dto = {image:`data:image/png;base64,${bytes.toString('base64')}`};
process.env.SCANNER_VISUAL_ENABLED = '1';
const service = new VisualIdentifyService();
const rows = [], resources = [];
let ranking, pid;
const percentile = (values,p) => values.length ? [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1] : null;
const timing = values => ({n:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99)});
async function query(concurrency, round) {
  const started = performance.now();
  try {
    const result = await service.identify(dto);
    const ids = result.candidates.map(c=>c.id);
    if (ranking) assert.deepEqual(ids,ranking); else ranking=ids;
    return {concurrency,round,ok:true,cold:result.cold,latencyMs:performance.now()-started,inferenceMs:result.inferenceMs,indexVersion:result.indexVersion,references:result.references};
  } catch (error) {
    if (error.getStatus?.() !== 503 || !error.message.includes('ocupado')) throw error;
    return {concurrency,round,ok:false,status:503,reason:'busy',latencyMs:performance.now()-started};
  }
}
async function sample(concurrency,round) {
  const child = Reflect.get(service,'child');
  assert(child?.connected && child.pid, 'Worker disponible.');
  if (pid) assert.equal(child.pid,pid,'El worker no debe reiniciarse bajo esta carga.');
  else pid=child.pid;
  const listeners = Object.fromEntries(['message','exit','error','disconnect'].map(event=>[event,child.listenerCount(event)]));
  assert.deepEqual(listeners,{message:0,exit:1,error:1,disconnect:1},'Listeners estables entre consultas.');
  const {stdout}=await exec('/bin/ps',['-o','rss=','-p',String(child.pid)]);
  const workerRssKiB=Number(stdout.trim());
  assert(Number.isFinite(workerRssKiB) && workerRssKiB>0,'RSS del worker disponible.');
  resources.push({concurrency,round,workerRssKiB,parentRssBytes:process.memoryUsage().rss,listeners});
}
const groups=[];
try {
  rows.push(await query(1,-1));
  await sample(1,-1);
  for (const concurrency of [1,2,4,8]) {
    const start=performance.now();
    for(let round=0;round<rounds;round++) {
      const batch=await Promise.all(Array.from({length:concurrency},()=>query(concurrency,round)));
      assert.equal(batch.filter(r=>r.ok).length,1,'Una admision por rafaga.');
      assert.equal(batch.filter(r=>!r.ok).length,concurrency-1,'Resto rechazado sin cola.');
      rows.push(...batch); await sample(concurrency,round);
    }
    const elapsedMs=performance.now()-start;
    const batch=rows.filter(r=>r.concurrency===concurrency && r.round>=0);
    const success=batch.filter(r=>r.ok), busy=batch.filter(r=>!r.ok);
    groups.push({concurrency,rounds,requests:batch.length,accepted:success.length,busy:busy.length,rejectionRate:busy.length/batch.length,elapsedMs,acceptedPerSecond:success.length*1000/elapsedMs,successTiming:timing(success.map(r=>r.latencyMs)),busyTiming:timing(busy.map(r=>r.latencyMs))});
    console.log(`PASS concurrencia ${concurrency}: ${success.length} exitos, ${busy.length} ocupados`);
  }
  const recovery=await query(1,-2); assert(recovery.ok); rows.push(recovery); await sample(1,-2);
  await writeFile(resolve(output),JSON.stringify({evaluatedAt:new Date().toISOString(),scope:'Carga local acotada sobre service compilado y DINOv2 reales. Una foto repetida; sin HTTP/auth/red/camara/DB. RSS observado al finalizar cada rafaga, no pico continuo. Sin certificacion de estabilidad prolongada.',productionReady:false,photoHash:createHash('sha256').update(bytes).digest('hex'),groups,coldTiming:timing(rows.filter(r=>r.ok&&r.cold).map(r=>r.latencyMs)),warmTiming:timing(rows.filter(r=>r.ok&&!r.cold).map(r=>r.latencyMs)),resources,rows},null,2)+'\n',{flag:'wx'});
  console.log('PASS consulta posterior, worker unico y listeners estables');
} finally {service.onModuleDestroy();}
