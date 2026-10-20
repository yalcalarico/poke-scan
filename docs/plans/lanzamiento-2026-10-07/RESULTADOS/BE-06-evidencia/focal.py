from pathlib import Path
import os,subprocess,json,re,datetime
p=Path('/private/tmp/pokescan-be06-20261011');o=json.loads((p/'db-owner.json').read_text());env=os.environ.copy();env.update(DATABASE_URL='postgresql://pokemon:pokemon@localhost:55432/'+o['database'],DATABASE_URL_TEST='postgresql://pokemon:pokemon@localhost:55432/'+o['database'],REDIS_URL='redis://127.0.0.1:'+str(o['redis']['port']))
cmd=['pnpm','--dir','backend','exec','vitest','run','src/modules/metrics','src/modules/cards/visual-identify.lifecycle.spec.ts','src/modules/cards/visual-identify.service.spec.ts']
with (p/'focal.log').open('w') as log:
 proc=subprocess.Popen(cmd,cwd='/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app',env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 for line in proc.stdout:log.write(re.sub(r'(?:postgres(?:ql)?|redis)://[^\s]+','[LOCAL_URL_REDACTED]',line));log.flush()
 code=proc.wait()
(p/'focal-result.json').write_text(json.dumps({'command':cmd,'exitCode':code,'finishedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2));print('focal exit',code);raise SystemExit(code)
