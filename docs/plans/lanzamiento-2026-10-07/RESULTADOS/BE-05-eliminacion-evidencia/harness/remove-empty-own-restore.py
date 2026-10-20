from pathlib import Path
import subprocess,json
p=Path('/private/tmp/pokescan-delete-20261011');o=json.loads((p/'db-owner.json').read_text());name=o['restoreDatabase']
def c(a):
 r=subprocess.run(a,capture_output=True,text=True);assert r.returncode==0;return r.stdout.strip()
def sql(db,q):return c(['docker','exec',o['pgFullID'],'psql','-U','pokemon','-d',db,'-X','-A','-t','-v','ON_ERROR_STOP=1','-c',q])
assert name==o['runId']+'_restore_test'
assert c(['docker','inspect','-f','{{.Id}}','pokemon-scanner-db'])==o['pgFullID']
assert sql('postgres',"SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='%s'"%name)==o['restoreMarker']
assert sql('postgres',"SELECT count(*) FROM pg_stat_activity WHERE datname='%s'"%name)=='0'
assert sql(name,"SELECT count(*) FROM pg_tables WHERE schemaname='public'")=='0'
sql('postgres','DROP DATABASE "'+name+'"');assert sql('postgres',"SELECT count(*) FROM pg_database WHERE datname='%s'"%name)=='0'
o.pop('restoreDatabase');o.pop('restoreMarker');(p/'db-owner.json').write_text(json.dumps(o,indent=2)+'\n')
r={'ownRestoreTargetOnlyRemoved':True,'markerFullIDVerified':True,'SQLConnections':0,'publicTablesBeforeDrop':0,'reason':'pg_restore stdin was closed by docker exec without -i; no rows restored, authenticated encrypted QA payload already removed'};(p/'restore-empty-cleanup.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
