from pathlib import Path
import os,subprocess,json,secrets,urllib.parse,datetime,sys
root=Path('/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app');out=Path('/private/tmp/be05-review-2af1fb6f7757');own=json.loads((out/'ownership.json').read_text());ann=Path(own['annex']);assert own['liveResources']==['database']
settings={}
for p in [root/'.env',root/'backend/.env']:
 if p.exists():
  for line in p.read_text().splitlines():
   if '=' in line and not line.lstrip().startswith('#'):
    k,v=line.split('=',1);settings[k.strip()]=v.strip().strip('"\'')
u=urllib.parse.urlsplit(settings['DATABASE_URL']);assert u.hostname in ['localhost','127.0.0.1'] and u.port==55432 and u.username=='pokemon';url=urllib.parse.urlunsplit((u.scheme,u.netloc,'/'+own['database'],u.query,u.fragment));env=os.environ.copy();env.update(DATABASE_URL=url,DATABASE_URL_TEST=url,BE05_EXPECTED_DATABASE=own['database'],BE05_OWNER_MARKER_PATH=str(out/'owner-marker.txt'),RECOVERY_IDENTIFIER_HMAC_KEY=secrets.token_hex(32),JWT_SECRET=secrets.token_hex(32),JWT_REFRESH_SECRET=secrets.token_hex(32));env.pop('NODE_OPTIONS',None)
name=sys.argv[1];cmd=sys.argv[2:];env['BE05_RUNTIME_EVIDENCE_PATH']=str(ann/(name+'-runtime.json'));assert '/' not in name and cmd[0]=='pnpm'
with (ann/(name+'.log')).open('w') as log:p=subprocess.run(cmd,cwd=root/'backend',env=env,stdout=log,stderr=subprocess.STDOUT)
(ann/(name+'-result.json')).write_text(json.dumps({'command':cmd,'exitCode':p.returncode,'finishedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ownDatabase':own['database']},indent=2)+'\n');print(json.dumps({'step':name,'exitCode':p.returncode}));sys.exit(p.returncode)
