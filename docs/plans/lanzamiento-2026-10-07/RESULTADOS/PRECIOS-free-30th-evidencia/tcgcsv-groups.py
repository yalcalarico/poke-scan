from pathlib import Path
import urllib.request,urllib.error,json,hashlib,re,datetime
u='https://tcgcsv.com/tcgplayer/3/groups';out={'url':u,'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'attempts':1,'reason':'Correct URL namespace from official docs; prior leaf URLs lacked /tcgplayer','noRetries':True}
try:
 with urllib.request.urlopen(urllib.request.Request(u,headers={'Accept':'application/json','User-Agent':'PokeScan-local-source-research/1.0'}),timeout=20) as r:
  b=r.read(2*1024*1024+1);assert len(b)<=2*1024*1024;v=json.loads(b);assert v['success'] is True
  out.update(status=r.status,groupCount=len(v['results']),bodySHA256=hashlib.sha256(b).hexdigest(),matches=[x for x in v['results'] if re.search(r'30th|Annivers|Celebration',x.get('name',''),re.I)])
except urllib.error.HTTPError as e:out.update(status=e.code,accessible=False)
except Exception as e:out.update(accessible=False,errorType=type(e).__name__)
Path('/private/tmp/pokescan-prices-research-20261013/tcgcsv-groups.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
