#!/usr/bin/env node
// `pnpm run infra:reset` — destructivo, pide confirmación.
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const R = (s) => `\x1b[31m${s}\x1b[0m`;
const D = (s) => `\x1b[2m${s}\x1b[0m`;
const G = (s) => `\x1b[32m${s}\x1b[0m`;

const dc = (...args) =>
  execFileSync('docker', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();

console.log(`\n${R('⚠  Esto borra TODA la base de datos.')}`);
console.log(`  ${D('Perdés: usuarios, colecciones, links compartidos, amistades, precios.')}`);
console.log(`  ${D('Las cartas del catálogo también hay que volver a bajarlas (pnpm run sync).')}\n`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question(`  ${D('Escribí "si" para confirmar:')} `)).trim().toLowerCase();
rl.close();

if (answer !== 'si') {
  console.log(`\n  Cancelado. No se tocó nada.\n`);
  process.exit(1);
}

const seconds = (n) => `${Math.floor(n / 60)}m${String(n % 60).padStart(2, '0')}s`;

console.log(`\n  Recreando contenedores…`);
const t0 = Date.now();
dc('compose', 'down', '-v');
dc('compose', 'up', '-d', 'db', 'redis');

for (let i = 0; i < 40; i++) {
  try {
    if (dc('inspect', '-f', '{{.State.Health.Status}}', 'pokemon-scanner-db').trim() === 'healthy') break;
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}

execFileSync('pnpm', ['run', 'db:migrate'], { stdio: 'inherit' });
console.log(`\n  ${G('✓')} Base recreada (${seconds(Date.now() - t0)}).`);
console.log(`  ${D('Ahora:')} pnpm run sync   ${D('(cargar el catálogo)')}\n`);
