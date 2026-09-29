#!/usr/bin/env node
// `pnpm run db:reset` — vacía la base y reaplica el schema (NO toca contenedores).
import { execFileSync } from 'node:child_process';

const R = (s) => `\x1b[31m${s}\x1b[0m`;
const G = (s) => `\x1b[32m${s}\x1b[0m`;
const D = (s) => `\x1b[2m${s}\x1b[0m`;

const psql = (db, sql) =>
  execFileSync(
    'docker',
    ['exec', 'pokemon-scanner-db', 'psql', '-U', 'pokemon', '-d', db, '-c', sql],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );

console.log(`\n  ${R('⚠')} Borrando todos los datos de pokemon_cards…`);
try {
  psql('postgres', 'DROP DATABASE IF EXISTS pokemon_cards WITH (FORCE);');
  psql('postgres', 'CREATE DATABASE pokemon_cards;');
} catch (e) {
  console.error(`\n  ${R('✗')} ${e.message}`);
  console.error(`  ${D('¿Está el contenedor?name pokemon-scanner-db corriendo?')}\n`);
  process.exit(1);
}

execFileSync('pnpm', ['run', 'db:migrate'], { stdio: 'inherit' });
console.log(`\n  ${G('✓')} Base vacía, schema aplicado.`);
console.log(`  ${D('Ahora:')} pnpm run sync   ${D('(cargar el catálogo de cartas)')}\n`);
