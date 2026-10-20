from pathlib import Path
import datetime, difflib, hashlib, json, re
ROOT=Path(__file__).resolve().parents[5]
RES=ROOT/'docs/plans/lanzamiento-2026-10-07/RESULTADOS'
EV=Path(__file__).resolve().parent
DOC=RES/'UX-04-cuenta.md'
REPORT=RES/'UX-04-review.md'
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def slug(t): return re.sub(r'[^\w\-\s]','',re.sub(r'[`*_]','',t.strip()).lower()).replace(' ','-')
baseline=json.loads((EV/'baseline-review.json').read_text())
sources=[{'path':r['path'],'before':r['sha256'],'after':digest(ROOT/r['path'])} for r in baseline['sources']]
source_changes=[r for r in sources if r['before']!=r['after']]
received=[]
for r in baseline['received']:
 item={'copy':r['copy'],'expected':r['sha256'],'actual':digest(EV/r['copy'])}
 if r['copy']!='UX-04-cuenta-recibido.md': item['original']=digest(ROOT/r['path'])
 received.append(item)
received_changes=[r for r in received if r['expected']!=r['actual'] or r.get('original',r['expected'])!=r['expected']]
old=(EV/'UX-04-cuenta-recibido.md').read_text().splitlines(keepends=True)
new=DOC.read_text().splitlines(keepends=True)
(EV/'correcciones.diff').write_text(''.join(difflib.unified_diff(old,new,fromfile='UX-04-cuenta-recibido.md',tofile='UX-04-cuenta.md')))
# Crear los destinos propios antes de validar los enlaces del informe.
for name in ['verificacion.json','hashes-finales.json']:
 if not (EV/name).exists(): (EV/name).write_text('{}\n')
links=[]
for doc in [DOC,REPORT]:
 for match in re.finditer(r'\[[^\n]*?\]\(([^)]+)\)',doc.read_text()):
  target=match.group(1);path,_,anchor=target.partition('#');p=(doc.parent/path).resolve()
  row={'document':str(doc.relative_to(ROOT)),'target':target,'exists':p.exists()}
  if p.is_file() and anchor:
   row['anchorValid']=anchor in [slug(m.group(1)) for m in re.finditer(r'^#{1,6}\s+(.+)$',p.read_text(),re.M)]
  elif anchor: row['anchorValid']=False
  links.append(row)
