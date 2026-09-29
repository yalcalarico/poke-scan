#!/usr/bin/env node
/**
 * Guard de la construcción de URLs.
 *
 * Un espacio entre el delimitador y la barra — un template literal que abre con
 * un espacio antes de la barra, o una interpolación cerrada seguida de un
 * espacio y la barra — es invisible en el editor, no lo detecta `tsc`, ni el
 * build, ni ESLint, ni el guard de colores.
 *
 * Y en una ruta es inocuo, porque el router normaliza el espacio. Pero en una
 * URL que se copia al portapapeles y se manda por WhatsApp es **un link
 * roto**: la otra persona recibe "https://pokescan.app /share/abc", que no
 * resuelve.
 *
 * Ya pasó de verdad, dos veces, cuando se sacaba un prefijo de ruta con un
 * reemplazo de texto. Por eso el guard existe y por eso corre en `lint`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import process from 'node:process';

const ROOT = new URL('..', import.meta.url).pathname;
const ROOTS = ['app', 'components', 'lib', 'hooks'];
const EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * Los dos patrones que importan, y el detalle que los hace no dar falsos
 * positivos: el espacio tiene que caer **delante de una barra de una ruta**, o
 * sea que después de la barra viene un caracter de ruta y no otro espacio.
 *
 * Eso descarta el caso legítimo de `format.ts`, que escribe "4 / 102" — la
 * barra ahí está rodeada de espacios y no forma parte de ninguna URL. Un guard
 * que se dispara con el número de carta de un catálogo de 20.670 cartas
 * termina siendo apagado, y un guard apagado no protege nada.
 */
const PATTERNS = [
  new RegExp('` +/\\S'),
  new RegExp('\\$\\{[^}]+\\} +/\\S'),
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

/** Una línea de comentario puede legítimamente citar el patrón. */
function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

const violations = [];

for (const root of ROOTS) {
  for (const file of walk(join(ROOT, root))) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (isCommentLine(line)) return;
        for (const pattern of PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(line)) {
            violations.push(
              `${relative(ROOT, file)}:${index + 1}  ${line.trim()}`,
            );
          }
        }
      });
  }
}

if (violations.length > 0) {
  console.error(
    'Espacio dentro de una URL construida. En un href el router lo normaliza; en un link que se comparte, es un link roto.\n',
  );
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(`\n${violations.length} hallazgo(s).`);
  process.exit(1);
}

console.log('check-no-url-spaces: sin espacios en las URLs construidas.');
