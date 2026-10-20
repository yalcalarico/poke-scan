from pathlib import Path
import os,subprocess,json,re,datetime
p=Path('/private/tmp/pokescan-delete-20261011');o=json.loads((p/'db-owner.json').read_text());env=os.environ.copy();env.update(DATABASE_URL='postgresql://pokemon:pokemon@localhost:55432/'+o['database'],DATABASE_URL_TEST='postgresql://pokemon:pokemon@localhost:55432/'+o['database'],REDIS_URL='redis://127.0.0.1:'+str(o['redis']['port']),NEXT_PUBLIC_SITE_URL='http://127.0.0.1:3000')
for key in ['API_INTERNAL_URL','NODE_OPTIONS']:env.pop(key,None)
records=[]
for role,cmd in [('stop',['pnpm','run','stop']),('focused-frontend',['pnpm','--dir','frontend','exec','vitest','run','lib/api/account-deletion.test.ts','components/auth/account-deletion-experience.test.tsx','lib/__tests__/service-worker-routing.test.ts'])]:
 start=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with (p/('current-'+role+'.log')).open('w') as log:
  proc=subprocess.Popen(cmd,cwd='/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app',env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
  for line in proc.stdout:
   line=re.sub(r'(?:postgres(?:ql)?|redis)://[^\s\"\']+','[LOCAL_URL_REDACTED]',line)
   line=re.sub(r'(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}','[EMAIL_REDACTED]',line)
   log.write(line);log.flush()
  code=proc.wait()
 record={'phase':role,'command':cmd,'exitCode':code,'startedAtUtc':start,'finishedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()};records.append(record);print(json.dumps(record),flush=True)
 (p/'focused-frontend-result.json').write_text(json.dumps({'purpose':'Account deletion and restore local validation','records':records},indent=2)+'\n')
 if code:raise SystemExit(code)
