import urllib.request,urllib.error,json,datetime,hashlib
from pathlib import Path
# Un transporte HTTP directo acotado: el visor web no pudo procesar JSON; no se usan keys, cookies ni retries.
u='https://api.tcgdex.net/v2/en/sets/30th/018';result={'url':u,'attempts':1,'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'transport':'Direct public HTTPS, GET only, no credentials/retries','priorWebViewerAttemptsInaccessible':8}
try:
 req=urllib.request.Request(u,headers={'Accept':'application/json','User-Agent':'PokeScan-local-source-research/1.0'})
 with urllib.request.urlopen(req,timeout=20) as r:
  b=r.read(2*1024*1024+1);assert len(b)<=2*1024*1024;v=json.loads(b);result.update(status=r.status,bodySHA256=hashlib.sha256(b).hexdigest(),contentType=r.headers.get('Content-Type'),id=v.get('id'),name=v.get('name'),localId=v.get('localId'),set=v.get('set'),pricing=v.get('pricing'),variants=v.get('variants'),variantsDetailed=v.get('variants_detailed'))
except urllib.error.HTTPError as e:result.update(status=e.code,accessible=False)
except Exception as e:result.update(accessible=False,errorType=type(e).__name__)
Path('/private/tmp/pokescan-prices-research-20261013/public-card-sample.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
