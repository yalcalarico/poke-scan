from pathlib import Path
import base64, datetime, difflib, hashlib, json, re

ROOT = Path(__file__).resolve().parents[5]
RES = ROOT / 'docs/plans/lanzamiento-2026-10-07/RESULTADOS'
EV = Path(__file__).resolve().parent
DOC = RES / 'BE-05-contrato-borrador.md'
REPORT = RES / 'BE-05-borrador-review.md'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def slug(text):
    text = re.sub(r'[`*_]', '', text.strip()).lower()
    return re.sub(r'[^\w\-\s]', '', text).replace(' ', '-')

baseline = json.loads((EV / 'baseline-review.json').read_text())
sources = [{'path': row['path'], 'before': row['sha256'], 'after': digest(ROOT / row['path'])} for row in baseline['sources']]
source_changes = [row for row in sources if row['before'] != row['after']]
received = []
for row in baseline['received']:
    item = {'copy': row['copy'], 'expectedSha256': row['sha256'], 'actualSha256': digest(EV / row['copy'])}
    if row['copy'] != 'BE-05-contrato-borrador-recibido.md':
        item['originalSha256'] = digest(ROOT / row['path'])
    received.append(item)
received_changes = [row for row in received if row['expectedSha256'] != row['actualSha256'] or row.get('originalSha256', row['expectedSha256']) != row['expectedSha256']]
historical_baseline = json.loads((EV / 'baseline-recibido.json').read_text())
historical_hashes = [{'path': row['path'], 'matchesObservedSource': digest(ROOT / row['path']) == row['sha256']} for row in historical_baseline['sources']]
historical_verification = json.loads((EV / 'verificacion-recibida.json').read_text())
links = []
for doc in [DOC, REPORT]:
    for match in re.finditer(r'\[[^\n]*?\]\(([^)]+)\)', doc.read_text()):
        target = match.group(1)
        path, _, anchor = target.partition('#')
        resolved = (doc.parent / path).resolve()
        row = {'document': str(doc.relative_to(ROOT)), 'target': target, 'exists': resolved.is_file()}
        if row['exists'] and anchor:
            lines = resolved.read_text().splitlines()
            if re.fullmatch(r'L\d+', anchor):
                number = int(anchor[1:])
                row['anchorValid'] = 1 <= number <= len(lines)
                if row['anchorValid']:
                    row['line'] = number
                    row['quotedLine'] = lines[number-1]
                    row['contextStartLine'] = max(1, number-2)
                    row['context'] = lines[max(0, number-3):number+5]
            else:
                headings = [slug(m.group(1)) for m in re.finditer(r'^#{1,6}\s+(.+)$', resolved.read_text(), re.M)]
                row['anchorValid'] = anchor in headings
        links.append(row)
