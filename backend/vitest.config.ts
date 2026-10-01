import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

import { resolveTestDatabaseUrl } from './test/test-env.js';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    /*
     * Los specs corren contra `DATABASE_URL_TEST`, o contra una base derivada de
     * `DATABASE_URL` con el nombre terminado en `_test`. Por eso, por omisión,
     * nunca tocan la base de desarrollo aunque nadie haya configurado nada.
     *
     * `test.env` y no un `process.env` en el globalSetup: Prisma Client carga
     * `.env` al instanciarse, así que los specs conectarían a la base de
     * desarrollo mientras el guard cree que están en la de tests. Fijando la
     * variable acá, la que gana es la del test.
     *
     * Ver `test/test-env.ts` y `test/global-setup.ts`.
     */
    env: { DATABASE_URL: resolveTestDatabaseUrl() },
    // Los specs comparten la misma DB de desarrollo y hacen deleteMany() de
    // `users`: correrlos en paralelo hace que una suite borre los datos de la
    // otra a mitad de test. Se ejecutan de a uno, en un solo hilo.
    fileParallelism: false,
    /*
     * El guard que corre antes de todo: si hay un backend vivo, su worker
     * compite por la cola de precios que los specs también usan, y la suite se
     * vuelve flaky sin explicación. Ver `test/global-setup.ts`.
     */
    globalSetup: ['./test/global-setup.ts'],
  },
});
