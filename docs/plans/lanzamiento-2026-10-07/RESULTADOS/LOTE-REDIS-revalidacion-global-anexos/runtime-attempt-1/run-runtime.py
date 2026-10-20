from pathlib import Path
import os, subprocess, json, time, signal, datetime
root=Path('/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app')
out=Path('/private/tmp/be07-global-469af22a0f8f')
own=json.loads((out/'ownership.json').read_text());ann=Path(own['annex'])
assert own['runId']=='be07-global-469af22a0f8f'
env=os.environ.copy();env.pop('NODE_OPTIONS',None)
env.update(DATABASE_URL='postgresql://pokemon:pokemon@127.0.0.1:55432/'+own['database'],DATABASE_URL_TEST='postgresql://pokemon:pokemon@127.0.0.1:55432/'+own['database'],REDIS_URL='redis://127.0.0.1:56392/0',BE07_GATE_NONCE=own['runId']+'-api-one-process',SCANNER_VISUAL_ENABLED='0',JWT_SECRET='synthetic-be07-validation-only-secret',JWT_REFRESH_SECRET='synthetic-be07-validation-only-refresh',CURRENCY_ARS_ENABLED='true',PORT='3001',FRONTEND_URL='http://localhost:3000',CORS_ORIGINS='http://localhost:3000,http://127.0.0.1:3000',NEXT_PUBLIC_API_URL='/api',API_INTERNAL_URL='http://127.0.0.1:3001/api',PRICE_QUEUE_ENABLED='false',ENABLE_CATALOG_SYNC_CRON='false',ENABLE_PRICE_BACKFILL_CRON='false',ENABLE_RETENTION_CRON='false',NEXT_TELEMETRY_DISABLED='1')
def listener(port):
 p=subprocess.run(['lsof','-nP','-t',f'-iTCP:{port}','-sTCP:LISTEN'],capture_output=True,text=True)
 return [int(x) for x in p.stdout.split()] if p.returncode==0 else []
for port in [3000,3001,56392]:assert not listener(port)
commands=[('proxy',56392,['node',str(out/'proxy.mjs')]),('api',3001,['node','--import',str(out/'network-guard.mjs'),'backend/dist/main.js']),('web',3000,['node','--import',str(out/'network-guard.mjs'),'frontend/node_modules/next/dist/bin/next','start','frontend','--hostname','127.0.0.1','--port','3000'])]
procs=[];logs=[];status=1
try:
 for role,port,cmd in commands:
  log=(ann/(role+'-runtime.log')).open('w');logs.append(log)
  proc=subprocess.Popen(cmd,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT);procs.append((role,port,proc,cmd))
  deadline=time.monotonic()+35
  while not listener(port):
   assert proc.poll() is None,(role,proc.returncode)
   assert time.monotonic()<deadline,role
   time.sleep(.1)
  pid=listener(port);assert pid==[proc.pid],(role,pid,proc.pid)
 own['processes']=[{'role':role,'port':port,'pid':proc.pid,'parentPID':os.getpid(),'command':cmd,'nonce':env['BE07_GATE_NONCE'] if role=='api' else None} for role,port,proc,cmd in procs]
 own['runtimeStartedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();own['runtimeStarted']=True
 (out/'ownership.json').write_text(json.dumps(own,indent=2)+'\n');(ann/'ownership.json').write_text(json.dumps(own,indent=2)+'\n')
 print(json.dumps({'runtimeStarted':True,'processes':[{'role':r,'pid':p.pid,'port':port} for r,port,p,c in procs]}),flush=True)
 with (ann/'runtime-flow.log').open('w') as log:
  flow=subprocess.run(['node','--import',str(out/'network-guard.mjs'),str(out/'runtime-flow.mjs')],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 status=flow.returncode
 own['processesAliveAfterMatrix']=[{'role':r,'pid':p.pid,'stillAlive':p.poll() is None,'listenerPID':listener(port)} for r,port,p,c in procs]
 assert all(p['stillAlive'] and p['listenerPID']==[p['pid']] for p in own['processesAliveAfterMatrix'])
 print(json.dumps({'runtimeExitCode':status,'sameProcessesAfterMatrix':True}),flush=True)
finally:
 own['processesStopVerification']=[]
 for role,port,proc,cmd in reversed(procs):
  if proc.poll() is None:
   observed=subprocess.check_output(['ps','-p',str(proc.pid),'-o','pid=,ppid=,command='],text=True).strip();fields=observed.split(None,2)
   assert int(fields[0])==proc.pid and int(fields[1])==os.getpid()
   assert listener(port)==[proc.pid]
   assert all(arg in fields[2] for arg in cmd[1:]) if role!='web' else 'next-server (v16.3.6)' in fields[2]
   own['processesStopVerification'].append({'role':role,'pid':proc.pid,'parentPID':int(fields[1]),'commandVerified':True,'listenerVerified':True})
   proc.send_signal(signal.SIGTERM);proc.wait(timeout=12)
  assert not listener(port)
 for log in logs:log.close()
 own.update(runtimeStarted=False,processesStopped=[p.pid for r,port,p,c in procs],runtimeExitCode=status)
 (out/'ownership.json').write_text(json.dumps(own,indent=2)+'\n');(ann/'ownership.json').write_text(json.dumps(own,indent=2)+'\n')
 for f in ['runtime-results.json','runtime-incomplete.json','fixture-identifiers.json','fixture-cleanup.json','proxy-stats.json','external-fetch-attempts.jsonl']:
  if (out/f).exists():(ann/f).write_bytes((out/f).read_bytes())
 print(json.dumps({'runtimeProcessesStopped':True,'portsFree':[p for p in [3000,3001,56392] if not listener(p)]}),flush=True)
raise SystemExit(status)
