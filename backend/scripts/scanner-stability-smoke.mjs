/** Prueba local de fallos sobre el service compilado; no usa DB ni HTTP. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { VisualIdentifyService } from '../dist/modules/cards/visual-identify.service.js';

const [photo, output] = process.argv.slice(2);
if (!photo || !output || photo === '--help') {
  console.log('Después de pnpm run check, desde backend: node --env-file-if-exists=.env scripts/scanner-stability-smoke.mjs FOTO REPORTE. Lee índice/modelo locales; interrumpe sólo sus propios workers, incluye timeout real de 30 s.');
  process.exit(photo === '--help' ? 0 : 1);
}
if (resolve(photo) === resolve(output)) throw new Error('El reporte no puede reemplazar la foto.');
const bytes = await readFile(photo);
const dto = {image: `data:image/png;base64,${bytes.toString('base64')}`};
process.env.SCANNER_VISUAL_ENABLED = '1';
const service = new VisualIdentifyService();
const results = [];
let baseline;
const getChild = () => {
  // Inspección sólo de prueba: no agregar controles de fallos a la API pública.
  const child = Reflect.get(service, 'child');
  assert(child?.pid && child.connected, 'worker local no disponible');
  return child;
};
async function recognize(name) {
  const started = performance.now();
  const result = await service.identify(dto);
  const ranking = result.candidates.map(c => c.id);
  if (baseline) assert.deepEqual(ranking, baseline);
  else baseline = ranking;
  results.push({name,ok:true,cold:result.cold,references:result.references,indexVersion:result.indexVersion,totalMs:performance.now()-started});
  console.log(`PASS ${name}`);
}
async function interrupted(name, act, expected) {
  const started = performance.now();
  // Instalar el handler antes de provocar el fallo evita rechazos sin observar.
  const request = service.identify(dto);
  const rejected = assert.rejects(request, expected);
  act(getChild());
  await rejected;
  results.push({name,ok:true,totalMs:performance.now()-started});
  console.log(`PASS ${name}`);
  await recognize(`${name}: recuperación`);
}
try {
  await recognize('arranque');
  await interrupted('SIGKILL en consulta', child => child.kill('SIGKILL'), /interrumpió/);
  const idle = getChild();
  const exited = once(idle, 'exit');
  idle.kill('SIGKILL'); await exited;
  await recognize('SIGKILL en reposo: recuperación');
  const abort = new AbortController();
  const cancelled = assert.rejects(service.identify(dto, abort.signal), /cancelada/);
  abort.abort(); await cancelled;
  results.push({name:'cancelación en consulta',ok:true});
  await recognize('cancelación: recuperación');
  await interrupted('SIGSTOP y timeout 30 s', child => child.kill('SIGSTOP'), /tardó demasiado/);
  await recognize('reutilización caliente');
  await writeFile(resolve(output), JSON.stringify({evaluatedAt:new Date().toISOString(),photoHash:createHash('sha256').update(bytes).digest('hex'),scope:'Service compilado y worker DINOv2 reales, fallos provocados sólo en procesos propios. Sin HTTP/cámara/DB ni evaluación de precisión.',productionReady:false,results},null,2)+'\n',{flag:'wx'});
  console.log(`Reporte: ${resolve(output)}`);
} finally {
  service.onModuleDestroy();
}
