from pathlib import Path
import os,json,subprocess,re,sys,datetime
folder=Path('/private/tmp/pokescan-be06-20261011');root=Path('/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app');own=json.loads((folder/'db-owner.json').read_text());mode=sys.argv[1];assert mode in ['clone','dev'];db=own['database'] if mode=='clone' else 'pokemon_cards';env=os.environ.copy();env['DATABASE_URL']='postgresql://pokemon:pokemon@localhost:55432/'+db
cmd=['pnpm','--dir','backend','exec','prisma','migrate','deploy'];started=datetime.datetime.now(datetime.timezone.utc).isoformat()
with (folder/('migrate-'+mode+'.log')).open('w') as log:
 p=subprocess.Popen(cmd,cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 for line in p.stdout:log.write(re.sub(r'postgres(?:ql)?://[^\s"\']+','[DATABASE_URL_REDACTED]',line));log.flush()
 code=p.wait()
r={'targetScope':mode,'exitCode':code,'command':cmd,'startedAtUtc':started,'finishedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()};(folder/('migrate-'+mode+'-result.json')).write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r));sys.exit(code)
