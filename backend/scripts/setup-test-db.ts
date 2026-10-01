import { execFileSync } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';

import {
  dbNameOf,
  resolveDevDatabaseUrl,
  resolveTestDatabaseUrl,
} from '../test/test-env.js';

/**
 * Crea la base de tests como **copia** de la de desarrollo.
 *
 *     pnpm run test:db:setup
 *
 * ## Por qué una copia y no una base vacía
 *
 * Porque los specs de este proyecto no son puros: varios dependen del catálogo
 * espejado. `cards.service.spec` mide el tramo cotizado de `sort=price` sobre las
 * 20.670 cartas reales, y `identify.service.spec` rankea candidatos sobre las
 * mismas. Con una base vacía esos tests no tienen nada que medir y fallarían.
 *
 * Una copia resuelve el problema sin tocar los tests: los specs siguen viendo un
 * catálogo real, pero en una base que se puede borrar entera cada vez.
 *
 * ## Por qué `pg_dump` a través de Docker
 *
 * Porque el host no tiene las client tools de Postgres —en esta Mac no hay ni
 * `psql`—, y el contenedor de la base sí. Si en algún entorno hay `pg_dump` en el
 * host, se usa ese camino: la idea no es depender de Docker, es no Requirelo.
 */

const CONTAINER = process.env.PG_CONTAINER ?? 'pokemon-scanner-db';
const PG_USER = process.env.POSTGRES_USER ?? 'pokemon';

const log = (...args: unknown[]): void => {
  console.log(`[${new Date().toISOString()}]`, ...args);
};

function hasCommand(command: string): boolean {
  try {
    execFileSync('which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Corre un comando de Postgres contra la base del contenedor. */
function dockerPsql(sql: string, database: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', PG_USER, '-d', database, '-tAc', sql],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();
}

/**
 * Vuelca la base de desarrollo a un archivo temporal.
 *
 * El `pg_dump` corre dentro del contenedor porque el host no tiene las client
 * tools, y su salida se redirige a un archivo con un `fd` explícito: `stdio` con
 * la salida a un path lo resuelve Node solo con `openSync`.
 */
function dumpDatabase(source: string, targetFile: string): void {
  const fd = openSync(targetFile, 'w');
  try {
    execFileSync(
      'docker',
      ['exec', CONTAINER, 'pg_dump', '-U', PG_USER, '-d', source, '--clean', '--if-exists'],
      { stdio: ['ignore', fd, 'inherit'] },
    );
  } finally {
    closeSync(fd);
  }
}

function restoreDatabase(target: string, sourceFile: string): void {
  const fd = openSync(sourceFile, 'r');
  try {
    execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', PG_USER, '-d', target], {
      stdio: [fd, 'inherit', 'inherit'],
    });
  } finally {
    closeSync(fd);
  }
}

function databaseExists(name: string): boolean {
  return dockerPsql(`SELECT 1 FROM pg_database WHERE datname = '${name}'`, 'postgres') === '1';
}

async function main(): Promise<void> {
  const devUrl = resolveDevDatabaseUrl();
  const testUrl = resolveTestDatabaseUrl();

  if (!devUrl) {
    throw new Error(
      'No se encontró DATABASE_URL. Mirá `backend/.env` o las variables de entorno.',
    );
  }

  const devDb = dbNameOf(devUrl);
  const testDb = dbNameOf(testUrl);

  if (!testDb.includes('test')) {
    throw new Error(
      `El script se niega a tocar "${testDb}": el nombre de la base de tests tiene que ` +
        'contener "test". Es la única barrera contra un DROP sobre la base equivocada.',
    );
  }
  if (testDb === devDb) {
    throw new Error(
      'La base de tests es la misma que la de desarrollo. Revisá DATABASE_URL_TEST.',
    );
  }
  if (!hasCommand('docker')) {
    throw new Error(
      'Hace falta `docker` para el pg_dump (el host no tiene client tools de Postgres).\n' +
        'Alternativa: instalar libpq y correr este mismo dump a mano.',
    );
  }

  log(`Base de desarrollo: ${devDb}`);
  log(`Base de tests:       ${testDb}`);

  const devExists = databaseExists(devDb);
  if (!devExists) {
    throw new Error(`La base "${devDb}" no existe. Corré \`pnpm run setup\` primero.`);
  }

  if (databaseExists(testDb)) {
    log('La base de tests ya existe: se rehace con una copia fresca de la de desarrollo.');
    dockerPsql(`DROP DATABASE "${testDb}" WITH (FORCE)`, 'postgres');
  }

  log('Creando la base de tests…');
  dockerPsql(`CREATE DATABASE "${testDb}"`, 'postgres');

  const dumpFile = `/tmp/pokemon-cards-test-${Date.now()}.sql`;
  log('Volcando la base de desarrollo…');
  dumpDatabase(devDb, dumpFile);

  log('Restaurando en la base de tests…');
  restoreDatabase(testDb, dumpFile);

  const counts = dockerPsql(
    `SELECT (SELECT count(*) FROM cards) || ' cartas, ' ||
            (SELECT count(*) FROM card_sets) || ' sets, ' ||
            (SELECT count(*) FROM card_prices) || ' precios'`,
    testDb,
  );
  log(`Listo. La base de tests tiene ${counts}.`);
  log('');
  log('Ahora `pnpm run test:backend` corre contra ella, y no contra tu base de desarrollo.');
}

main().catch((error) => {
  console.error('[test:db:setup] falló:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});