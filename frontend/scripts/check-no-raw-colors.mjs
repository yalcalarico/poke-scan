#!/usr/bin/env node
/**
 * Aplica la regla dura de `docs/design-system.md` §1 sobre **todo** el JSX y TS
 * del proyecto: en el código no se escriben clases de la paleta default de
 * Tailwind. El color sale siempre de un token semántico (`bg-canvas`,
 * `text-primary`, `border-line`, …).
 *
 * Está enganchado a `pnpm run lint`, así que un color crudo rompe el build.
 * Cuando había dos versiones de la app solo miraba las carpetas nuevas, porque
 * la app vieja usaba `slate-*` y `white` en trescientas partes y el guard
 * hubiera sido inútil.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import process from 'node:process';

const ROOT = new URL('..', import.meta.url).pathname;

/**
 * Raíces a escanear. `scripts/` y los tests quedan afuera a propósito: un
 * fixture que reproduce a propósito el bug que se quiere evitar tiene que poder
 * escribir la clase cruda, o el test no testea nada.
 */
const ROOTS = ['app', 'components', 'lib', 'hooks'];

/** Paletas default de Tailwind que quedan prohibidas en la app. */
const RAW_PALETTES = [
  'slate',
  'zinc',
  'neutral',
  'gray',
  'stone',
  'red',
  'rose',
  'emerald',
  'amber',
  'sky',
  'blue',
  'green',
];

/**
 * `text-white` y `bg-black` no son paletas con escala, pero son el otro 90% de
 * los crudos. Los tokens legales que los anteceden (`text-primary`,
 * `bg-surface`, `text-inverse`, `text-on-brand`, …) no matchean porque no
 * terminan en `-white` / `-black`.
 */
const RAW_LITERALS = ['white', 'black'];

const EXTENSIONS = new Set(['.ts', '.tsx']);

/** Prefijos de utilidad de Tailwind donde un color es un color. */
const UTILITY_PREFIXES = [
  'bg',
  'text',
  'border',
  'ring',
  'outline',
  'fill',
  'stroke',
  'shadow',
  'accent',
  'caret',
  'divide',
  'decoration',
  'from',
  'via',
  'to',
  'placeholder',
];

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (EXTENSIONS.has(extname(entry))) {
      yield full;
    }
  }
}

function buildMatcher() {
  const palette = `(?:${RAW_PALETTES.join('|')})`;
  const literal = `(?:${RAW_LITERALS.join('|')})`;
  const utilities = UTILITY_PREFIXES.join('|');
  // Se busca el token suelto y no la clase completa, así que no hay que
  // enumerar variantes: alcanza con el prefijo de utilidad más el color. Un
  // ejemplo matcheado sería `hover:bg-slate-500/40`.
  return new RegExp(
    String.raw`(?<![\w-])((?:-?[a-z]+:)*-?(?:${utilities})-${palette}-\d{2,3}(?:/\d{1,3})?(?![\w-])|(?:-?[a-z]+:)*-?(?:${utilities})-${literal}(?![\w-]))`,
    'g',
  );
}

const MATCHER = buildMatcher();

/**
 * Saltea líneas de comentario: los docs de los tokens nombran las clases
 * prohibidas justamente para decir que están prohibidas, y un grep ingenuo las
 * contaría como hallazgos.
 */
function isCommentLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('<!--')
  );
}

const violations = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (isCommentLine(line)) return;
      MATCHER.lastIndex = 0;
      for (const match of line.matchAll(MATCHER)) {
        violations.push(
          `${relative(ROOT, file)}:${index + 1}  ${match[1]}  →  usá un token de docs/design-system.md §1`,
        );
      }
    });
  }
}

if (violations.length > 0) {
  console.error('Colores crudos. Cada color sale de un token semántico:\n');
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(`\n${violations.length} hallazgo(s). Ver docs/design-system.md §1 y §12.`);
  process.exit(1);
}

console.log(`check-no-raw-colors: sin colores crudos en ${ROOTS.length} raíz(es).`);
