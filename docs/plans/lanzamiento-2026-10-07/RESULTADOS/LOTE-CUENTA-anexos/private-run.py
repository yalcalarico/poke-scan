from pathlib import Path
import subprocess,json,os,re,datetime,sys
out=Path(__file__).resolve().parent;own=json.loads((out/'ownership.json').read_text());ann=Path(own['annex']);root=ann.parents[4]
# All URLs are owned loopback; only the DB name and role enter artifacts.
env=os.environ.copy();env.update(DATABASE_URL='postgresql://pokemon:pokemon@127.0.0.1:55432/'+own['database'],DATABASE_URL_TEST='postgresql://pokemon:pokemon@127.0.0.1:55432/'+own['database'],REDIS_URL='redis://127.0.0.1:'+str(own['redisPort']),NEXT_PUBLIC_API_URL='http://127.0.0.1:3001/api')
name=sys.argv[1];cmd=sys.argv[2:];assert cmd[0]=='pnpm'
def safe(line):
 line=re.sub(r'\x1b\[[0-9;]*m','',line)
 line=re.sub(r'postgres(?:ql)?://[^\s"\']+', '[OWN_DATABASE_URL_REDACTED]',line)
 line=re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[JWT_REDACTED]',line)
 line=re.sub(r'(?i)("(?:accessToken|refreshToken|passwordHash|newPassword|password|token|email|recipient)"\s*:\s*)"[^"\n]*"',r'\1"[REDACTED]"',line)
 line=re.sub(r'(?i)value="[^"\n]*"','value="[REDACTED]"',line)
 line=re.sub(r'(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43,}(?![A-Za-z0-9_-])','[LONG_VALUE_REDACTED]',line)
 return line
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
with (ann/(name+'.log')).open('w') as log:
 process=subprocess.Popen(cmd,cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 for line in process.stdout:log.write(safe(line));log.flush()
 code=process.wait()
(ann/(name+'-result.json')).write_text(json.dumps({'command':cmd,'exitCode':code,'startedAtUtc':started,'finishedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'logRedactedAtSource':True,'environmentScope':'owned DB for DATABASE_URL and DATABASE_URL_TEST, owned loopback Redis; public API loopback build value; global defaults intact'},indent=2)+'\n')
print(json.dumps({'step':name,'exitCode':code}));sys.exit(code)
