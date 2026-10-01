import { readFileSync } from 'node:fs';

/**
 * Resuelve contra qué base corren los specs.
 *
 * ## Por qué no alcanza con `DATABASE_URL`
 *
 * Porque los specs **no** leen `DATABASE_URL`: instancian `PrismaClient`, y
 * Prisma Client carga `.env` por su cuenta al instanciarse. Un guard que
 * comparara `process.env.DATABASE_URL` estaría mirando una variable vacía y no
 * dispararía nunca, que es peor que no tener guard.
 *
 * ## La precedencia
 *
 * 1. `DATABASE_URL_TEST` si está — explícito, gana.
 * 2. `DATABASE_URL` (del entorno o de `.env`) **derivada**: se le cambia el
 *    nombre de la base por `<nombre>_test`.
 *
 * El punto 2 es lo que hace que la Fase 8 sirva sin configuración: por defecto
 * los specs nunca tocan la base de desarrollo, aunque nadie haya hecho nada.
 * Con `pnpm run test:db:setup` una sola vez, `DATABASE_URL` alcanza.
 *
 * ## Por qué el nombre tiene que decir "test"
 *
 * Porque hay specs que hacen `deleteMany` sobre datos compartidos. El nombre es
 * la única barrera que distingue "borré fixtures" de "borré tu usuario". Un
 * `DATABASE_URL_TEST` mal puesto que apunte a la base de desarrollo es
 * exactamente el error que el guard de `global-setup.ts` existe para cortar.
 */

const ENV_FILES = ['../.env', '.env'];

function readEnvFile(name: string): string | undefined {
  for (const file of ENV_FILES) {
    try {
      const contents = readFileSync(new URL(file, import.meta.url), 'utf8');
      const match = contents
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith(`${name}=`));
      if (match) {
        return match
          .slice(`${name}=`.length)
          .replace(/^["']|["']$/g, '')
          .trim();
      }
    } catch {
      // El archivo no existe: se prueba el siguiente.
    }
  }
  return undefined;
}

function readSetting(name: string): string | undefined {
  return process.env[name] ?? readEnvFile(name);
}

/** `<nombre>_test`: `pokemon_cards` → `pokemon_cards_test`. */
export function testDbNameFrom(dbName: string): string {
  return dbName.endsWith('_test') ? dbName : `${dbName}_test`;
}

/**
 * Cambia el nombre de la base de una URL de Postgres.
 *
 * Se hace con la URL parseada y no con un regex sobre el string: las URLs de
 * Postgres tienen el path al final y pueden llevar query params
 * (`?schema=public`), y un regex se los come.
 */
export function withDbName(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

export function dbNameOf(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\//, '');
    return path.length > 0 ? path : '(sin nombre)';
  } catch {
    return '(URL inválida)';
  }
}

/** La URL contra la que corren los specs. */
export function resolveTestDatabaseUrl(): string {
  const explicit = readSetting('DATABASE_URL_TEST');
  if (explicit) return explicit;

  const dev = readSetting('DATABASE_URL');
  if (!dev) return '';
  return withDbName(dev, testDbNameFrom(dbNameOf(dev)));
}

/** El nombre de la base de desarrollo, para el script de setup y los docs. */
export function resolveDevDatabaseUrl(): string {
  return readSetting('DATABASE_URL') ?? '';
}