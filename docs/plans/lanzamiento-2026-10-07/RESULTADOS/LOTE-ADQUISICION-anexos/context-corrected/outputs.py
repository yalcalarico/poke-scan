from pathlib import Path
import sys,json,hashlib,datetime
out=Path(__file__).resolve().parent;own=json.loads((out/'ownership.json').read_text());root=Path(own['root']);ann=Path(own['annex'])
stage=sys.argv[1]
hashes={}
for folder in ['backend/dist','frontend/.next']:
 for p in sorted((root/folder).rglob('*')):
  if p.is_file() and 'cache' not in p.relative_to(root/folder).parts:
   hashes[str(p.relative_to(root))]=hashlib.sha256(p.read_bytes()).hexdigest()
result={'capturedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stage':stage,'excluded':'cache directory only','backendFiles':sum(p.startswith('backend/') for p in hashes),'nextFiles':sum(p.startswith('frontend/') for p in hashes),'hashes':hashes}
(ann/('outputs-'+stage+'.json')).write_text(json.dumps(result,indent=2)+'\n')
if stage=='final':
 before=json.loads((ann/'outputs-pre-runtime.json').read_text())['hashes']
 delta={'changed':[p for p in before.keys()&hashes.keys() if before[p]!=hashes[p]],'missing':sorted(before.keys()-hashes.keys()),'new':sorted(hashes.keys()-before.keys())}
 (ann/'outputs-runtime-comparison.json').write_text(json.dumps(delta,indent=2)+'\n')
 print(json.dumps(delta))
print(json.dumps({k:v for k,v in result.items() if k!='hashes'}))
