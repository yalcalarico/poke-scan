from pathlib import Path
import subprocess,json,datetime
p=Path('/private/tmp/pokescan-delete-20261011');o=json.loads((p/'db-owner.json').read_text())
def c(a):
 r=subprocess.run(a,capture_output=True,text=True);assert r.returncode==0;return r.stdout.strip()
def sql(db,q):return c(['docker','exec',o['pgFullID'],'psql','-U','pokemon','-d',db,'-X','-A','-t','-v','ON_ERROR_STOP=1','-c',q])
assert o['owner']=='/root' and o['database']==o['runId']+'_test' and o['database'].startswith('delete_')
assert c(['docker','inspect','-f','{{.Id}}','pokemon-scanner-db'])==o['pgFullID']
assert sql('postgres',"SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='%s'"%o['database'])==o['marker']
for db in [o['database'],'pokemon_cards_test']:assert sql('postgres',"SELECT count(*) FROM pg_stat_activity WHERE datname='%s'"%db)=='0'
countq="SELECT json_build_object('users',(SELECT count(*) FROM users),'friendships',(SELECT count(*) FROM friendships),'migrations',(SELECT count(*) FROM _prisma_migrations),'priced',(SELECT count(DISTINCT \"cardId\") FROM card_prices WHERE provider='tcgdex' AND source='tcgplayer' AND currency='USD' AND market IS NOT NULL))"
before=json.loads(sql(o['database'],countq));source=json.loads(sql('pokemon_cards_test',countq));assert source=={'users':2,'friendships':0,'migrations':11,'priced':7}
sql('postgres','DROP DATABASE "'+o['database']+'"');sql('postgres','CREATE DATABASE "'+o['database']+'" WITH TEMPLATE "pokemon_cards_test" OWNER pokemon');sql('postgres',"COMMENT ON DATABASE \""+o['database']+"\" IS '"+o['marker']+"'")
assert json.loads(sql(o['database'],countq))==source
r={'ownerMarkerFullIDAndSQL0Verified':True,'oldOwnCloneContext':before,'newStandardCloneBeforeMigrate':source,'onlyOwnCloneRecreated':True,'sourceAndDevWritten':False,'reason':'Read-only Sol review identified 2 harness friendships plus last-test blocked friendship; fresh standard fixture, no product/test relaxation','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()};(p/'context-recreate-receipt.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
o['recreatedAtUtc']=r['atUtc'];(p/'db-owner.json').write_text(json.dumps(o,indent=2)+'\n')
