from pathlib import Path
import os,json,subprocess,sys,re
p=Path('/private/tmp/pokescan-retention-20261011');o=json.loads((p/'db-owner.json').read_text());env=os.environ.copy();env.update(DATABASE_URL='postgresql://pokemon:pokemon@localhost:55432/'+o['database'],DATABASE_URL_TEST='postgresql://pokemon:pokemon@localhost:55432/'+o['database'],REDIS_URL='redis://127.0.0.1:'+str(o['redis']['port']))
mode=sys.argv[1]
commands={'baseline':['pnpm','--dir','backend','exec','vitest','run','src/modules/account-deletion/account-deletion-restore.spec.ts'],'focal':['pnpm','--dir','backend','exec','vitest','run','src/modules/account-deletion/account-deletion-restore.spec.ts','src/modules/account-deletion/restore-policy.spec.ts','src/modules/account-deletion/account-deletion.service.spec.ts'],'build':['pnpm','--dir','backend','run','build']}
cmd=commands[mode]
r=subprocess.run(cmd,env=env,cwd='/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app',capture_output=True,text=True)
out=re.sub(r'(?:postgres(?:ql)?|redis)://[^\s\"\']+','[LOCAL_URL_REDACTED]',r.stdout+r.stderr)
(p/(mode+'.log')).write_text(out);print(out[-3000:]);print(json.dumps({'phase':mode,'exitCode':r.returncode}));sys.exit(r.returncode)
