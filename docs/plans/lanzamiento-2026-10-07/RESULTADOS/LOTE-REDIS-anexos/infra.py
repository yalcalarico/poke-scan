from pathlib import Path
import subprocess,json,sys,datetime
out=Path('/private/tmp/be07-gate-sol-20261009'); own=json.loads((out/'ownership.json').read_text())
assert own['owner']=='/root/be07_review_sol'
def run(args):
 p=subprocess.run(args,capture_output=True,text=True); assert p.returncode==0,(args,p.stderr); return p.stdout.strip()
def sql(db,q):return run(['docker','exec','pokemon-scanner-db','psql','-U','pokemon','-d',db,'-X','-A','-t','-v','ON_ERROR_STOP=1','-c',q])
def inspect(name):
 d=json.loads(run(['docker','inspect',name]))[0]
 return {'id':d['Id'],'name':d['Name'].lstrip('/'),'image':d['Image'],'state':d['State']['Status'],'health':d['State'].get('Health',{}).get('Status'),'ports':d['NetworkSettings']['Ports'],'labels':d['Config']['Labels'],'mounts':[{k:v for k,v in m.items() if k in ['Type','Name','Destination']} for m in d['Mounts']]}
def counts(db):
 q='SELECT json_build_object('+','.join("'%s',(SELECT count(*) FROM %s)"%(a,b) for a,b in [('cards','cards'),('sets','card_sets'),('migrations','_prisma_migrations'),('users','users'),('collections','collections'),('items','collection_items'),('shares','share_links'),('prices','card_prices'),('jobs','price_refresh_jobs'),('snapshots','portfolio_snapshots')])+",'gin',(SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexdef LIKE '%USING gin%'))"
 return json.loads(sql(db,q))
name=own['database']; comment=own['databaseComment']; redisname=own['redis']; label=own['redisLabel']
if sys.argv[1]=='setup':
 assert sql('postgres',"SELECT count(*) FROM pg_database WHERE datname='%s'"%name)=='0'
 assert sql('postgres',"SELECT count(*) FROM pg_stat_activity WHERE datname='pokemon_cards_test'")=='0'
 containers=json.loads(run(['docker','ps','-a','--format','json']).replace('\n',',').join(['[',']'])) if False else run(['docker','ps','-a','--format','{{.Names}}']).splitlines()
 assert redisname not in containers
 baseline={'dev':counts('pokemon_cards'),'test':counts('pokemon_cards_test'),'infra':{'postgres':inspect('pokemon-scanner-db'),'redisDev':inspect('pokemon-scanner-redis')},'databaseAbsent':True,'redisAbsent':True,'sourceTestConnections':0}
 (out/'source-inventory-before.json').write_text(json.dumps(baseline,indent=2)+'\n')
 own['plannedResources']=[{'role':'database','name':name,'comment':comment},{'role':'redis','name':redisname,'label':label,'bind':'127.0.0.1:56383'}]
 (out/'ownership.json').write_text(json.dumps(own,indent=2)+'\n')
 sql('postgres','CREATE DATABASE "%s" TEMPLATE "pokemon_cards_test"'%name)
 sql('postgres',"COMMENT ON DATABASE \"%s\" IS '%s'"%(name,comment))
 own['resources'].append({'role':'database','name':name,'pgContainer':baseline['infra']['postgres']['id'],'comment':comment}); own['liveResources'].append('database'); (out/'ownership.json').write_text(json.dumps(own,indent=2)+'\n')
 image=baseline['infra']['redisDev']['image']
 rid=run(['docker','run','-d','--pull','never','--name',redisname,'--label','gate.owner='+label,'-p','127.0.0.1:56383:6379','--tmpfs','/data:rw,noexec,nosuid,size=16m',image,'redis-server','--save','','--appendonly','no'])
 ri=inspect(redisname); assert ri['id']==rid and ri['labels']['gate.owner']==label; assert ri['ports']['6379/tcp']==[{'HostIp':'127.0.0.1','HostPort':'56383'}]; assert not [m for m in ri['mounts'] if m['Type']=='volume']; assert run(['docker','exec',rid,'redis-cli','ping'])=='PONG'
 own['resources'].append({'role':'redis','name':redisname,'id':rid,'label':label,'bind':'127.0.0.1:56383','tmpfs':True}); own['liveResources'].append('redis'); (out/'ownership.json').write_text(json.dumps(own,indent=2)+'\n')
 (out/'infra-created.json').write_text(json.dumps({'clone':counts(name),'redis':ri},indent=2)+'\n'); print(json.dumps({'cloneCreated':True,'redisCreated':True,'sourceInventory':{'dev':baseline['dev'],'test':baseline['test']}}))
elif sys.argv[1]=='cleanup':
 baseline=json.loads((out/'source-inventory-before.json').read_text())
 assert own['resources'][0]['name']==name and own['resources'][0]['comment']==comment
 assert inspect('pokemon-scanner-db')['id']==baseline['infra']['postgres']['id']
 observed=sql('postgres',"SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='%s'"%name); assert observed==comment
 assert sql('postgres',"SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='%s'"%name)=='pokemon'
 connections=int(sql('postgres',"SELECT count(*) FROM pg_stat_activity WHERE datname='%s'"%name)); assert connections==0
 own['databaseCommentVerifiedBeforeDrop']=True;own['databaseConnectionsBeforeDrop']=connections;(out/'ownership.json').write_text(json.dumps(own,indent=2)+'\n')
 sql('postgres','DROP DATABASE "%s"'%name)
 assert sql('postgres',"SELECT count(*) FROM pg_database WHERE datname='%s'"%name)=='0'
 ri=next(r for r in own['resources'] if r['role']=='redis'); before=inspect(ri['id']);assert before['id']==ri['id'] and before['name']==redisname and before['labels']['gate.owner']==label;assert before['ports']['6379/tcp']==[{'HostIp':'127.0.0.1','HostPort':'56383'}];assert not [m for m in before['mounts'] if m['Type']=='volume']
 run(['docker','stop',ri['id']]);run(['docker','rm',ri['id']]); assert ri['id'] not in run(['docker','ps','-a','--no-trunc','--format','{{.ID}}']).splitlines(); assert redisname not in run(['docker','ps','-a','--format','{{.Names}}']).splitlines()
 after={'dev':counts('pokemon_cards'),'test':counts('pokemon_cards_test'),'infra':{'postgres':inspect('pokemon-scanner-db'),'redisDev':inspect('pokemon-scanner-redis')}}
 assert after['dev']==baseline['dev'] and after['test']==baseline['test'];assert after['infra']['postgres']['id']==baseline['infra']['postgres']['id'];assert after['infra']['redisDev']['id']==baseline['infra']['redisDev']['id'];assert after['infra']['postgres']['health']=='healthy' and after['infra']['redisDev']['health']=='healthy'
 (out/'source-inventory-after.json').write_text(json.dumps(after,indent=2)+'\n')
 own.update(liveResources=[],cloneDropped=True,redisRemoved=True,sourceCountsUnchanged=True,sourceInfraIDsUnchangedHealthy=True,cleanupAt=datetime.datetime.now(datetime.timezone.utc).isoformat()); (out/'ownership.json').write_text(json.dumps(own,indent=2)+'\n');print(json.dumps({'cloneDropped':True,'redisRemoved':True,'sourceCountsUnchanged':True,'sourceInfraIDsUnchangedHealthy':True,'databaseConnectionsBeforeDrop':0}))