broken=[r for r in links if not r['exists'] or r.get('anchorValid') is False]
historical=json.loads((EV/'baseline-selectivo-recibido.json').read_text())
history_checks=[{'path':r['path'],'matchesObserved':digest(ROOT/r['path'])==r['sha256']} for r in historical['sources']]
semantic=[
 {'sources':['frontend/components/auth/auth-shell.tsx','frontend/docs/design-system.md'],'observed':'AuthShell h1 máximo 4 palabras y max-w-md; design §10.1 Button hasta 3 palabras/Alert body ~140 caracteres. Títulos y acciones corregidos; no se afirma layout renderizado.'},
 {'sources':['frontend/components/auth/login-form.tsx','frontend/components/ui/field.tsx','frontend/components/ui/button.tsx','frontend/components/ui/alert.tsx'],'observed':'Login usa Field/useFieldA11y, noValidate, loading/pending y Alert de submit; Field requiere aria-invalid del consumidor; Button nativo sin asChild, Alert error role alert y otros status/polite. Navegación Link y foco/roles son requisitos futuros.'},
 {'sources':['frontend/components/ui/password-input.tsx','frontend/components/ui/input.tsx'],'observed':'PasswordInput TOGGLE_SIZES md/lg h-10 w-10, con nombres dinámicos y aria-pressed. Input md h-11; className va wrapper. Exigir 44 local no declara que primitiva ya lo cumpla ni describe un override existente.'},
 {'sources':['frontend/hooks/use-auth.tsx','frontend/lib/api/token-storage.ts','frontend/lib/api/api-client.ts'],'observed':'Access memoria/pista, AuthProvider maneja user separado. ApiError status/mensaje y refreshInFlight actual; impedir respuesta antigua y consumir code/fields son adaptaciones futuras, no protección existente.'},
 {'sources':['docs/plans/lanzamiento-2026-10-07/RESULTADOS/BE-05-contrato-borrador.md','docs/plans/lanzamiento-2026-10-07/RESULTADOS/BE-05-borrador-aceptacion-root.json','backend/src/modules/auth/dto/register.dto.ts'],'observed':'Contrato aceptado sólo documental: 202 recepción, secreto 32 bytes/43 chars sólo hash, body POST necesario, 30 min y reenvío 60 s sujetos a cupos, códigos/fields, User primero/authVersion PG y success tras commit. Reset contraseña 8–72, confirmación sólo local. UX no duplica política de locks/token ni afirma implementación.'},
 {'sources':['frontend/docs/routes.md','frontend/docs/build-guide.md','frontend/docs/gotchas.md','/Users/ysmaelalcalarico/.codex/skills/frontend-ios-elegante/SKILL.md','/Users/ysmaelalcalarico/.codex/skills/frontend-ios-elegante/references/direccion-visual.md'],'observed':'Rama auth PlainShell sin nav; providers raíz; recuperación no aparece en rutas actuales. Skill solicita propuesta de estados/mobile-desktop/44/AA y no código por diseño. Descripción visual leída; no capturas vistas ni QA ejecutada.'}
]
invariants=['Bare sin marcador=solicitud; link perdido con marcador no secreto=salida segura, sin afirmar detectar recarga','history.state preserva estado preexistente y carece token/email/clave/identidad; marcador indisponible degrada a solicitud','Captura previa idempotente StrictMode; montaje/GET/preview/back/recarga no consumen/validan API/reenvían','Secreto sólo memoria y body POST necesario; ausente de URL API/storage/log/evidencia/analytics y transferencia a login','202 no promete entrega ni repite email; correo planificado ficticio con duración propuesta, sin envío','400 INPUT_INVALID por fields distinto de RECOVERY_LINK_INVALID; 403 acción y 429 positivos/fallback sin live countdown','503/cuerpo200inválido/redcambio=incierto, login primario/nuevo enlace secundario, no replay ni limpieza como éxito','Limpieza tras éxito confirmado/race protección FE futura; no auto-auth ni cierre visual otros dispositivos','Título cambio 4 palabras, CTA≤3, Alert breve y A11y como criterios pendientes; toggle actual40 vs requisito44 local','Eliminación/operación pendientes; gates/IDs no cerrados; no QA/runtime/tests/red/correo ni centrales']
ver={'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Estática selectiva documental UX-04; no auditoría global, pruebas funcionales o QA','documentSha256':digest(DOC),'reportSha256':digest(REPORT),'documentLines':len(DOC.read_text().splitlines()),'historicalEvidence':{'sourceCount':len(historical['sources']),'linkCount':len(json.loads((EV/'verificacion-estatica-recibida.json').read_text())['links']),'historicalSourceHashes':history_checks},'sources':sources,'sourceCount':len(sources),'sourceChanges':source_changes,'received':received,'receivedChanges':received_changes,'links':links,'linkCount':len(links),'brokenLinks':broken,'semanticReview':{'method':'Contraste manual Sol HIGH de contenido/contexto. Enlace existente/anchor válido no es prueba de soporte semántico ni funcionalidad.','support':semantic,'invariantsReviewedManually':invariants},'documentalArithmetic':{'changeTitleWords':len('Elegí tu nueva contraseña'.split()),'recoveryTokenShapeCharsProposed':43,'minResendSecondsProposed':60,'retryAfterFallbackSecondsProposed':60,'mailTtlMinutesProposed':30,'mailTtlSeconds':30*60,'recoveryActiveTokenCapInContract':3,'passwordMin':8,'passwordMax':72,'limits':'Especificaciones propuestas/contrato y DTO existentes; no resultados de runtime ni garantía de entrega.'},'limitations':'Protecciones de fragmento/historial/cancelación, parseo respuesta/fields/header, sandbox de correo y controles de sesión quedan por implementar y probar. Hashes reflejan fuentes selectivas en este instante, no estabilidad global/posterior.'}
(EV/'verificacion.json').write_text(json.dumps(ver,ensure_ascii=False,indent=2)+'\n')
artifacts=[DOC,REPORT]+[p for p in sorted(EV.iterdir()) if p.is_file() and p.name!='hashes-finales.json']
(EV/'hashes-finales.json').write_text(json.dumps({'checkedAtUtc':ver['checkedAtUtc'],'scope':'Artefactos propios documentales; excluye autorreferencia del manifiesto','artifacts':[{'path':str(p.relative_to(ROOT)),'sha256':digest(p),'bytes':p.stat().st_size} for p in artifacts]},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sourceCount':len(sources),'sourceChanges':source_changes,'receivedChanges':received_changes,'historicalSourceMismatches':[r for r in history_checks if not r['matchesObserved']],'linkCount':len(links),'brokenLinks':broken,'documentLines':ver['documentLines'],'documentSha256':digest(DOC),'reportSha256':digest(REPORT),'artifactHashes':len(artifacts)},ensure_ascii=False,indent=2))
if source_changes or received_changes or broken: raise SystemExit('Requiere revisión documental')
