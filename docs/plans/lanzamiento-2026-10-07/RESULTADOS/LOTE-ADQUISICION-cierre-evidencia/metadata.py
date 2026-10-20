import json,struct,urllib.request,pathlib
from html.parser import HTMLParser
root=pathlib.Path('/private/tmp/adquisicion-qa-20261011')
(root/'helper-first-failure.json').write_text(json.dumps({'kind':'expected-canonical-normalization','expected':'http://127.0.0.1:3000/','actual':'http://127.0.0.1:3000','productChange':False,'correction':'Next normalizes root canonical without trailing slash'},indent=2))
class Parser(HTMLParser):
 def __init__(self): super().__init__(); self.values={}; self.in_title=False
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='meta': self.values[a.get('property',a.get('name',''))]=a.get('content')
  if tag=='link' and a.get('rel')=='canonical': self.values['canonical']=a.get('href')
  if tag=='title': self.in_title=True
 def handle_endtag(self,tag):
  if tag=='title':self.in_title=False
 def handle_data(self,data):
  if self.in_title:self.values['title']=self.values.get('title','')+data
samples=[]
for route in ['/', '/faq']:
 for ua in ['Mozilla/5.0','Twitterbot/1.0','facebookexternalhit/1.1','Googlebot/2.1']:
  req=urllib.request.Request('http://localhost:3000'+route,headers={'User-Agent':ua})
  with urllib.request.urlopen(req,timeout=20) as response: html=response.read().decode(); status=response.status
  p=Parser();p.feed(html);v=p.values;canonical='http://127.0.0.1:3000'+('' if route=='/' else route)
  assert status==200 and v['canonical']==canonical and v['og:url']==canonical,v
  assert v['title'].endswith(' · PokéScan') and v['title']==v['og:title']==v['twitter:title'],v
  assert v['description']==v['og:description']==v['twitter:description'],v
  assert v['og:image']==v['twitter:image']=='http://127.0.0.1:3000/opengraph-image',v
  assert v['og:image:type']=='image/png' and v['og:image:width']=='1200' and v['og:image:height']=='630',v
  assert v['twitter:card']=='summary_large_image' and v['og:locale']=='es_AR' and v['og:type']=='website',v
  assert v['og:image:alt']==v['twitter:image:alt'] and v['og:image:alt'],v
  samples.append({'route':route,'userAgent':ua,'status':status,'metadata':v})
with urllib.request.urlopen('http://127.0.0.1:3000/opengraph-image',timeout=20) as r:
 data=r.read();mime=r.headers.get_content_type();status=r.status
assert data[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',data[16:24])==(1200,630) and mime=='image/png'
(root/'preview-real.png').write_bytes(data)
(root/'metadata-ua.json').write_text(json.dumps({'samples':samples,'image':{'status':status,'mime':mime,'width':1200,'height':630,'bytes':len(data)},'scope':'compiled local responses; no external unfurl or production domain'},ensure_ascii=False,indent=2))
print(json.dumps({'samplesPassed':len(samples),'imageBytes':len(data),'dimensions':[1200,630]}))
