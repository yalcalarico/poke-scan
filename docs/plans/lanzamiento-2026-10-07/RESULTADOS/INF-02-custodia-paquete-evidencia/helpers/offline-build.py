from pathlib import Path
import subprocess,json,hashlib,shutil,os
r=Path('/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app');p=Path('/private/tmp/pokescan-custody-package-20261012');run='pack_d74d2b31c89c';name=run+'-linux-builder';stage=p/'linux-input';stage.mkdir(mode=0o700,exist_ok=True)
def cmd(a):
 v=subprocess.run(a,capture_output=True,text=True,timeout=240);assert v.returncode==0,'Offline build command failed; private log preserved';return v.stdout.strip()
inspect="const p=require('/app/package.json'),fs=require('fs'),c=require('crypto');console.log(JSON.stringify({node:process.version,dependencies:p.dependencies,devDependencies:p.devDependencies,lockHash:c.createHash('sha256').update(fs.readFileSync('/app/pnpm-lock.yaml')).digest('hex')}))"
meta=json.loads(cmd(['docker','run','--rm','--pull=never','--network=none','--entrypoint','node','f1ba863d6b8f','-e',inspect]));host=json.loads((r/'backend/package.json').read_text());assert meta['node']=='v22.20.0'and meta['dependencies']==host['dependencies']and meta['devDependencies']==host['devDependencies']and meta['lockHash']==hashlib.sha256((r/'backend/pnpm-lock.yaml').read_bytes()).hexdigest()
for n in ['src','prisma']:
 shutil.copytree(r/'backend'/n,stage/n,dirs_exist_ok=True)
for n in ['package.json','tsconfig.json','tsconfig.build.json','nest-cli.json']:shutil.copy2(r/'backend'/n,stage/n)
assert not any(x.is_symlink()for x in stage.rglob('*'))
a=['docker','run','-d','--pull=never','--network=none','--name',name,'--label','qa.owner=/root','--label','qa.run='+run,'--entrypoint','node']
for n in ['src','prisma','package.json','tsconfig.json','tsconfig.build.json','nest-cli.json']:a+=['--mount','type=bind,source='+str(stage/n)+',target=/app/'+n+',readonly']
a+=['f1ba863d6b8f','-e','setInterval(()=>{},1000)'];identity=cmd(a);(p/'offline-builder-owner.json').write_text(json.dumps({'owner':'/root','run':run,'name':name,'id':identity},indent=2)+'\n')
try:
 assert cmd(['docker','inspect','-f','{{.Id}}',name])==identity
 cmd(['docker','exec',identity,'node','-e',"const fs=require('fs');fs.rmSync('/app/dist',{recursive:true,force:true});fs.rmSync('/app/tsconfig.tsbuildinfo',{force:true});"])
 logs=[]
 for args in [['pnpm','--version'],['pnpm','exec','prisma','generate','--schema','prisma/schema.prisma'],['pnpm','run','build']]:
  v=subprocess.run(['docker','exec','-e','DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:9/unused','-e','CHECKPOINT_DISABLE=1',identity,*args],capture_output=True,text=True,timeout=240);logs.append({'command':args,'exitCode':v.returncode,'stdout':v.stdout,'stderr':v.stderr});(p/'linux-build-log.json').write_text(json.dumps(logs,indent=2)+'\n');assert v.returncode==0,'Current Linux compile failed; log preserved'
 assert logs[0]['stdout'].strip()=='10.17.1'
 generated=cmd(['docker','exec',identity,'node','-e',"const fs=require('fs'),p=require('path');console.log(p.resolve(p.dirname(fs.realpathSync('/app/node_modules/@prisma/client/default.js')),'../../.prisma/client')); "])
 actual=cmd(['docker','run','--rm','--pull=never','--network=none','--entrypoint','node','1e92edf09a92','-e',"const fs=require('fs'),p=require('path');console.log(p.resolve(p.dirname(fs.realpathSync('/app/node_modules/@prisma/client/default.js')),'../../.prisma/client')); "]);assert actual==generated
 context=p/'current-runner';context.mkdir(mode=0o700,exist_ok=True);cmd(['docker','cp',identity+':/app/dist',str(context/'dist')]);cmd(['docker','cp',identity+':'+generated,str(context/'client')]);shutil.copytree(stage/'prisma',context/'prisma',dirs_exist_ok=True);shutil.copy2(stage/'package.json',context/'package.json');(context/'scanner').mkdir(exist_ok=True)
 for n in ['scanner-visual-worker.mjs','scanner-visual-engine.mjs','scanner-visual-index.mjs']:shutil.copy2(r/'backend/scripts'/n,context/'scanner'/n)
 relative=generated.removeprefix('/app/');assert relative.startswith('node_modules/.pnpm/')and '\n'not in relative
 (context/'Dockerfile').write_text('FROM inf02-backend:local\nUSER root\nCOPY --chown=1001:1001 dist/ /app/dist/\nCOPY --chown=1001:1001 client/ /app/'+relative+'/\nCOPY --chown=1001:1001 prisma/ /app/prisma/\nCOPY --chown=1001:1001 package.json /app/package.json\nCOPY --chown=1001:1001 scanner/ /app/scripts/\nUSER nextjs\n')
 (p/'offline-compile-receipt.json').write_text(json.dumps({'builderImage':'f1ba863d6b8f','builderFullID':json.loads(cmd(['docker','image','inspect','f1ba863d6b8f']))[0]['Id'],'cachedRuntimeImage':'1e92edf09a92','currentSourceFreshLinuxCompile':True,'lockHashExact':meta['lockHash'],'dependenciesExact':True,'node':meta['node'],'pnpm':'10.17.1','generatedClientNamespace':generated,'noNetwork':True},indent=2)+'\n');print('Current Linux source and Prisma compiled from exact cached dependency lock')
finally:
 if cmd(['docker','inspect','-f','{{index .Config.Labels "qa.run"}}',identity])==run:cmd(['docker','rm','-f',identity])
