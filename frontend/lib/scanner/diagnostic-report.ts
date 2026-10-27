import { snapshotDiagnosticSession, type DiagnosticSession, type DiagnosticSessionSnapshot } from '@/lib/scanner/diagnostic-session';

export interface DiagnosticReportData extends DiagnosticSessionSnapshot {
  schemaVersion: 1;
  expectedSetAssessment: Array<{ readingId: string; proposal: 'in_set' | 'outside_set' | 'unknown'; final: 'in_set' | 'outside_set' | 'unknown'; finalRank: number | null }>;
}

export function createDiagnosticReportData(session: DiagnosticSession | DiagnosticSessionSnapshot): DiagnosticReportData {
  const snapshot = snapshotDiagnosticSession(session);
  const assess = (id: string | undefined) => !id || !snapshot.expectedSet.id ? 'unknown' as const : id === snapshot.expectedSet.id ? 'in_set' as const : 'outside_set' as const;
  return { schemaVersion: 1, ...snapshot, expectedSetAssessment: snapshot.readings.map((reading) => ({
    readingId: reading.id,
    proposal: assess(reading.initial?.setId),
    final: assess(reading.final?.setId),
    finalRank: reading.final ? reading.result?.candidates.find((candidate) => candidate.card.id === reading.final?.id)?.retrievalRank ?? null : null,
  })) };
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function createDiagnosticHtml(session: DiagnosticSession | DiagnosticSessionSnapshot): string {
  const data = safeJson(createDiagnosticReportData(session));
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Diagnóstico del escáner</title><style>
:root{color-scheme:light dark;--bg:Canvas;--fg:CanvasText;--line:color-mix(in srgb,CanvasText 20%,transparent);--muted:color-mix(in srgb,CanvasText 68%,transparent);--accent:LinkText}
body{font:16px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg);max-width:960px;margin:2rem auto;padding:0 1rem}h1,h2{line-height:1.2}section{border:1px solid var(--line);border-radius:12px;padding:1rem;margin:1rem 0}img{display:block;max-width:min(100%,420px);max-height:600px;object-fit:contain;background:var(--bg)}pre{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted)}.muted{color:var(--muted)}
</style></head><body><h1>Diagnóstico del escáner</h1><p id="summary" class="muted"></p><main id="reads"></main><details><summary>Datos JSON completos</summary><pre id="json"></pre></details>
<script type="application/json" id="diagnostic-data">${data}</script><script>
const d=JSON.parse(document.getElementById('diagnostic-data').textContent);const summary=document.getElementById('summary');const counts={sinRevisar:0,aceptadas:0,corregidasPorAlternativa:0,corregidasManualmente:0,descartadas:0,fallidas:0,propuestas:0,finales:0};const setCounts={proposal:{in_set:0,outside_set:0,unknown:0},final:{in_set:0,outside_set:0,unknown:0}};for(const r of d.readings){if(r.initial)counts.propuestas++;if(r.final)counts.finales++;const events=r.events||[];const confirmation=events.filter(e=>e.type==='identity_confirmed').at(-1);if(events.some(e=>e.type==='reading_discarded'))counts.descartadas++;else if(r.error)counts.fallidas++;else if(!r.final)counts.sinRevisar++;else if(r.final.id===r.initial?.id)counts.aceptadas++;else if(confirmation?.source==='manual')counts.corregidasManualmente++;else counts.corregidasPorAlternativa++;const a=d.expectedSetAssessment.find(item=>item.readingId===r.id);if(a){setCounts.proposal[a.proposal]++;setCounts.final[a.final]++}}summary.textContent=d.readings.length+' lecturas · '+new Date(d.createdAt).toLocaleString()+' · Propuestas '+counts.propuestas+' · Identidades finales '+counts.finales+' · Set esperado propuestas dentro/fuera/desconocido '+setCounts.proposal.in_set+'/'+setCounts.proposal.outside_set+'/'+setCounts.proposal.unknown+' · finales dentro/fuera/desconocido '+setCounts.final.in_set+'/'+setCounts.final.outside_set+'/'+setCounts.final.unknown+' · Aceptadas '+counts.aceptadas+' · Corregidas por alternativa '+counts.corregidasPorAlternativa+' · Corregidas manualmente '+counts.corregidasManualmente+' · Sin revisar '+counts.sinRevisar+' · Descartadas '+counts.descartadas+' · Fallidas '+counts.fallidas+' · Preparación fallida sin recorte '+d.preparationFailures+' · Preparación cancelada sin recorte '+d.preparationCancellations+(d.expectedSet.name?' · Set esperado: '+d.expectedSet.name+' (contexto)':' · Sin set esperado');const main=document.getElementById('reads');
function node(tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e}function card(c){return c?c.name+' · '+(c.setName||c.setId)+' · '+c.number+' ['+c.id+']':'Sin identidad'}
function setLabel(value){return !d.expectedSet.id?'Sin set esperado':value==='in_set'?'Dentro del set esperado':value==='outside_set'?'Fuera del set esperado':'Sin datos de set'}
main.append(node('p','La confirmación humana no demuestra un acierto. El set esperado es sólo contexto de evaluación.'));
for(const r of d.readings){
  const a=d.expectedSetAssessment.find(item=>item.readingId===r.id);
  const s=node('section');
  s.append(node('h2','Lectura '+r.runId+' · '+r.source));
  s.append(node('p','Propuesta inicial: '+card(r.initial)+' (puesto '+(r.initialRank??'—')+') · '+setLabel(a.proposal)));
  const rankLabel=!r.final?'Sin identidad confirmada':!r.result?'Ranking original no disponible':a.finalRank===null?'No estaba entre las alternativas originales':'puesto original '+a.finalRank;
  s.append(node('p','Identidad final: '+card(r.final)+' · '+rankLabel+' · '+setLabel(a.final)));
  if(r.result)s.append(node('p','Modelo '+r.result.indexVersion+' · índice '+r.result.indexMs+' ms · inferencia '+r.result.inferenceMs+' ms · total '+r.result.totalMs+' ms'));
  if(r.error)s.append(node('p','Error: '+r.error));
  if(r.quality)s.append(node('p','Calidad: '+JSON.stringify(r.quality)));
  const scores=node('ul');
  for(const c of r.result?.candidates||[])scores.append(node('li','#'+c.retrievalRank+' '+card({id:c.card.id,name:c.card.name,setName:c.card.set?.name||null,setId:c.card.setId,number:c.card.number})+' · similitud '+c.similarity));
  s.append(scores);
  const img=node('img');img.alt='Recorte exacto enviado para esta lectura';img.src=r.image;s.append(img);
  s.append(node('h3','Cronología'));
  const events=node('ol');
  for(const e of r.events)events.append(node('li',new Date(e.at).toLocaleString()+' · '+e.type+' · '+(e.previousCardId||'—')+' → '+(e.newCardId||'—')+(e.source?' · '+e.source:'')+(e.rank!==null?' · puesto '+e.rank:'')+(e.detail?' · '+e.detail:'')));
  s.append(events);main.append(s);
}
document.getElementById('json').textContent=JSON.stringify(d,null,2);
</script></body></html>`;
}

export function diagnosticReportFile(session: DiagnosticSession | DiagnosticSessionSnapshot): { blob: Blob; filename: string } {
  return { blob: new Blob([createDiagnosticHtml(session)], { type: 'text/html;charset=utf-8' }), filename: `pokescan-diagnostico-${session.createdAt.replace(/[:.]/g, '-')}.html` };
}

export function downloadDiagnosticReport(session: DiagnosticSession | DiagnosticSessionSnapshot): void {
  const { blob, filename } = diagnosticReportFile(session);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
  } finally {
    // Se revoca con demora para permitir que Safari inicie la descarga.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
