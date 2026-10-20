from pathlib import Path
import json,urllib.request,urllib.error,subprocess,datetime
p=Path('/private/tmp/pokescan-custody-package-20261012');checks=[]
for route,expected in [('http://localhost:3000/login',200),('http://localhost:3000/eliminar-cuenta',200),('http://localhost:3001/api/health',200),('http://localhost:3001/api/ready',200),('http://localhost:3001/api/ops/metrics',404),('http://localhost:3001/api/auth/account-deletion-availability',401)]:
 try:
  with urllib.request.urlopen(route,timeout=10) as r:status=r.status;headers=dict(r.headers);body=r.read()
 except urllib.error.HTTPError as e:status=e.code;headers=dict(e.headers);body=e.read()
 assert status==expected,(route,status)
 check={'route':route,'status':status}
 if route.endswith('/ready'):assert json.loads(body)['status']=='ready';check['databaseReady']=json.loads(body)['detail']['database']['state']=='ready'
 if route.endswith('account-deletion-availability'):assert 'no-store' in headers.get('Cache-Control','');check['noStore']=True
 checks.append(check)
api=json.loads((p/'user-api-owner.json').read_text());next=json.loads((p/'user-next-owner.json').read_text())
def listener(port):
 values=set(map(int,subprocess.check_output(['lsof','-t','-iTCP:'+str(port),'-sTCP:LISTEN'],text=True).split()));assert len(values)==1;return values.pop()
a=listener(3001);n=listener(3000)
rows=subprocess.check_output(['ps','-p',','.join(map(str,[api['parent'],api['pid'],a,next['parent'],next['pid'],n])),'-o','pid=,ppid=,comm='],text=True);parsed=[{'pid':int(line.split()[0]),'ppid':int(line.split()[1]),'command':line.split(maxsplit=2)[2]} for line in rows.splitlines()];parents={r['pid']:r['ppid'] for r in parsed};assert parents[a]==api['pid'] and parents[api['pid']]==api['parent'];assert parents[n]==next['pid'] and parents[next['pid']]==next['parent']
r={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'intentionalUserInstanceAlive':True,'url':'http://localhost:3000','api':{**api,'listenerPid':a},'next':{**next,'listenerPid':n},'checks':checks,'ancestryVerified':True,'mode':'Habitual dev database with validated compiled outputs; external providers/jobs/mail and account deletion disabled; no synthetic user fixtures written to dev','ownQAResourcesGone':True};(p/'final-instance.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
