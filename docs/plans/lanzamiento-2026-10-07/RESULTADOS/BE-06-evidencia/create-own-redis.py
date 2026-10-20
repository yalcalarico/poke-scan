from pathlib import Path
import subprocess,json
folder=Path('/private/tmp/pokescan-be06-20261011');own=json.loads((folder/'db-owner.json').read_text());name=own['runId']+'-redis';port=56399
run=lambda args:subprocess.check_output(args,text=True).strip()
assert name not in run(['docker','ps','-a','--format','{{.Names}}']).splitlines();image=run(['docker','inspect','-f','{{.Image}}','pokemon-scanner-redis']);rid=run(['docker','run','-d','--pull','never','--name',name,'--label','qa.owner='+own['marker'],'-p','127.0.0.1:'+str(port)+':6379','--tmpfs','/data:rw,noexec,nosuid,size=16m',image,'redis-server','--save','','--appendonly','no']);assert run(['docker','exec',rid,'redis-cli','ping'])=='PONG';own['redis']={'name':name,'id':rid,'port':port,'label':own['marker']};own['liveResources'].append('redis');(folder/'db-owner.json').write_text(json.dumps(own,indent=2)+'\n');print(json.dumps({'ownRedisCreated':True,'runId':own['runId'],'port':port}))
