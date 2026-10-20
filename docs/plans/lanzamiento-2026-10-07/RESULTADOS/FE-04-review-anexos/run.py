from pathlib import Path
import subprocess,json,datetime,sys
root=Path(__file__).resolve().parents[5];ann=Path(__file__).resolve().parent
name=sys.argv[1];cmd=sys.argv[2:];assert '/' not in name and cmd[0]=='pnpm'
with (ann/(name+'.log')).open('w') as log: p=subprocess.run(cmd,cwd=root,stdout=log,stderr=subprocess.STDOUT)
(ann/(name+'-result.json')).write_text(json.dumps({'command':cmd,'exitCode':p.returncode,'finishedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
print(json.dumps({'step':name,'exitCode':p.returncode}));sys.exit(p.returncode)
