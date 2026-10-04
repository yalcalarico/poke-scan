#!/usr/bin/env node
// Mensaje final de `pnpm run setup`.
import { existsSync } from 'node:fs';

const G = (s) => `\x1b[32m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const D = (s) => `\x1b[2m${s}\x1b[0m`;
const B = (s) => `\x1b[1m${s}\x1b[0m`;

let cards = 0;
try {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(
    'docker',
    ['exec', 'pokemon-scanner-db', 'psql', '-U', 'pokemon', '-d', 'pokemon_cards', '-tAc', 'SELECT COUNT(*) FROM cards'],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  ).toString().trim();
  cards = Number(out);
} catch {
  /* la base puede no existir todavía */
}

console.log(`\n${G('✓')} Instalación completa.\n`);

if (cards >= 20000) {
  console.log(`  ${G('Catálogo cargado:')} ${cards} cartas\n`);
} else if (cards > 0) {
  console.log(`  ${Y('Catálogo parcial:')} ${cards} cartas.`);
  console.log(`  ${D('Para el catálogo completo:')} pnpm run sync ${D('(~20.670 cartas, varios minutos)')}\n`);
} else {
  console.log(`  ${Y('El catálogo está vacío.')}`);
  console.log(`  ${D('Para cargar cartas:')} pnpm run sync ${D('(completo, varios minutos)')}`);
  console.log(`  ${D('o para probar rápido:')} pnpm run seed ${D('(500 cartas)')}\n`);
}

if (!existsSync('backend/.scanner-index')) {
  console.log(`  ${Y('⚠')} Falta el índice DINOv2. Preparalo con pnpm run scanner:index antes de reconocer cartas.\n`);
}

console.log(`  ${B('Levantá la app:')}  pnpm run dev\n`);
console.log(`  ${D('Web →')} http://localhost:3000   ${D('API →')} http://localhost:3001/api/health`);
console.log(`  ${D('Diagnóstico:')} pnpm run doctor\n`);
