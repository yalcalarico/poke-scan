from pathlib import Path
import datetime,difflib,hashlib,json,re
ROOT=Path(__file__).resolve().parents[5]
RES=ROOT/'docs/plans/lanzamiento-2026-10-07/RESULTADOS'
EV=Path(__file__).resolve().parent
DOC=RES/'INF-01-correo-sandbox.md'
REPORT=RES/'INF-01-correo-sandbox-review.md'
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def slug(t): return re.sub(r'[^\w\-\s]','',re.sub(r'[`*_]','',t.strip()).lower()).replace(' ','-')
b=json.loads((EV/'baseline-review.json').read_text())
sources=[{'path':r['path'],'before':r['sha256'],'after':digest(ROOT/r['path'])} for r in b['sources']]
source_changes=[r for r in sources if r['before']!=r['after']]
received=[]
for r in b['received']:
 row={'copy':r['copy'],'expected':r['sha256'],'actual':digest(EV/r['copy'])}
 if r['copy']!='INF-01-correo-sandbox-recibido.md': row['original']=digest(ROOT/r['path'])
 received.append(row)
received_changes=[r for r in received if r['expected']!=r['actual'] or r.get('original',r['expected'])!=r['expected']]
old=(EV/'INF-01-correo-sandbox-recibido.md').read_text().splitlines(keepends=True)
new=DOC.read_text().splitlines(keepends=True)
(EV/'correcciones.diff').write_text(''.join(difflib.unified_diff(old,new,fromfile='INF-01-correo-sandbox-recibido.md',tofile='INF-01-correo-sandbox.md')))
for name in ['verificacion.json','hashes-finales.json']:
 if not (EV/name).exists(): (EV/name).write_text('{}\n')
links=[]
for doc in [DOC,REPORT]:
 for m in re.finditer(r'\[[^\n]*?\]\(([^)]+)\)',doc.read_text()):
  target=m.group(1);path,_,anchor=target.partition('#');p=(doc.parent/path).resolve()
  row={'document':str(doc.relative_to(ROOT)),'target':target,'exists':p.exists()}
  if p.is_file() and anchor: row['anchorValid']=anchor in [slug(x.group(1)) for x in re.finditer(r'^#{1,6}\s+(.+)$',p.read_text(),re.M)]
  elif anchor: row['anchorValid']=False
  links.append(row)
