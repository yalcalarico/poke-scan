from pathlib import Path
import subprocess,json,datetime
p=Path('/private/tmp/pokescan-be06-20261011');o=json.loads((p/'db-owner.json').read_text())
def cmd(args):
 r=subprocess.run(args,capture_output=True,text=True);assert r.returncode==0,r.stderr;return r.stdout.strip()
def sql(db,q):return cmd(['docker','exec','pokemon-scanner-db','psql','-U','pokemon','-d',db,'-X','-A','-t','-v','ON_ERROR_STOP=1','-c',q])
assert o['owner']=='/root' and o['database'].startswith('be06_') and o['database'].endswith('_test')
assert cmd(['docker','inspect','-f','{{.Id}}','pokemon-scanner-db'])==o['pgFullID']
assert sql('postgres',"SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='%s'"%o['database'])==o['marker']
assert sql('postgres',"SELECT count(*) FROM pg_stat_activity WHERE datname='%s'"%o['database'])=='0'
r=o['redis'];assert cmd(['docker','inspect','-f','{{.Id}}',r['name']])==r['id']
assert cmd(['docker','inspect','-f','{{index .Config.Labels "qa.owner"}}',r['name']])==r['label']
sql('postgres','DROP DATABASE "'+o['database']+'"')
cmd(['docker','rm','-f',r['id']])
assert sql('postgres',"SELECT count(*) FROM pg_database WHERE datname='%s'"%o['database'])=='0'
counts=json.loads(sql('pokemon_cards',"SELECT json_build_object('migrations',(SELECT count(*) FROM _prisma_migrations),'users',(SELECT count(*) FROM users),'collections',(SELECT count(*) FROM collections),'items',(SELECT count(*) FROM collection_items),'shares',(SELECT count(*) FROM share_links),'cards',(SELECT count(*) FROM cards),'gin',(SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexdef LIKE '%USING gin%'))"))
expected={**o['sourceCounts'],'migrations':13};assert counts==expected,(counts,expected)
o['liveResources']=[];o['cleanedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();(p/'db-owner.json').write_text(json.dumps(o,indent=2)+'\n')
standard=json.loads(sql('pokemon_cards_test',"SELECT json_build_object('migrations',(SELECT count(*) FROM _prisma_migrations),'users',(SELECT count(*) FROM users),'collections',(SELECT count(*) FROM collections),'items',(SELECT count(*) FROM collection_items),'shares',(SELECT count(*) FROM share_links),'cards',(SELECT count(*) FROM cards),'gin',(SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexdef LIKE '%USING gin%'),'priced',(SELECT count(DISTINCT \"cardId\") FROM card_prices WHERE provider='tcgdex' AND source='tcgplayer' AND currency='USD' AND market IS NOT NULL))"));assert standard==o['standardTestBefore']
shared_redis=cmd(['docker','inspect','-f','{{.Id}}','pokemon-scanner-redis']);assert cmd(['docker','exec',shared_redis,'redis-cli','ping'])=='PONG'
receipt={'standardSourceUnchanged':True,'standardCounts':standard,'sharedRedisHealthy':True,'sharedRedisFullID':shared_redis,'ownDatabaseAbsent':True,'ownRedisRemovedByFullId':True,'SQLConnectionsBeforeDrop':0,'markersAndFullIDsVerified':True,'sharedCounts':counts,'sharedInventoryUnchanged':True,'finishedAtUtc':o['cleanedAtUtc']};(p/'cleanup-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
