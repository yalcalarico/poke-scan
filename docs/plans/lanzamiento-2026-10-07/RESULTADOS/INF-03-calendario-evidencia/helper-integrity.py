from pathlib import Path
import json,hashlib,sys
root=Path('/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app');folder=Path('/private/tmp/pokescan-backup-schedule-20261013');files={}
for base in ['scripts','infra','backend/src','backend/prisma','backend/dist','frontend/app','frontend/components','frontend/hooks','frontend/lib','frontend/types','frontend/.next/server','frontend/.next/static']:
 for p in (root/base).rglob('*'):
  if p.is_file() and not p.is_symlink():files[str(p.relative_to(root))]=hashlib.sha256(p.read_bytes()).hexdigest()
for base in ['frontend/.next/BUILD_ID','frontend/.next/routes-manifest.json','frontend/.next/prerender-manifest.json','package.json','backend/package.json','frontend/package.json','backend/pnpm-lock.yaml','frontend/pnpm-lock.yaml']:
 p=root/base
 if p.exists():files[base]=hashlib.sha256(p.read_bytes()).hexdigest()
if sys.argv[1]=='before':(folder/'pre-runtime-files.json').write_text(json.dumps(files,indent=2)+'\n');print(json.dumps({'snapshotFiles':len(files)}))
else:
 before=json.loads((folder/'pre-runtime-files.json').read_text());changed=[k for k in before if before[k]!=files.get(k)];added=sorted(set(files)-set(before));result={'selectedFiles':len(before),'unchanged':len(before)-len(changed),'changed':changed,'added':added,'equal':not changed and not added};(folder/'runtime-integrity.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));assert result['equal']
