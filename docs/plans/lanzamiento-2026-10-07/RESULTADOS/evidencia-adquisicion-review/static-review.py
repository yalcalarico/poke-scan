from pathlib import Path
import json,re
out=Path(__file__).resolve().parent
css=Path('frontend/app/globals.css').read_text();image=Path('frontend/app/(marketing)/opengraph-image.tsx').read_text()
blocks={key:re.search(pattern,css,re.S).group(1) for key,pattern in [('light',r':root\s*\{(.*?)\n\}'),('dark',r'\.dark\s*\{(.*?)\n\}')]}
values={theme:dict(re.findall(r'--([\w-]+):\s*(#[\da-fA-F]{6});',block)) for theme,block in blocks.items()}
def lumi(hex):
 rgb=[int(hex[i:i+2],16)/255 for i in (1,3,5)]
 lin=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
 return sum(a*b for a,b in zip(lin,[.2126,.7152,.0722]))
def contrast(a,b):
 a,b=sorted([lumi(a),lumi(b)]);return (b+.05)/(a+.05)
contrast_rows=[{'theme':theme,'background':'surface-2','token':'text-tertiary','value':vals['text-tertiary'],'ratio':contrast(vals['text-tertiary'],vals['surface-2']),'passesAA':contrast(vals['text-tertiary'],vals['surface-2'])>=4.5} for theme,vals in values.items()]
named=re.search(r'const LIGHT_TOKENS = \{(.*?)\} as const;',image,re.S).group(1)
tokens=dict(re.findall(r"(\w+): '(#[\da-fA-F]{6})'",named))
mapping={'canvas':'canvas','brand':'brand','textPrimary':'text-primary','textSecondary':'text-secondary'}
rows=[{'imageName':k,'cssToken':'--'+mapping[k],'value':v,'matchesCurrentRoot':v==values['light'][mapping[k]]} for k,v in tokens.items()]
assert all(r['matchesCurrentRoot'] for r in rows)
checks=[]
for p in ['frontend/components/marketing/landing-page.tsx','frontend/app/(marketing)/faq/page.tsx']:
 before=(out/'recibido'/p).read_text();after=Path(p).read_text()
 checks.append({'path':p,'receivedMainId':bool(re.search(r'<main[^>]*id="contenido"',before)),'currentMainId':bool(re.search(r'<main[^>]*id="contenido"',after))})
result={'method':'Lectura local y contraste WCAG2.x calculado desde tokens CSS; no browser/render','contrast':contrast_rows,'imageTokens':rows,'skipLinkTargets':checks,'fontSourceReview':'Next16.3.6 compiled/@vercel/og/index.node.js carga Geist-Regular.ttf con fs; existe fallback de assets dinámicos. No se ejecutó ImageResponse ni se midió red en revisión.'}
(out/'static-review.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
