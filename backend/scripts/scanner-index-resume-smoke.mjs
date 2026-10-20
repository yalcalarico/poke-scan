/** SIGINT real y reanudación en fixtures aisladas; no es evaluación de precisión. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { referenceUrl } from './scanner-reference-url.mjs';
import { setFolderName } from './scanner-set-name.mjs';
import { expectedMetadata } from './scanner-visual-index.mjs';

const [output] = process.argv.slice(2);
if (!output || output === '--help') {
  console.log('Desde backend: node --env-file-if-exists=.env scripts/scanner-index-resume-smoke.mjs REPORTE. SIGINT real, bloqueo y reanudacion directa/por set en temporal; lee catalogo, cache sintetica, sin descargas ni cambios al indice original.');
  process.exit(output === '--help' ? 0 : 1);
}
const scripts = dirname(fileURLToPath(import.meta.url));
const root = await mkdtemp(resolve(tmpdir(),'scanner-index-resume-'));
const direct = resolve(root,'direct'), batch = resolve(root,'batch');
const prisma = new PrismaClient();
let set;
try {
  set = await prisma.cardSet.findUniqueOrThrow({where:{id:'mcd19'},select:{id:true,name:true,cards:{select:{id:true,name:true,imageLarge:true,imageSmall:true},orderBy:{id:'asc'}}}});
} finally {await prisma.$disconnect();}
assert(set.cards.length>=3 && set.cards.length<=30,'Fixture de set pequeno disponible.');
const metadata = await expectedMetadata(resolve(process.env.SCANNER_MODEL ?? '.scanner-models/dinov2-small-int8.onnx'));
const image = await sharp({create:{width:320,height:448,channels:3,background:{r:80,g:120,b:160}}}).png().toBuffer();
async function seed(dir,cards) {
  await mkdir(resolve(dir,'images'),{recursive:true});
  await writeFile(resolve(dir,'meta.json'),JSON.stringify(metadata,null,2));
  for (const card of cards) {
    const url=referenceUrl(card); assert(url,'URL de catalogo disponible.');
    const key=createHash('sha256').update(card.id+url).digest('hex');
    await writeFile(resolve(dir,'images',key+'.image'),image);
  }
}
await seed(direct,set.cards.slice(0,3));
const setDirectory=resolve(batch,setFolderName(set.name));
await seed(setDirectory,set.cards);
function launch(script,args) {
  const child=spawn(process.execPath,['--env-file-if-exists=.env',resolve(scripts,script),...args],{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  const done=new Promise((accept,reject)=>{
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Smoke excedio 60 s; revisar fixtures en '+root));},60_000);
    child.stdout.on('data',b=>stdout+=b.toString());child.stderr.on('data',b=>stderr+=b.toString());
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.once('exit',(code,signal)=>{clearTimeout(timer);accept({code,signal,stdout,stderr});});
  });
  return {child,done};
}
async function interrupt(run,pattern) {
  await new Promise((accept,reject)=>{
    let text='';
    const data=b=>{text+=b.toString();if(pattern.test(text)){run.child.stdout.off('data',data);run.child.kill('SIGINT');accept();}};
    run.child.stdout.on('data',data);
    run.done.then(result=>reject(new Error('Proceso termino antes de SIGINT: '+JSON.stringify(result))),reject);
  });
  return run.done;
}
async function entries(dir) {
  const files=(await readdir(dir)).filter(f=>f.endsWith('.jsonl'));assert.equal(files.length,1);
  const bytes=await readFile(resolve(dir,files[0]),'utf8');assert(bytes.endsWith('\n'),'JSONL completo.');
  const rows=bytes.trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(new Set(rows.map(r=>r.id)).size,rows.length,'Sin IDs duplicados.');
  for(const r of rows){assert.equal(r.vector.length,384);assert(r.vector.every(Number.isFinite));assert(Math.abs(Math.hypot(...r.vector)-1)<.001);}
  return rows;
}
async function absent(path) {await assert.rejects(access(path),{code:'ENOENT'});}
const results=[];
const ids=set.cards.slice(0,3).map(c=>c.id).join(',');
const directArgs=['index','--card-ids',ids,'--limit','3','--directory',direct];
const active=launch('scanner-visual-spike.mjs',[...directArgs,'--delay-ms','1000']);
const stopped=await interrupt(active,/1\/3:/);
assert.equal(stopped.code,130,stopped.stderr);
await absent(resolve(direct,'index.lock'));
const partial=await entries(direct);assert.equal(partial.length,1);
const summary=JSON.parse(await readFile(resolve(direct,'index-summary.json')));
assert.equal(summary.interrupted,true);assert.equal(summary.downloads,0);
const before=JSON.stringify(partial[0]);
const resumed=await launch('scanner-visual-spike.mjs',[...directArgs,'--delay-ms','0']).done;
assert.equal(resumed.code,0,resumed.stderr);
const completed=await entries(direct);assert.equal(completed.length,3);assert.equal(JSON.stringify(completed.find(r=>r.id===partial[0].id)),before);
const resumedSummary=JSON.parse(await readFile(resolve(direct,'index-summary.json')));
assert.equal(resumedSummary.completed,2);assert.equal(resumedSummary.downloads,0);
results.push({case:'direct SIGINT/resume',ok:true,interruptedExit:stopped.code,savedBeforeResume:partial.length,completedOnResume:resumedSummary.completed,total:completed.length,downloads:0});

const batchArgs=['--set',set.id,'--limit','1','--directory',batch];
const batchRun=launch('scanner-index-sets.mjs',[...batchArgs,'--delay-ms','3000']);
await new Promise((accept,reject)=>{let text='';const data=b=>{text+=b.toString();if(/1\/\d+:/.test(text)){batchRun.child.stdout.off('data',data);accept();}};batchRun.child.stdout.on('data',data);batchRun.done.then(r=>reject(new Error('Batch termino antes de la primera carta: '+r.stderr)),reject);});
const competitor=await launch('scanner-index-sets.mjs',[...batchArgs,'--delay-ms','0']).done;
assert.equal(competitor.code,1);assert(competitor.stderr.includes('EEXIST'));
const directCompetitor=await launch('scanner-visual-spike.mjs',['index','--set',set.id,'--limit','1','--directory',setDirectory]).done;
assert.equal(directCompetitor.code,1);assert(directCompetitor.stderr.includes('EEXIST'));
await access(resolve(batch,'sets-index.lock'));await access(resolve(setDirectory,'index.lock'));
batchRun.child.kill('SIGINT');const batchStop=await batchRun.done;
assert.equal(batchStop.code,130,batchStop.stderr);await absent(resolve(batch,'sets-index.lock'));await absent(resolve(setDirectory,'index.lock'));
const batchPartial=await entries(setDirectory);assert(batchPartial.length>=1 && batchPartial.length<set.cards.length);
const initialRows=new Map(batchPartial.map(r=>[r.id,JSON.stringify(r)]));
const batchResume=await launch('scanner-index-sets.mjs',[...batchArgs,'--delay-ms','0']).done;
assert.equal(batchResume.code,0,batchResume.stderr);
const all=await entries(setDirectory);assert.deepEqual(all.map(r=>r.id).sort(),set.cards.map(c=>c.id).sort());
for(const r of all)if(initialRows.has(r.id))assert.equal(JSON.stringify(r),initialRows.get(r.id));
const batchSummary=JSON.parse(await readFile(resolve(setDirectory,'index-summary.json')));assert.equal(batchSummary.downloads,0);
const skip=await launch('scanner-index-sets.mjs',[...batchArgs,'--delay-ms','0']).done;
assert.equal(skip.code,0);assert(skip.stdout.includes('set completo'));await absent(resolve(batch,'sets-index.lock'));
results.push({case:'batch SIGINT/resume/skip and exclusive lock',ok:true,interruptedExit:batchStop.code,competitorExit:competitor.code,directCompetitorExit:directCompetitor.code,savedBeforeResume:batchPartial.length,completedOnResume:batchSummary.completed,total:all.length,downloads:0});
await writeFile(resolve(output),JSON.stringify({evaluatedAt:new Date().toISOString(),scope:'SIGINT real sobre CLIs directo y por set, fixtures sinteticas cacheadas en temporal. Catalogo/modelo leidos, indice de produccion sin escritura. No mide precision ni red.',temporaryDirectory:root,setId:set.id,results},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(results,null,2));
