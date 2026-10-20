import os,subprocess,json,time,secrets,urllib.request,urllib.error,concurrent.futures,signal
from pathlib import Path
p=Path('/private/tmp/pokescan-be06-20261011');root=Path('/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app');o=json.loads((p/'db-owner.json').read_text());secret=secrets.token_hex(32);env=os.environ.copy();env.update(DATABASE_URL='postgresql://pokemon:pokemon@localhost:55432/'+o['database'],REDIS_URL='redis://127.0.0.1:'+str(o['redis']['port']),METRICS_TOKEN=secret,PRICE_QUEUE_ENABLED='false',ENABLE_CATALOG_SYNC_CRON='false',ENABLE_PRICE_BACKFILL_CRON='false',ENABLE_RETENTION_CRON='false',PORT='3001',NODE_ENV='development',SCANNER_VISUAL_ENABLED='1',NODE_OPTIONS='--import /private/tmp/local-app-qa-20261010/no-provider-fetch.mjs')
checks=[]
def record(name,ok):
 checks.append({'name':name,'passed':bool(ok)});assert ok,name

def call(path,body=None,headers=None,method=None):
 h={'Content-Type':'application/json',**(headers or {})};req=urllib.request.Request('http://127.0.0.1:3001/api/'+path,data=json.dumps(body).encode() if body is not None else None,headers=h,method=method)
 try:r=urllib.request.urlopen(req,timeout=15)
 except urllib.error.HTTPError as e:r=e
 data=r.read();return r.status,dict(r.headers),json.loads(data) if data else None

def metrics():
 s,h,b=call('ops/metrics',headers={'X-Metrics-Token':secret});assert s==200;return b

def sql(query):
 r=subprocess.run(['docker','exec','pokemon-scanner-db','psql','-U','pokemon','-d',o['database'],'-X','-A','-t','-v','ON_ERROR_STOP=1','-c',query],capture_output=True,text=True);assert r.returncode==0,'ownSQLfailed';return r.stdout.strip()

