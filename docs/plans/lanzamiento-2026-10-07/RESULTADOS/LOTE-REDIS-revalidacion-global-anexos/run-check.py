from pathlib import Path
import os,subprocess,json,datetime,time
root=Path('/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app')
ev=root/'docs/plans/lanzamiento-2026-10-07/RESULTADOS/LOTE-REDIS-revalidacion-global-anexos'
own=json.loads((ev/'ownership.json').read_text())
env=os.environ.copy()
for k in ['NODE_OPTIONS','PRICE_REFRESH_WORKER_ENABLED','CATALOG_SYNC_ENABLED','PRICE_REFRESH_CRON_ENABLED','PRICE_RETENTION_ENABLED','SCANNER_VISUAL_ENABLED']: env.pop(k,None)
env['DATABASE_URL_TEST']='postgresql://pokemon:pokemon@127.0.0.1:55432/'+own['database']
env['DATABASE_URL']=env['DATABASE_URL_TEST']
env['REDIS_URL']='redis://127.0.0.1:'+str(own['redisPort'])
start=datetime.datetime.now(datetime.timezone.utc).isoformat()
with (ev/'check-standard.log').open('w') as log:
 p=subprocess.Popen(['pnpm','run','check'],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 (ev/'check-process.json').write_text(json.dumps({'command':['pnpm','run','check'],'pid':p.pid,'startedAtUtc':start,'database':own['database'],'redisPort':own['redisPort'],'noNodeOptions':not env.get('NODE_OPTIONS'),'workerCronOverrides':False},indent=2)+'\n')
 print(json.dumps({'checkStarted':True,'pid':p.pid}),flush=True)
 code=p.wait()
result={'command':'pnpm run check','pid':p.pid,'startedAtUtc':start,'finishedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':code}
(ev/'check-result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result),flush=True)
raise SystemExit(code)
