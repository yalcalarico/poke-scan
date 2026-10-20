from pathlib import Path
import subprocess,json,secrets,datetime
p=Path('/private/tmp/pokescan-be06-20261011');runid='be06_'+secrets.token_hex(6);db=runid+'_test';marker='owner=/root;run='+runid+';source=BE06-ops-metrics-standard-fixture'
def cmd(args):
 r=subprocess.run(args,capture_output=True,text=True);assert r.returncode==0,r.stderr;return r.stdout.strip()
def sql(db,q):return cmd(['docker','exec','pokemon-scanner-db','psql','-U','pokemon','-d',db,'-X','-A','-t','-v','ON_ERROR_STOP=1','-c',q])
def counts(db):return json.loads(sql(db,"SELECT json_build_object('migrations',(SELECT count(*) FROM _prisma_migrations),'users',(SELECT count(*) FROM users),'collections',(SELECT count(*) FROM collections),'items',(SELECT count(*) FROM collection_items),'shares',(SELECT count(*) FROM share_links),'cards',(SELECT count(*) FROM cards),'gin',(SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexdef LIKE '%USING gin%'),'priced',(SELECT count(DISTINCT \"cardId\") FROM card_prices WHERE provider='tcgdex' AND source='tcgplayer' AND currency='USD' AND market IS NOT NULL))"))
source=counts('pokemon_cards_test');assert source['cards']==20670 and source['priced']==7
shared=counts('pokemon_cards');shared.pop('priced')
assert sql('postgres',"SELECT count(*) FROM pg_stat_activity WHERE datname='pokemon_cards_test'")=='0'
assert sql('postgres',"SELECT count(*) FROM pg_database WHERE datname='%s'"%db)=='0'
o={'runId':runid,'owner':'/root','database':db,'marker':marker,'pgFullID':cmd(['docker','inspect','-f','{{.Id}}','pokemon-scanner-db']),'sourceCounts':shared,'standardTestBefore':source,'createdAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'liveResources':[]};p.joinpath('db-owner.json').write_text(json.dumps(o,indent=2))
sql('postgres','CREATE DATABASE "'+db+'" TEMPLATE "pokemon_cards_test"');sql('postgres',"COMMENT ON DATABASE \"%s\" IS '%s'"%(db,marker));assert counts(db)==source;o['liveResources']=['database'];p.joinpath('db-owner.json').write_text(json.dumps(o,indent=2));print('Marked BE06 clone created from standard TEST source')
