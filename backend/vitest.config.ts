import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Los specs comparten la misma DB de desarrollo y hacen deleteMany() de
    // `users`: correrlos en paralelo hace que una suite borre los datos de la
    // otra a mitad de test. Se ejecutan de a uno, en un solo hilo.
    fileParallelism: false,
  },
});
