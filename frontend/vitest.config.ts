import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    /**
     * El alias `@/` que usa `tsconfig.json` y todo el código. Sin esto,
     * cualquier módulo que se importe desde un test y use `@/` revienta con "Cannot
     * find package", y termina llevando el test a rutas relativas para
     * esquivarlo en vez de arreglar la causa.
     */
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    // The parser is DOM-free by design; the image helpers are exercised with
    // synthetic ImageData objects, so no jsdom/canvas runtime is needed.
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
