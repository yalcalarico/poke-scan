from pathlib import Path
from urllib.parse import unquote,urlsplit
import hashlib,json,re,datetime,difflib

ROOT=Path(__file__).resolve().parents[5]
OUT=Path(__file__).resolve().parent
RESULT=OUT.parent
BRIEF=RESULT/'SEO-03-contenido.md'
REVIEW=RESULT/'SEO-03-review.md'
BASE=json.loads((OUT/'baseline.json').read_text())
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def anchors(p):
    result=[]
    for heading in re.findall(r'^#{1,6}\s+(.+)$',p.read_text(),re.M):
        title=heading.lower().replace('`','')
        title=re.sub(r'[^\w\s\-]','',title,flags=re.UNICODE)
        result.append(re.sub(r'\s','-',title))
    return result

doc_links=[]
for doc in [BRIEF,REVIEW]:
    for label,target in re.findall(r'\[([^\]]+)\]\(([^\n]+?)\)',doc.read_text()):
        parts=urlsplit(target)
        if parts.scheme in ['http','https']: continue
        path=(doc.parent/unquote(parts.path)).resolve() if parts.path else doc
        entry={'document':str(doc.relative_to(ROOT)),'target':target,'exists':path.exists()}
        if parts.fragment:
            entry['anchorExists']=path.is_file() and unquote(parts.fragment) in anchors(path)
        doc_links.append(entry)

rows=re.findall(r'^\| `([^`]+)` \| `([^`]+)` \|$',BRIEF.read_text(),re.M)
source_rows=[]
for name,value in rows:
    source_rows.append({'path':name,'reported':value,'validSha256Format':bool(re.fullmatch('[a-f0-9]{64}',value)),'matchesBaseline':BASE['sources'].get(name)==value,'currentSha256':digest(ROOT/name) if (ROOT/name).is_file() else None})
source_paths=[x['path'] for x in source_rows]
missing=sorted(set(BASE['sources'])-set(source_paths))
extra=sorted(set(source_paths)-set(BASE['sources']))
duplicates=sorted(x for x in set(source_paths) if source_paths.count(x)>1)
product={}
for prefix in ['frontend/app','frontend/components','frontend/hooks','frontend/lib','frontend/types','frontend/public','backend/src','backend/prisma']:
    for p in (ROOT/prefix).rglob('*'):
        if p.is_file(): product[str(p.relative_to(ROOT))]=digest(p)
changed=[p for p,v in BASE['productFiles'].items() if p in product and product[p]!=v]
removed=sorted(set(BASE['productFiles'])-set(product))
added=sorted(set(product)-set(BASE['productFiles']))
parts=re.split(r'^### Brief \d+[^\n]*\n',BRIEF.read_text(),flags=re.M)[1:]
brief_checks=[]
for n,content in enumerate(parts,1):
    if n==len(parts): content=content.split('## Preview OG/Twitter')[0]
    brief_checks.append({'piece':n,'intentionHypothetical': '**Intención hipotética:**' in content,'question':'**Pregunta que resuelve:**' in content,'evidence':'**Claims y evidencia:**' in content,'cta':'**CTA existente:**' in content,'manualMeasurement':'**Medición RES-03, manual:**' in content,'publicCatalogCta':'/buscar' in content})
new_route_candidates=['guias/duplicadas-pokemon','guias/variantes-pokemon','guias/referencia-usd-ars']
route_candidates=[{'proposal':'/'+s,'routeFilesFound':[str(p.relative_to(ROOT)) for p in (ROOT/'frontend/app').rglob('page.*') if str(p.parent.relative_to(ROOT/'frontend/app')).replace('(marketing)/','')==s]} for s in new_route_candidates]
metadata_files=sorted(str(p.relative_to(ROOT)) for p in (ROOT/'frontend/app').rglob('*') if p.is_file() and re.match(r'(opengraph-image|twitter-image)(\.|$)',p.name))
metadata_observations=[]
for name in ['frontend/app/layout.tsx','frontend/app/(marketing)/layout.tsx','frontend/app/(marketing)/page.tsx','frontend/app/(marketing)/faq/page.tsx']:
    content=(ROOT/name).read_text()
    no_comments=re.sub(r'/\*[\s\S]*?\*/|//[^\n]*','',content)
    metadata_observations.append({'path':name,'declaresMetadata':bool(re.search(r'export\s+const\s+metadata',content)),'declaresOpenGraph':bool(re.search(r'\bopenGraph\s*:',no_comments)),'imagePropertyLines':[line.strip() for line in no_comments.splitlines() if re.match(r'^\s*images\s*:',line)],'scope':'observación estática de fuentes; no extracción de head'})
issues=[]
issues += [{'localLink':x} for x in doc_links if not x['exists'] or x.get('anchorExists') is False]
issues += [{'hashRow':x} for x in source_rows if not x['validSha256Format'] or not x['matchesBaseline']]
if missing or extra or duplicates: issues.append({'sourceCoverage':{'missing':missing,'extra':extra,'duplicates':duplicates}})
if changed or added or removed: issues.append({'productChangesObserved':{'changed':changed,'added':added,'removed':removed}})
for item in brief_checks:
    if not all(v for k,v in item.items() if k!='piece'): issues.append({'briefStructure':item})
for doc in [BRIEF,REVIEW]:
    if re.search(r'^(<<<<<<<|=======|>>>>>>>)',doc.read_text(),re.M): issues.append({'conflictMarker':str(doc.relative_to(ROOT))})
result={'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'receivedCopyMatches':digest(OUT/'SEO-03-contenido-recibido.md')==BASE['receivedSha256'],'sourceRows':source_rows,'sourceTableCoverage':{'missing':missing,'extra':extra,'duplicates':duplicates},'sourceDriftSinceBaseline':[x for x in source_rows if x['currentSha256']!=x['reported']],'localLinks':doc_links,'briefStructure':brief_checks,'editorialRouteProposals':route_candidates,'metadataFilesInApp':metadata_files,'acquisitionMetadataSources':metadata_observations,'productPreservation':{'baselineCount':len(BASE['productFiles']),'afterCount':len(product),'changed':changed,'added':added,'removed':removed,'excludedConcurrentWork':BASE['excludedConcurrentWork']},'issues':issues,'passed':not issues}
if not result['receivedCopyMatches']: result['issues'].append({'receivedCopy':'mismatch'});result['passed']=False
(OUT/'validacion.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':result['passed'],'issues':issues,'links':len(doc_links),'hashRows':len(source_rows),'briefs':len(brief_checks),'product':result['productPreservation'],'sourceDriftCount':len(result['sourceDriftSinceBaseline'])},ensure_ascii=False,indent=2))
raise SystemExit(0 if result['passed'] else 1)
