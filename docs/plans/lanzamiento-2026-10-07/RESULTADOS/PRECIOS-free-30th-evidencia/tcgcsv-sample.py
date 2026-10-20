import urllib.request,urllib.error,json,hashlib,time,datetime,re
from pathlib import Path
out={'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'requests':[],'retries':0,'mode':'Public GET of two explicitly identified groups; no full catalog sync'}
def get(url,maxsize=2097152):
 req=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'PokeScan-local-source-research/1.0'})
 with urllib.request.urlopen(req,timeout=20) as r:
  b=r.read(maxsize+1);assert len(b)<=maxsize;out['requests'].append({'url':url,'status':r.status,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()});time.sleep(.15);return b
try:
 products=json.loads(get('https://tcgcsv.com/tcgplayer/3/24722/products'));prices=json.loads(get('https://tcgcsv.com/tcgplayer/3/24722/prices'));assert products['success'] and prices['success']
 details={p['productId']:p for p in products['results']};listed=[p for p in products['results'] if any(x.get('name')=='Number' for x in p.get('extendedData',[]))];quotes=[p for p in prices['results'] if p.get('marketPrice') is not None and p['productId'] in details];out['english30th']={'groupId':24722,'productRecords':len(products['results']),'numberedProducts':len(listed),'priceRecords':len(prices['results']),'marketNonNullRecords':len(quotes),'pricedNumberedProducts':len(set(p['productId'] for p in quotes if any(x.get('name')=='Number' for x in details[p['productId']].get('extendedData',[]))))}
 selected=[p for p in listed if re.search(r'Articuno',p.get('name',''),re.I)];out['articunoSamples']=[{'productId':p['productId'],'name':p['name'],'number':[d['value'] for d in p['extendedData'] if d.get('name')=='Number'],'url':p.get('url'),'prices':[q for q in prices['results'] if q['productId']==p['productId']]} for p in selected]
 classic=json.loads(get('https://tcgcsv.com/tcgplayer/3/24837/prices'));assert classic['success'];out['classic']={'groupId':24837,'priceRecords':len(classic['results']),'marketNonNullRecords':sum(p.get('marketPrice') is not None for p in classic['results']),'identityMatchesNotVerified':True}
 out['lastUpdated']=get('https://tcgcsv.com/last-updated.txt',1024).decode().strip();out['success']=True
except Exception as e:out.update(success=False,errorType=type(e).__name__)
Path('/private/tmp/pokescan-prices-research-20261013/tcgcsv-verified-sample.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