log=(p/'runtime-api-private.log').open('w');proc=subprocess.Popen(['pnpm','--dir','backend','run','start:prod'],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);(p/'runtime-owner.json').write_text(json.dumps({'pid':proc.pid,'group':proc.pid,'role':'BE06-owned-runtime','database':o['database']}))
try:
 for i in range(60):
  try:
   s,_,b=call('ready')
   if b.get('detail',{}).get('scanner',{}).get('state')=='ready':break
  except (OSError,ValueError):pass
  time.sleep(.5)
 else:raise RuntimeError('scannernotready')
 record('compiled API ready with real local DINOv2',s==200)
 s,h,b=call('ops/metrics');record('anonymous denied',s==401 and h.get('Cache-Control')=='no-store')
 record('wrong operations credential denied',call('ops/metrics',headers={'X-Metrics-Token':'incorrecto'})[0]==401)
 s,h,b=call('ops/metrics',headers={'X-Metrics-Token':secret});record('private metrics accessible no-store',s==200 and h.get('Cache-Control')=='no-store')
 before=b
 record('warmup measured once',b['metrics']['counters'].get('warmup_ready',0)==1 and b['metrics']['histograms']['warmup_duration_ms']['count']==1)
 name='be06_'+secrets.token_hex(4);password=secrets.token_hex(12);s,_,auth=call('auth/register',{'email':name+'@example.invalid','username':name,'password':password},{'X-Session-Request':'1'});record('synthetic own account created',s==201);jwt=auth['accessToken'];jwtHeaders={'Authorization':'Bearer '+jwt}
 record('customer JWT cannot read metrics',call('ops/metrics',headers=jwtHeaders)[0]==401)
 record('scanner anonymous rejected',call('cards/identify-visual',{'image':'data:image/png;base64,YQ=='})[0]==401)
 record('scanner DTO invalid rejected',call('cards/identify-visual',{'image':'invalid'},jwtHeaders)[0]==400)
 record('scanner GET does not count inference',call('cards/identify-visual',headers=jwtHeaders)[0] in [404,400])
 # Imagen sintética en memoria: valida señales operativas, no precisión de reconocimiento.
 image=subprocess.check_output(['pnpm','--dir','backend','exec','node','--input-type=module','-e',"import sharp from 'sharp';process.stdout.write('data:image/png;base64,'+(await sharp({create:{width:64,height:64,channels:3,background:'#222222'}}).png().toBuffer()).toString('base64'))"],cwd=root,text=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
  statuses=list(pool.map(lambda _:call('cards/identify-visual',{'image':image},jwtHeaders)[0],range(5)))
 record('real inference succeeds and busy returns503',200 in statuses and 503 in statuses)
 after=metrics();(p/'metrics-after-scanner.json').write_text(json.dumps(after,indent=2))
 c=after['metrics']['counters'];hist=after['metrics']['histograms']
 record('HTTP requests separated from inference including guards',c.get('scanner_http_requests',0)==7 and c.get('scanner_http_401',0)==1 and c.get('scanner_http_400',0)==1)
 record('busy admissions distinct from completed inference',c.get('admission_busy',0)==statuses.count(503) and c.get('inference_started',0)==statuses.count(200) and c.get('inference_completed',0)==statuses.count(200))
 record('real worker and inference durations have correct sample counts',hist['worker_duration_ms']['count']==statuses.count(200) and hist['inference_duration_ms']['count']==statuses.count(200) and hist['scanner_http_duration_ms']['count']==7)

 record('metrics include scanner and safe Redis state',after['scanner']['state']=='ready' and after['redis']['available'])
 serialized=json.dumps(after);record('aggregate excludes photos and credentials',image not in serialized and jwt not in serialized and secret not in serialized and name not in serialized)
 sql("DELETE FROM price_refresh_jobs")
 sql("INSERT INTO price_refresh_jobs (id,\"cardId\",status,attempts,\"createdAt\",\"updatedAt\",\"availableAt\") VALUES ('be06_pending','base1-1','pending',3,NOW()-INTERVAL '2 minutes',NOW(),NOW()),('be06_processing','base1-2','processing',1,NOW()-INTERVAL '1 minute',NOW(),NOW())")
 time.sleep(1.2);q=metrics();(p/'metrics-queue.json').write_text(json.dumps(q,indent=2));record('queue aggregate available',q['queue']['state']=='available')
 pending=q['queue']['statuses']['pending'];processing=q['queue']['statuses']['processing']
 record('queue counts and active retry claims accurate',pending['count']==1 and pending['retries']==2 and processing['count']==1 and processing['retries']==0)
 record('queue age uses aggregate observation cut',119000<=pending['oldestAgeMs']<=135000 and 59000<=processing['oldestAgeMs']<=75000)
 record('queue IDs not serialized','be06_pending' not in json.dumps(q) and 'base1-1' not in json.dumps(q))
 r=o['redis'];assert subprocess.check_output(['docker','inspect','-f','{{.Id}}',r['name']],text=True).strip()==r['id'];assert subprocess.check_output(['docker','inspect','-f','{{index .Config.Labels "qa.owner"}}',r['name']],text=True).strip()==r['label']
 subprocess.run(['docker','stop',r['id']],check=True,capture_output=True)
 for _ in range(30):
  degraded=metrics()
  if not degraded['redis']['available']:break
  time.sleep(.2)
 record('Redis loss reported without killing API',not degraded['redis']['available'] and degraded['redis']['degradedSince'] is not None and proc.poll() is None and call('health')[0]==200)
 subprocess.run(['docker','start',r['id']],check=True,capture_output=True)
 for _ in range(60):
  restored=metrics()
  if restored['redis']['available']:break
  time.sleep(.25)
 record('Redis recovery same API process',restored['redis']['available'] and restored['redis']['degradedSince'] is None and proc.poll() is None)
 (p/'runtime-result.json').write_text(json.dumps({'checks':checks,'success':True,'inferenceStatuses':statuses,'scope':'owned PG/Redis, compiled Nest, synthetic image in memory; no physical accuracy claim'},indent=2))
 print(json.dumps({'passed':len(checks),'statuses':statuses}))
finally:
 os.killpg(proc.pid,signal.SIGTERM)
 try:proc.wait(timeout=10)
 except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
 log.close();(p/'runtime-owner.json').write_text(json.dumps({'pid':proc.pid,'role':'BE06-owned-runtime','live':False,'exitCode':proc.returncode}));(p/'runtime-progress.json').write_text(json.dumps(checks,indent=2))
