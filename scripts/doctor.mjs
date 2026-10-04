#!/usr/bin/env node
// Diagnóstico del entorno: comprueba que todo esté listo para `pnpm run dev`.
import { execSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const D = (s) => `\x1b[2m${s}\x1b[0m`;
const B = (s) => `\x1b[1m${s}\x1b[0m`;

const API_PORT = process.env.API_PORT ?? '3001';
const WEB_PORT = process.env.WEB_PORT ?? '3000';

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}
function healthy(name) {
  try {
    return execFileSync('docker', ['inspect', '-f', '{{.State.Health.Status}}', name], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}
function portBusy(p) {
  return sh(`lsof -nP -iTCP:${p} -sTCP:LISTEN`) !== null && sh(`lsof -ti:${p}`) !== null;
}

const rows = [];
const dockerOk = sh('docker info') !== null;

rows.push(['docker', dockerOk ? G('corriendo') : R('no corriendo → abrí Docker Desktop')]);
rows.push(['postgres', healthy('pokemon-scanner-db') === 'healthy' ? G('healthy') : R(String(healthy('pokemon-scanner-db') ?? 'no está'))]);
rows.push(['redis', healthy('pokemon-scanner-redis') === 'healthy' ? G('healthy') : Y(String(healthy('pokemon-scanner-redis') ?? 'no está'))]);
rows.push(['deps backend', existsSync('backend/node_modules') ? G('instaladas') : R("falta → pnpm run setup")]);
rows.push(['deps frontend', existsSync('frontend/node_modules') ? G('instaladas') : R("falta → pnpm run setup")]);

const cards = dockerOk ? sh('docker exec pokemon-scanner-db psql -U pokemon -d pokemon_cards -tAc "SELECT COUNT(*) FROM cards"') : null;
const n = Number(cards ?? 0);
rows.push([
  'catálogo',
  n >= 20000 ? G(`${n} cartas (completo)`)
    : n > 0 ? Y(`${n} cartas (incompleto → pnpm run sync)`)
      : Y('vacío → pnpm run sync'),
]);

for (const [label, port] of [['puerto api', API_PORT], ['puerto web', WEB_PORT]]) {
  rows.push([`${label} (${port})`, portBusy(port) ? Y('ocupado (¿dev corriendo?)') : G('libre')]);
}

if (portBusy(API_PORT)) {
  const code = sh(`curl -s -o /dev/null -w '%{http_code}' http://localhost:${API_PORT}/api/health`) ?? '000';
  rows.push(['api http', code === '200' ? G('200 OK') : R(code)]);
} else {
  rows.push(['api http', D('no corriendo')]);
}

rows.push(['índice DINOv2', existsSync('backend/.scanner-index') ? G('disponible') : Y('falta → pnpm run scanner:index')]);

console.log(`\n${B('Diagnóstico')}\n`);
const w = Math.max(...rows.map((r) => r[0].length));
for (const [k, v] of rows) console.log(`  ${k.padEnd(w)}  ${v}`);
console.log('');
