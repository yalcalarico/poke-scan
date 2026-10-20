from pathlib import Path
import subprocess,json,sys,datetime
out=Path('/private/tmp/be05-review-2af1fb6f7757');own=json.loads((out/'ownership.json').read_text());ann=Path(own['annex']);assert own['owner']=='/root/be05_account_draft_review_sol'
def run(args):
 p=subprocess.run(args,capture_output=True,text=True)
 if p.returncode:raise RuntimeError('INFRA_COMMAND_FAILED')
 return p.stdout.strip()
def sql(db,q):return run(['docker','exec','pokemon-scanner-db','psql','-U','pokemon','-d',db,'-X','-A','-t','-v','ON_ERROR_STOP=1','-c',q])
def inspect(name):
 d=json.loads(run(['docker','inspect',name]))[0];return {'id':d['Id'],'state':d['State']['Status'],'health':d['State'].get('Health',{}).get('Status')}
def counts(db):
 return json.loads(sql(db,"SELECT json_build_object('cards',(SELECT count(*) FROM cards),'sets',(SELECT count(*) FROM card_sets),'users',(SELECT count(*) FROM users),'collections',(SELECT count(*) FROM collections),'items',(SELECT count(*) FROM collection_items),'shares',(SELECT count(*) FROM share_links),'prices',(SELECT count(*) FROM card_prices),'jobs',(SELECT count(*) FROM price_refresh_jobs),'migrations',(SELECT count(*) FROM _prisma_migrations),'gin',(SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexdef LIKE '%USING gin%'))"))
def save():
 for p in [out/'ownership.json',ann/'ownership.json']:p.write_text(json.dumps(own,indent=2)+'\n')
name=own['database'];marker=own['marker'];assert name=='be05_review_2af1fb6f7757_test' and marker=='be05-review-2af1fb6f7757-owned'
if sys.argv[1]=='setup':
 assert own['liveResources']==[];assert sql('postgres',"SELECT count(*) FROM pg_database WHERE datname='%s'"%name)=='0';assert sql('postgres',"SELECT count(*) FROM pg_stat_activity WHERE datname='pokemon_cards_test'")=='0'
 baseline={'dev':counts('pokemon_cards'),'test':counts('pokemon_cards_test'),'infra':{'postgres':inspect('pokemon-scanner-db'),'redis':inspect('pokemon-scanner-redis')}};(ann/'infra-before.json').write_text(json.dumps(baseline,indent=2)+'\n');own['pgContainerID']=baseline['infra']['postgres']['id'];save()
 sql('postgres','CREATE DATABASE "%s" TEMPLATE "pokemon_cards_test"'%name);sql('postgres',"COMMENT ON DATABASE \"%s\" IS '%s'"%(name,marker));own['liveResources']=['database'];save()
 # Sólo este clon exacto recién creado y marcado: catálogo conserva datos; fixture auth queda vacía.
 assert sql('postgres',"SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='%s'"%name)==marker
 sql(name,'DELETE FROM users; CREATE TABLE be05_harness_owner(marker text NOT NULL); INSERT INTO be05_harness_owner VALUES (\'%s\')'%marker)
 (out/'owner-marker.txt').write_text(marker);(out/'owner-marker.txt').chmod(0o600);print(json.dumps({'ownCloneCreated':True,'markerVerified':True,'users':int(sql(name,'SELECT count(*) FROM users')),'gin':counts(name)['gin']}))
elif sys.argv[1]=='cleanup':
 before=json.loads((ann/'infra-before.json').read_text());assert inspect('pokemon-scanner-db')['id']==own['pgContainerID'];assert own['liveResources']==['database'];assert sql('postgres',"SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='%s'"%name)==marker;assert sql('postgres',"SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='%s'"%name)=='pokemon';assert sql(name,"SELECT count(*) FROM be05_harness_owner WHERE marker='%s'"%marker)=='1';assert sql(name,'SELECT count(*) FROM be05_harness_owner')=='1';assert sql('postgres',"SELECT count(*) FROM pg_stat_activity WHERE datname='%s'"%name)=='0'
 own['preDropCounts']=counts(name);own['connectionsBeforeDrop']=0;own['markerOwnerRoleVerified']=True;save();sql('postgres','DROP DATABASE "%s"'%name);assert sql('postgres',"SELECT count(*) FROM pg_database WHERE datname='%s'"%name)=='0';(out/'owner-marker.txt').unlink()
 after={'dev':counts('pokemon_cards'),'test':counts('pokemon_cards_test'),'infra':{'postgres':inspect('pokemon-scanner-db'),'redis':inspect('pokemon-scanner-redis')}};assert before==after;(ann/'infra-after.json').write_text(json.dumps(after,indent=2)+'\n');own.update(liveResources=[],cloneDropped=True,markerRemoved=True,sharedBoundedCountsAndIDsUnchanged=True,cleanupAtUtc=datetime.datetime.now(datetime.timezone.utc).isoformat());save();print(json.dumps({'ownCloneDropped':True,'connectionsBeforeDrop':0,'sharedBoundedCountsAndIDsUnchanged':True}))
