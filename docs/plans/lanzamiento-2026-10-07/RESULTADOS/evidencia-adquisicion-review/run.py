import subprocess,sys,json,datetime
from pathlib import Path
out=Path(__file__).resolve().parent
name=sys.argv[1];command=sys.argv[2:]
start=datetime.datetime.now(datetime.timezone.utc).isoformat()
with (out/'logs'/f'{name}.log').open('wb') as log:
 result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
receipt={'name':name,'command':command,'startedAtUtc':start,'finishedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':result.returncode,'log':f'logs/{name}.log'}
(out/'logs'/f'{name}.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
print((out/'logs'/f'{name}.log').read_text())
sys.exit(result.returncode)
