import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';

export const COUNTERS = ['scanner_http_requests','scanner_http_2xx','scanner_http_3xx','scanner_http_4xx','scanner_http_5xx','scanner_http_401','scanner_http_400','scanner_http_503','scanner_http_aborted','inference_started','inference_completed','inference_failed','admission_busy','admission_unavailable','admission_cancelled','admission_disabled','admission_invalid','warmup_ready','warmup_failed'];
export const HISTOGRAMS = ['scanner_http_duration_ms','worker_duration_ms','inference_duration_ms','index_duration_ms','model_duration_ms','cold_model_duration_ms','warmup_duration_ms'];
const bounds = [10,50,100,250,500,1000,5000,30000];
const obj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const timestamp = (v) => utcTimestamp(v);
export function assertLocalBase(raw) {
  let u; try { u = new URL(raw); } catch { throw new Error('URL local inválida.'); }
  const hosts = new Set(['localhost','127.0.0.1','::1','[::1]']);
  if (!['http:','https:'].includes(u.protocol) || !hosts.has(u.hostname.toLowerCase()) || u.username || u.password || u.search || u.hash || !['','/'].includes(u.pathname)) throw new Error('La URL debe ser loopback, sin credenciales, ruta ni query.');
  return u.origin;
}
export async function requestJson(url, token, timeoutMs=3000, maxBytes=262144, fetchImpl=fetch, externalSignal) {
  const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(), timeoutMs);
  const abort=()=>controller.abort();externalSignal?.addEventListener('abort',abort,{once:true});if(externalSignal?.aborted)abort();
  try {
    const response = await fetchImpl(url,{headers: token ? {'X-Metrics-Token':token} : {},signal:controller.signal,redirect:'manual'});
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); return { status: response.status, value: null, transport: 'redirect' }; }
    const reader = response.body?.getReader(); if (!reader) return {status:response.status,value:null,transport:'body'};
    let size=0, chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();return {status:response.status,value:null,transport:'body_limit'};}chunks.push(value);}
    let value=null; try { value=JSON.parse(new TextDecoder().decode(Buffer.concat(chunks.map(x=>Buffer.from(x))))); } catch { return {status:response.status,value:null,transport:'json'}; }
    return {status:response.status,value,transport:null};
  } catch { return {status:0,value:null,transport:externalSignal?.aborted?'cancelled':'unreachable'}; } finally { clearTimeout(timer);externalSignal?.removeEventListener('abort',abort); }
}
export function validateHealth(v) { return obj(v)&&v.status==='ok'&&typeof v.degraded==='boolean'&&obj(v.detail)&&obj(v.detail.redis)&&typeof v.detail.redis.configured==='boolean'&&typeof v.detail.redis.available==='boolean'&&[null,'string'].includes(v.detail.redis.degradedSince===null?null:typeof v.detail.redis.degradedSince)&&[null,'string'].includes(v.detail.redis.lastErrorAt===null?null:typeof v.detail.redis.lastErrorAt); }
export function validateReady(v) { return obj(v)&&['ready','not_ready'].includes(v.status)&&typeof v.degraded==='boolean'&&obj(v.detail)&&obj(v.detail.database)&&['ready','unavailable'].includes(v.detail.database.state)&&obj(v.detail.scanner)&&['disabled','initializing','ready','unavailable','incompatible'].includes(v.detail.scanner.state)&&typeof v.detail.scanner.busy==='boolean'&&obj(v.detail.redis)&&['disabled','ready','degraded'].includes(v.detail.redis.state); }
export function validateMetrics(v) {
  if(!exactKeys(v,['generatedAt','processStartedAt','metrics','scanner','queue','redis'])||!timestamp(v.generatedAt)||!timestamp(v.processStartedAt)||!exactKeys(v.metrics,['since','counters','histograms'])||!timestamp(v.metrics.since)||!obj(v.metrics.counters)||!obj(v.metrics.histograms)||!exactKeys(v.scanner,['state','busy'])||!['disabled','initializing','ready','unavailable','incompatible'].includes(v.scanner.state)||typeof v.scanner.busy!=='boolean'||!exactKeys(v.redis,['configured','available','degradedSince','lastErrorAt'])||typeof v.redis.configured!=='boolean'||typeof v.redis.available!=='boolean'||!(v.redis.degradedSince===null||timestamp(v.redis.degradedSince))||!(v.redis.lastErrorAt===null||timestamp(v.redis.lastErrorAt))||!obj(v.queue)) return false;
  if(COUNTERS.some(k=>!finite(v.metrics.counters[k]))||Object.keys(v.metrics.counters).some(k=>!COUNTERS.includes(k))||Object.keys(v.metrics.histograms).some(k=>!HISTOGRAMS.includes(k))) return false;
  for(const h of Object.values(v.metrics.histograms)){if(!exactKeys(h,['count','sumMs','boundsMs','buckets'])||!finite(h.count)||!finite(h.sumMs)||!Array.isArray(h.boundsMs)||h.boundsMs.length!==8||h.boundsMs.some((x,i)=>x!==bounds[i])||!Array.isArray(h.buckets)||h.buckets.length!==9||h.buckets.some(x=>!finite(x)))return false;}
  if(v.queue.state==='available'){if(!timestamp(v.queue.sampledAt)||!exactKeys(v.queue,['state','sampledAt','statuses'])||!exactKeys(v.queue.statuses,['pending','processing']))return false;for(const s of ['pending','processing']){const x=v.queue.statuses[s];if(!exactKeys(x,['count','oldestAgeMs','retries'])||!finite(x.count)||!finite(x.retries)||!(x.oldestAgeMs===null||finite(x.oldestAgeMs)))return false;}}
  return v.queue.state==='unavailable'?exactKeys(v.queue,['state']):v.queue.state==='available';
}
export function safeSnapshot(health,ready,metrics,host,feeds) { return {observedAt:new Date().toISOString(),health:health??{state:'unknown'},readiness:ready??{state:'unknown'},metrics:metrics??{state:'unknown'},host:host??{state:'unavailable'},feeds:feeds??{backup:'unknown',feed:'unknown'}}; }
export function makeEvents(sample, previous, options={}) {
  const issues={};
  if(sample.health.state!=='unknown')issues.api_unreachable=sample.health.state==='unreachable';
  if(['ready','not_ready'].includes(sample.readiness.state))issues.readiness_not_ready=sample.readiness.state==='not_ready';
  if(sample.readiness.database)issues.database_unavailable=sample.readiness.database==='unavailable';
  if(['unavailable','incompatible','ready','disabled'].includes(sample.readiness.scanner))issues.scanner_unavailable=['unavailable','incompatible'].includes(sample.readiness.scanner);
  if(sample.readiness.redis)issues.redis_degraded=sample.readiness.redis==='degraded';
  if(sample.metrics.state!=='unknown')issues.metrics_disabled=sample.metrics.state==='disabled';
  if(['available','queue_unavailable'].includes(sample.metrics.state))issues.query_queue_unavailable=sample.metrics.state==='queue_unavailable';
  if(sample.feeds.backup!=='unknown')issues.backup_failed=sample.feeds.backup==='failed';
  if(sample.feeds.feed!=='unknown')issues.feed_failed=sample.feeds.feed==='failed';
  const m=sample.metrics.snapshot, p=previous?.metrics?.snapshot;
  if(m&&p){
    const keys=COUNTERS;const d={};for(const k of keys)d[k]=m.countersCumulative[k]-p.countersCumulative[k];
    const sameEpoch=m.processStartedAt===p.processStartedAt&&m.since===p.since;
    const histogramsValid=Object.entries(m.histogramsCumulative).every(([name,h])=>{const old=p.histogramsCumulative[name];return !old||(h.count>=old.count&&h.sumMs>=old.sumMs);});
    if(!sameEpoch||Object.values(d).some(x=>x<0)||!histogramsValid) issues.counter_window_reset=true;
    if(sameEpoch&&Object.values(d).every(x=>x>=0)&&histogramsValid){
      issues.counter_window_reset=false;
      const deltaHistogram={};for(const [name,h] of Object.entries(m.histogramsCumulative)){const old=p.histogramsCumulative[name];if(old&&h.count>=old.count&&h.sumMs>=old.sumMs){const count=h.count-old.count,sumMs=h.sumMs-old.sumMs;deltaHistogram[name]={count,sumMs,meanMs:count?sumMs/count:null};}}
      Object.defineProperty(issues,'metrics_delta',{value:{fromGeneratedAt:p.generatedAt,toGeneratedAt:m.generatedAt,counters:d,histograms:deltaHistogram},enumerable:false});
    }
    if(sameEpoch&&Object.values(d).every(x=>x>=0)&&histogramsValid){const admissions=d.admission_busy+d.admission_unavailable+d.admission_cancelled+d.admission_disabled+d.admission_invalid+d.inference_started;const inferenceDone=d.inference_failed+d.inference_completed;if(admissions>=options.minSamples&&options.busyRate!==undefined)issues.busy_rate=d.admission_busy/admissions>options.busyRate;if(inferenceDone>=options.minSamples&&options.errorRate!==undefined)issues.error_rate=d.inference_failed/inferenceDone>options.errorRate;}
  }
  if(m?.queue?.state==='available'){const statuses=m.queue.statuses,total=statuses.pending.count+statuses.processing.count,ages=[statuses.pending.oldestAgeMs,statuses.processing.oldestAgeMs].filter(x=>x!==null);if(options.maxQueueDepth!==undefined)issues.queue_depth=total>options.maxQueueDepth;if(options.maxQueueAgeMs!==undefined)issues.queue_age=ages.some(age=>age>options.maxQueueAgeMs);}
  return issues;
}
export function transitionAlerts(previousState, issues, debounce=2) {
  const next={}, events=[];const codes=new Set([...Object.keys(previousState??{}),...Object.keys(issues)]);
  for(const code of codes){const old=previousState?.[code]??{active:false,bad:0,good:0};if(!Object.hasOwn(issues,code)){next[code]={...old,bad:0,good:0};continue;}const bad=Boolean(issues[code]);const state={active:old.active,bad:bad?old.bad+1:0,good:bad?0:old.good+1};if(!old.active&&state.bad>=debounce){state.active=true;events.push({event:'triggered',code});}else if(old.active&&!bad&&state.good>=debounce){state.active=false;events.push({event:'recovered',code});}next[code]=state;}
  return {state:next,events};
}
export async function localFeed(file) {
  if(!file)return 'unknown';
  let handle;try {handle=await open(file,constants.O_RDONLY|constants.O_NONBLOCK);const info=await handle.stat();if(!info.isFile()||info.size>8192)return 'unknown';const buffer=Buffer.alloc(8193);const {bytesRead}=await handle.read(buffer,0,buffer.length,0);if(bytesRead>8192)return 'unknown';const v=JSON.parse(buffer.subarray(0,bytesRead).toString('utf8'));if(!exactKeys(v,['checkedAt','status'])||!utcTimestamp(v.checkedAt)||Date.parse(v.checkedAt)>Date.now()||!['ok','failed'].includes(v.status))return 'unknown';return v.status;}catch{return 'unknown';}finally{await handle?.close().catch(()=>{});}
}
const exactKeys=(v,keys)=>obj(v)&&Object.keys(v).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(v,k));
const utcTimestamp=(v)=>{
 if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)||!Number.isFinite(Date.parse(v)))return false;
 const canonical=v.includes('.')?v.replace(/\.(\d{1,3})Z$/,(_,ms)=>'.'+ms.padEnd(3,'0')+'Z'):v.replace(/Z$/,'.000Z');
 return new Date(v).toISOString()===canonical;
};
export function hostMetrics(pid) { if(pid===undefined)return {state:'unconfigured'};if(!/^\d{1,10}$/.test(String(pid))||Number(pid)<=0)return {state:'invalid'};try{const r=spawnSync('ps',['-o','rss=,%cpu=','-p',String(pid)],{encoding:'utf8',timeout:1000});const m=r.stdout.trim().match(/^(\d+)\s+(\d+(?:\.\d+)?)$/);return r.status===0&&m?{state:'available',rssKb:Number(m[1]),cpuPercent:Number(m[2])}:{state:'unavailable'};}catch{return {state:'unavailable'};} }
