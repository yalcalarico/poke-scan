from pathlib import Path
import os,json,subprocess,re
p=Path('/private/tmp/pokescan-deletion-custody-20261012');o=json.loads((p/'db-owner.json').read_text());env=os.environ.copy();env.update(DATABASE_URL='postgresql://pokemon:pokemon@localhost:55432/'+o['database'],DATABASE_URL_TEST='postgresql://pokemon:pokemon@localhost:55432/'+o['database'],REDIS_URL='redis://127.0.0.1:56619')
for k in ['NODE_OPTIONS','API_INTERNAL_URL']:env.pop(k,None)
args=['pnpm','--dir','backend','exec','vitest','run','src/modules/account-deletion/account-suppression-custody.spec.ts','src/modules/account-deletion/suppression-custody-process.spec.ts','-t','reloj vencido']
with (p/'deadline-baseline.log').open('w') as log:
 proc=subprocess.Popen(args,env=env,cwd='/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app',stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 for line in proc.stdout:
  line=re.sub(r'(?:postgres(?:ql)?|redis)://[^\s\"\']+','[LOCAL_URL_REDACTED]',line);log.write(line);log.flush()
 code=proc.wait()
(p/'deadline-baseline-result.json').write_text(json.dumps({'command':args,'exitCode':code},indent=2)+'\n');print(json.dumps({'focalExitCode':code}));raise SystemExit(code)
