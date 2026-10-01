import { createConnection } from 'node:net';

import { dbNameOf, resolveTestDatabaseUrl } from './test-env.js';

/**
 * Guarda que corre **antes** de los specs.
 *
 * ## Por qué existe
 *
 * Los specs de este backend corren contra la **misma** base y las mismas tablas
 * que el stack de desarrollo, y hay specs que hacen `deleteMany`. Eso ya era un
 * riesgo —un `DELETE` de usuarios borra la sesión del usuario con el que estás
 * probando a mano—, pero con la cola de precios persistente el daño pasó de
 * "datos de desarrollo" a **"tests que no son deterministas"**.
 *
 * `price_refresh_jobs` la drena un worker que vive en el proceso del backend. Si
 * hay un backend corriendo, ese worker compite por las mismas filas: un test que
 * encola y después reclama puede encontrarse con que el job ya fue tomado, y
 * falla sin que el código tenga nada de malo.
 *
 * ## Lo que hace
 *
 * Falla rápido y con un mensaje accionable, en vez de dejar que la suite sea
 * flaky en silencio:
 *
 * 1. Que no haya un backend escuchando en el puerto de la API: su worker
 *    drena la misma cola de precios y se llevaría los jobs de los tests.
 * 2. Que la base resuelta por `resolveTestDatabaseUrl()` tenga "test" en el
 *    nombre. La resolución deriva `pokemon_cards_test` de `pokemon_cards`, así
 *    que el caso que este punto atrapa es un `DATABASE_URL_TEST` mal puesto que
 *    apunta a la base de desarrollo — o a una de producción.
 *
 * La base de tests la crea `pnpm run test:db:setup` como **copia** de la de
 * desarrollo, porque varios specs dependen del catálogo espejado. Ver
 * `scripts/setup-test-db.ts`.
 */

const API_PORT = Number(process.env.API_PORT ?? 3001);

/**
 * Nombres de base que dan luz verde.
 *
 * El patrón es "contiene test", no una lista: un `pokemon_cards_test` o un
 * `pokemon_test_local` sirven, y una base llamada `prod` no.
 */
const TEST_DB_PATTERN = /test/i;

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    const finish = (inUse: boolean): void => {
      socket.destroy();
      resolve(inUse);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    // Un timeout corto: si nadie contesta, no hay backend.
    socket.setTimeout(700, () => finish(false));
  });
}

export async function setup(): Promise<void> {
  const problems: string[] = [];

  if (await isPortInUse(API_PORT)) {
    problems.push(
      `Hay algo escuchando en el puerto ${API_PORT}, casi seguro el backend.\n` +
        `     Su worker de precios drena la MISMA cola (price_refresh_jobs) que los\n` +
        `     specs, y se lleva los jobs que un test acaba de encolar.\n` +
        `     Paralo con \`pnpm run stop\` antes de correr los tests.`,
    );
  }

  const url = resolveTestDatabaseUrl();
  const dbName = dbNameOf(url);
  if (url && !TEST_DB_PATTERN.test(dbName)) {
    problems.push(
      `Los specs van a correr contra la base "${dbName}", que no parece de tests.\n` +
        `     Los specs hacen deleteMany sobre datos reales. Para correr seguro:\n` +
        `       DATABASE_URL_TEST=postgresql://pokemon:pokemon@localhost:55432/pokemon_cards_test\n` +
        `     y usá \`pnpm run test:db:setup\` para crearla y copiarla una vez.`,
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `\n\n  ✗ No se corren los specs:\n\n` +
        problems.map((p) => `     • ${p}`).join('\n\n') +
        `\n\n`,
    );
  }

  console.log(
    `[setup] specs contra "${dbName}"${url ? '' : ' (sin DATABASE_URL)'} — puerto ${API_PORT} libre`,
  );
}