broken = [row for row in links if not row['exists'] or row.get('anchorValid') is False]
old = (EV / 'BE-05-contrato-borrador-recibido.md').read_text().splitlines(keepends=True)
new = DOC.read_text().splitlines(keepends=True)
(EV / 'correcciones.diff').write_text(''.join(difflib.unified_diff(old, new, fromfile='BE-05-contrato-borrador-recibido.md', tofile='BE-05-contrato-borrador.md')))
semantic = [
    {'claim': 'Auth actual: endpoints/header/Origin/cookie/no-store de éxito; recovery códigos y headers de error son propuestos', 'sources': ['backend/src/modules/auth/auth.controller.ts', 'backend/src/modules/auth/session-security.ts', 'backend/src/main.ts'], 'review': 'Lectura del controller/helper/pipe: Origin ausente aceptado; no-store no garantizado en todos los errores. No atribuir Pragma ni códigos nuevos al código actual.'},
    {'claim': 'JWT guard/TTL/login/refresh y nueva autoridad de revocación', 'sources': ['backend/src/modules/auth/auth.service.ts', 'backend/src/modules/auth/auth.module.ts', 'backend/src/common/guards/jwt-auth.guard.ts', 'backend/prisma/schema.prisma'], 'review': 'Guard no consulta User; login verifica antes de issueSession, JWT se firma antes del lock de persistencia; refresh relee bajo User. User no tiene versión/estado/recovery. Orden, relectura, cutoff y atomicidad descritos son requisitos futuros, no garantías observadas.'},
    {'claim': 'No exposición de campos nuevos privados y separación del contrato cliente', 'sources': ['backend/src/modules/auth/auth.service.ts', 'backend/src/modules/users/users.service.ts', 'backend/src/common/types/auth-user.ts', 'frontend/types/api.ts', 'frontend/lib/api/api-client.ts', 'frontend/hooks/use-auth.tsx'], 'review': 'USER_SELECT/publicUserSelect explícitos, pero toPublicUser sólo elimina passwordHash por spread. ApiError sólo status/mensaje; provider carece de recovery. No se sustituyen contratos actuales con hechos futuros.'},
    {'claim': 'Origen público antes de caché, TTL/invalidation, SSR/SW y límite en vuelo', 'sources': ['backend/src/modules/share/share.service.ts', 'backend/src/modules/share/public-share.controller.ts', 'frontend/app/share/[slug]/page.tsx', 'frontend/public/sw.js'], 'review': 'getPublic consulta link activo/vigente antes de Redis; purge captura error; TTL min de 300 s/expiry. SSR no-store, missing genérico; SW excluye/purga share y API/s fuera de allowlist. No acreditan barrera retroactiva ni estado nuevo de User.'},
    {'claim': 'Cascadas/ownership y separación personal frente catálogo/jobs', 'sources': ['backend/prisma/schema.prisma', 'backend/src/modules/collections/collections.service.ts', 'backend/src/modules/share/share.service.ts'], 'review': 'Relaciones personales Cascade, ScanJob personal; PriceRefreshJob/ProviderRateLimit/SyncState globales. Ownership inspeccionado en where. No prueba migraciones aplicadas, eliminación ejecutada ni bloqueo actual de todos los escritores.'},
    {'claim': 'Gates y eliminación condicional, recuperación Free independiente', 'sources': ['docs/plans/lanzamiento-2026-10-07/02-backend.md', 'docs/plans/lanzamiento-2026-10-07/10-decisiones-y-contratos.md', 'docs/plans/lanzamiento-2026-10-07/RESULTADOS/NEG-03-cuenta-requisitos.md', 'docs/plans/lanzamiento-2026-10-07/RESULTADOS/NEG-03-cuenta-review.md', 'docs/plans/lanzamiento-2026-10-07/RESULTADOS/NEG-03-cuenta-aceptacion-root.json', 'docs/plans/lanzamiento-2026-10-07/03-ui-ux.md', 'docs/plans/lanzamiento-2026-10-07/01-frontend.md'], 'review': 'DEC-05 permite preparación independiente. BE-05 implementa endpoint sólo si NEG-03 exige; UX-04 requiere borrador, no implementación. Dictamen limitado a UX-04 documental; IDs/gates no se cierran.'},
    {'claim': 'Backups y supresión posterior al snapshot', 'sources': ['infra/inf03/README.md', 'docs/plans/lanzamiento-2026-10-07/RESULTADOS/INF-03-local-review.md'], 'review': 'Ensayo local sintético y consumidor técnico no deciden off-host/retención ni prueban supresión post-snapshot. Contrato mantiene decisiones y prueba de restore pendientes.'},
]
arithmetic = {'randomBytesProposed': 32, 'entropyBits': 32*8, 'base64urlUnpaddedChars': len(base64.urlsafe_b64encode(bytes(32)).rstrip(b'=')), 'ttlMinutesProposed': 30, 'ttlSeconds': 30*60, 'rollingAdmissionLimitProposed': 3, 'rollingWindowSeconds': 60*60, 'minIntervalSecondsProposed': 60, 'reasoning': 'Una ventana móvil estricta de 1 h que admite a lo sumo 3 pedidos implica a lo sumo 3 emisiones durante 30 min. Cap activo se verifica además bajo User; cuota/cap agotados impiden garantizar reenvío en 60 s. Propuestas sin ensayo.'}
ver = {'checkedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'scope': 'Verificación documental estática; sin tests/runtime/sistemas externos', 'documentSha256': digest(DOC), 'reportSha256': digest(REPORT), 'historicalEvidence': {'sourcesDeclared': len(historical_baseline['sources']), 'linksDeclared': historical_verification['links'], 'documentHashMatchesReceived': historical_verification['documentSha256'] == digest(EV / 'BE-05-contrato-borrador-recibido.md'), 'historicalSourceHashes': historical_hashes}, 'sourceCount': len(sources), 'sources': sources, 'sourceChanges': source_changes, 'received': received, 'receivedChanges': received_changes, 'linkCount': len(links), 'links': links, 'brokenLinks': broken, 'semanticSupport': {'method': 'Contraste manual Sol HIGH de contenido y contexto de fuentes locales; enlace/anchor válido por sí solo no acredita soporte ni funcionalidad futura.', 'findings': semantic}, 'arithmetic': arithmetic, 'invariantsReviewedManually': ['Solicitar/reenvío no cambia clave, bloquea cuenta, revoca sesión ni invalida enlaces anteriores', 'Nuevo secreto permitido sin almacenamiento reversible; sólo memoria sandbox, entrega incierta y límites residuales explícitos', 'User primero; releer token/hash/versión/estado existente o futuro dentro de tx; no decisión vieja emite credencial usable post-reset', 'authVersion recomendado único; legacy 0/cutoff sin máxima expiración histórica inventada', '202 genérico sin promesa entrega; códigos/DTO/red distintos; GET/mount/preview no consumen; sin replay automático', 'Cookie/cliente sólo limpio tras éxito confirmado; campos privados allowlist', 'Eliminación condicional y estado durable requerido para 202; origen antes de cache; requests en vuelo y copias externas limitados', 'Catálogo/jobs compartidos intactos; backups/retención/operator/restore pendientes; gates/IDs sin cerrar'], 'limitations': 'Invariantes/requisitos revisados semánticamente, no implementados ni probados en runtime. Hashes selectivos describen el instante de verificación, no estabilidad global o posterior de centrales.'}
(EV / 'verificacion.json').write_text(json.dumps(ver, ensure_ascii=False, indent=2)+'\n')
artifacts = [DOC, REPORT] + [p for p in sorted(EV.iterdir()) if p.is_file() and p.name != 'hashes-finales.json']
(EV / 'hashes-finales.json').write_text(json.dumps({'checkedAtUtc': ver['checkedAtUtc'], 'scope': 'Artefactos documentales reales; archivo de hashes no se hashea a sí mismo', 'artifacts': [{'path': str(p.relative_to(ROOT)), 'sha256': digest(p), 'bytes': p.stat().st_size} for p in artifacts]}, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'sourceCount': len(sources), 'sourceChanges': source_changes, 'receivedChanges': received_changes, 'linkCount': len(links), 'brokenLinks': broken, 'historicalSourceMismatches': [x for x in historical_hashes if not x['matchesObservedSource']], 'arithmetic': arithmetic, 'documentSha256': digest(DOC), 'reportSha256': digest(REPORT)}, ensure_ascii=False, indent=2))
if source_changes or received_changes or broken:
    raise SystemExit('Verificación documental requiere revisión')
