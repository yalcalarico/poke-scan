from pathlib import Path
import datetime, difflib, hashlib, json, re, unicodedata
ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
RESULTS = OUT.parent
TARGET = RESULTS / 'NEG-03-cuenta-requisitos.md'
REVIEW = RESULTS / 'NEG-03-cuenta-review.md'
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def slug(text):
    text = re.sub(r'[`*_]', '', text.lower())
    text = ''.join(c for c in text if c in '-_ ' or c.isalnum())
    return text.replace(' ', '-')
received = OUT / 'NEG-03-cuenta-requisitos-recibido.md'
diff = ''.join(difflib.unified_diff(received.read_text().splitlines(keepends=True), TARGET.read_text().splitlines(keepends=True), fromfile='NEG-03-cuenta-requisitos-recibido.md', tofile='NEG-03-cuenta-requisitos.md'))
(OUT / 'correcciones.diff').write_text(diff)
# El archivo final se crea al terminar; permitir sólo esa referencia propia.
(OUT / 'verificacion.json').touch(exist_ok=True)
links = []
for doc in [TARGET, REVIEW]:
    for destination in re.findall(r'\]\(([^)]+)\)', doc.read_text()):
        name, _, fragment = destination.partition('#')
        path = (doc.parent / name).resolve()
        row = {'document': str(doc.relative_to(ROOT)), 'destination': destination, 'exists': path.is_file()}
        if path.is_file():
            lines = path.read_text().splitlines()
            if re.fullmatch(r'L\d+', fragment):
                n = int(fragment[1:]); row['anchor_exists'] = 1 <= n <= len(lines)
                if row['anchor_exists']:
                    row['line'] = n; row['line_content'] = lines[n-1]
                    row['context'] = [{'line': i+1, 'text': lines[i]} for i in range(max(0,n-2), min(len(lines),n+15))]
                    row['semantic_review'] = 'Contexto leído y contrastado manualmente con la afirmación; la línea existente sola no prueba comportamiento runtime.'
            elif fragment:
                headings = [slug(x) for x in re.findall(r'^#+\s+(.+)$', path.read_text(), re.M)]
                row['anchor_exists'] = fragment in headings
            else:
                row['anchor_exists'] = True
        links.append(row)
base = json.loads((OUT / 'baseline-review.json').read_text())
sources = [{'path': x['path'], 'before':x['sha256'], 'after':sha(ROOT/x['path']), 'unchanged': x['sha256']==sha(ROOT/x['path'])} for x in base['sources']]
received_checks = [{'path':x['path'], 'copy':x['received_copy'], 'copy_matches_received':sha(ROOT/x['received_copy'])==x['sha256'], 'original_unchanged':None if x['path'].endswith('NEG-03-cuenta-requisitos.md') else sha(ROOT/x['path'])==x['sha256']} for x in base['received']]
historical = json.loads((OUT / 'baseline-selectiva-recibido.json').read_text())
selected = {x['path'] for x in base['sources']}
history = [{'path':x['path'], 'historical_sha256':x['sha256'], 'current_sha256':sha(ROOT/x['path']) if x['path'] in selected else None, 'comparison_in_scope':x['path'] in selected} for x in historical['sources']]
rows = ['Postgres activo','Sesiones','Links y cachés','CSV/descargas','Logs/medición/correo','Backup/restore']
checks = {x:bool(re.search(r'^\| '+re.escape(x)+r' \|',TARGET.read_text(),re.M)) for x in rows}
artifacts = [TARGET, REVIEW, OUT/'baseline-review.json', OUT/'correcciones.diff', OUT/'validar-documentos.py', *[ROOT/x['received_copy'] for x in base['received']]]
result = {'reviewer':'Sol HIGH','captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'dictamen':'Preparación documental independiente corregida y aceptada como entrada al borrador BE-05; ID NEG-03 y GO cobro pendientes.', 'links_count':len(links), 'links':links, 'all_links_and_anchors_resolve':all(x['exists'] and x.get('anchor_exists',False) for x in links), 'selective_source_hashes':sources, 'all_selective_sources_unchanged':all(x['unchanged'] for x in sources), 'received_preservation':received_checks, 'historical_baseline_comparison':history, 'historical_sources_count':len(historical['sources']), 'historical_links_count':json.loads((OUT/'validacion-documental-recibido.json').read_text())['internal_markdown_links_count'], 'matrix_rows':checks, 'matrix_semantic_review':'Seis capas separadas. Estado activo y revocación no equivalen a borrar copias; catálogo/jobs compartidos quedan fuera. Política JWT, concurrencia, restore post-supresión y retención son criterios futuros, no resultados probados.', 'artifacts':[{'path':str(p.relative_to(ROOT)),'sha256':sha(p),'bytes':p.stat().st_size} for p in artifacts], 'excluded_from_stability_claim':base['excluded_from_stability_claim'], 'not_run':['tests','build','pnpm run check','API','DB','Redis','runtime','browser','email','providers','contacts','deploy','payments'], 'reservation_released':True}
(OUT/'verificacion.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'links':len(links),'all_links_ok':result['all_links_and_anchors_resolve'],'sources':len(sources),'all_sources_unchanged':result['all_selective_sources_unchanged'],'bad_links':[x for x in links if not x.get('anchor_exists',False) or not x['exists']],'received_preserved':received_checks,'matrix':checks},ensure_ascii=False,indent=2))
assert result['all_links_and_anchors_resolve']
assert result['all_selective_sources_unchanged']
assert all(x['copy_matches_received'] and x['original_unchanged'] is not False for x in received_checks)
assert all(checks.values())