broken=[r for r in links if not r['exists'] or r.get('anchorValid') is False]
historical=json.loads((EV/'baseline-recibido.json').read_text())
history_checks=[{'path':name,'matchesObserved':digest(RES/name)==sha} for name,sha in historical['sourceSha256'].items()]
original_check=json.loads((EV/'verificacion-recibida.json').read_text())
semantic=[
 {'sources':['BE-05-contrato-borrador.md','BE-05-borrador-review.md','BE-05-borrador-aceptacion-root.json'],'support':'Contrato documental aceptado: sólo hash, transporte en memoria, 202 sin await entrega/garantía, admisión común, User primero/relectura/version PG, reenvío sin evicción y recuperación tras pérdida. No cambiar esas autoridades desde adapter ni caseGeneration.'},
 {'sources':['UX-04-cuenta.md','UX-04-review.md','UX-04-aceptacion-root.json'],'support':'UX documental aceptada: plantilla/fragmento mem/body POST necesario, success confirmado/resultado incierto/login sin transferir secretos, reenvío explícito60s sujeto a cuota. Sandbox no duplica ni implementa estados.'},
 {'sources':['NEG-03-cuenta-requisitos.md'],'support':'Preparación de cuenta no entrega correo real ni exige Pro. Fixtures/sandbox sin entrega externa y datos activos/copies/retención pendientes. No declarar operación/cumplimiento desde memoria.'},
 {'sources':['INF-01-entorno.md','INF-01-review.md'],'support':'Mailtrap es propuesta histórica sin cuenta/envío. Esta fase no revalida tarifas ni elige/configura proveedor; externo con secretos recuperables exige nuevo contrato, no compatibilidad automática con sólo hash.'},
 {'sources':['AGENTS.md','../05-infraestructura.md','../11-orquestacion.md'],'support':'Versiones/ownership/contratos y fases deben preservarse. INF-01 identifica correo de prueba sin entrega real; alcance humano vigente focal BE07 y gate fallido impiden nuevas suites/runtime. Revisión SolHIGH sólo documental, no cierre operativo/ID.'}
]
invariants=[
 'caseGeneration: teardown local; reset real futura misma generación con enlace tardío rechazado PG y otro token fixture previamente válido antes ticket; no reemisión2s/cuota omitida/timeout extendido, pruebas emisión-cuotas separadas',
 'Entrega deadline2s y receptor lease120s/cap32 separados; cancelación/drain/finally/referencias controlables sin zeroización/GC',
 'Delay/never-resolve cooperativos, sin promesa/closure huérfana con raw; Promise.race sola no cancela',
 'DI harness opt-in, no productivo, loopback, DBowner-marker exacto y allowlist fixtures antespayload; enum/sufijo no bastan',
 'Startup inválido reject anteslistener; puerto general indisponible503 anteslookupambos; no SMTP/fallback/options existentes',
 'LimitadorBE05compartido autoridad; poolticket32 prelookupambos, reserva/plazo fijo2s y liberaciónpor reloj/cierre, no según cuenta',
 'Saturación/handoff/capacityfallan con202genérico, no awaitdelivery/señal/código nuevo; timingsno medidos',
 'Secreto sólo memoria/privateDI/bodyPOSTlegítimo; no admincaptureAPI/filesystem/report/snapshot/toolargs/logs/traces/screenshots',
 'Assertions internas bool/code fijo y hashes artefactos no secretos; no reporter actual/expectedraw/body/email',
 'fail-after-hash-commit hookissuer, noadapter decide tx; late-reset distinta late-case-teardown; todos propuestos no actual recovery',
 'Cleanup futuro sólo recursos propiosbounded; no contacto/red entrega/SMTP/cuentas ni claim sandbox ready/IDs gates closed'
]
ver={'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Revisión documental estática selectiva, sin auditoría global ni ensayo funcional','documentSha256':digest(DOC),'reportSha256':digest(REPORT),'documentLines':len(DOC.read_text().splitlines()),'historicalEvidence':{'sourceCount':len(historical['sourceSha256']),'linkCount':original_check['localLinksChecked'],'documentHashMatchesReceived':original_check['proposalSha256']==digest(EV/'INF-01-correo-sandbox-recibido.md'),'historicalSourceHashes':history_checks},'sourceCount':len(sources),'sources':sources,'sourceChanges':source_changes,'received':received,'receivedChanges':received_changes,'linkCount':len(links),'links':links,'brokenLinks':broken,'semanticReview':{'method':'Contraste manualSolHIGH de contenido/contexto. Existencia/enlace/anchor no acredita soporte ni garantías implementadas.','sourceSupport':semantic,'invariantsReviewedManually':invariants},'proposedParameterArithmetic':{'deliveryDeadlineSeconds':2,'deliveryDeadlineMs':2000,'receiverLeaseSeconds':120,'receiverLeaseMs':120000,'leaseToDeliveryRatio':60,'commonTicketPoolCap':32,'fifoPendingCap':32,'receiverCapturedEnvelopeCap':32,'consumerCount':1,'limits':'Tres caps separados; no se suman como capacidad garantizada ni limitador compartido. Parámetros sólo propuestos, no deadlines/memoria/capacidad medidos ni promesa GC.'},'limits':'Sin env/secrets/preciosactuales/proveedores ni implementación/tests/runtime/DB/Redis/red/correo. Fuente central hash antes de eventual consolidación root, sin promesa estabilidad posterior/global. Guardas/tickets/cancelación/reporters/PG requieren futuro ensayo autorizable, no se ejecutó ninguno.'}
(EV/'verificacion.json').write_text(json.dumps(ver,ensure_ascii=False,indent=2)+'\n')
artifacts=[DOC,REPORT]+[p for p in sorted(EV.iterdir()) if p.is_file() and p.name!='hashes-finales.json']
(EV/'hashes-finales.json').write_text(json.dumps({'checkedAtUtc':ver['checkedAtUtc'],'scope':'Artefactos documentales propios reales; excluye autorreferencia','artifacts':[{'path':str(p.relative_to(ROOT)),'sha256':digest(p),'bytes':p.stat().st_size} for p in artifacts]},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sourceCount':len(sources),'sourceChanges':source_changes,'receivedChanges':received_changes,'historicalSourceMismatches':[r for r in history_checks if not r['matchesObserved']],'linkCount':len(links),'brokenLinks':broken,'documentLines':ver['documentLines'],'documentSha256':digest(DOC),'reportSha256':digest(REPORT),'artifactHashes':len(artifacts)},ensure_ascii=False,indent=2))
if source_changes or received_changes or broken: raise SystemExit('Requiere revisión documental')
