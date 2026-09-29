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
    /**
     * El default sigue siendo `node`, y a propósito.
     *
     * Los tests de `lib/scanner/**` son DOM-free por diseño: los helpers de
     * imagen se ejercitan con `ImageData` sintéticos, así que no necesitan ni
     * jsdom ni binding nativo de canvas. Y los de `lib/**` (el guard de `cn()`, el
     * contrato de precios, `select-utils`) son lógica pura.
     *
     * Los tests de componentes sí necesitan DOM, y **no** se convierten en un
     * `environment: 'jsdom'` global: pagaría el costo de jsdom en los ~150 tests
     * de lógica que no lo usan. En vez de eso cada archivo de componente abre con
     * `// @vitest-environment jsdom`, que es el control por archivo de Vitest.
     * Así agregar un test de componente no puede cambiar el entorno de los que
     * ya estaban, que es la mitad del motivo de que sigan siendo la misma suite.
     */
    environment: 'node',
    /**
     * Se agrega `components/**` y `app/**` a los `lib/**` que ya estaban. Los
     * `.tsx` entran explícitos porque el include no se deduce de la extensión:
     * un test de componente casi siempre es `.tsx` (JSX) y sin esta línea no se
     * ejecutaría nunca.
     *
     * El entorno de cada archivo sale del docblock, no de acá: `app/**` es
     * lógica pura (el guard de contraste parsea `globals.css` con `node:fs`) y
     * `components/**` lleva `jsdom` en el docblock.
     */
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'components/**/*.test.ts',
      'components/**/*.test.tsx',
      'app/**/*.test.ts',
    ],
    /**
     * El cleanup de Testing Library se registra **acá** y no se deja al
     * auto-cleanup de `@testing-library/react`, porque ese auto-cleanup solo se
     * engancha si encuentra un `afterEach` global — y Vitest no expone ninguno
     * con `globals: false`, que es el default. Sin este bloque, el `container`
     * de cada `render` se iría acumulando en el `document` de un test al otro y
     * los `getByRole` empezarían a matchear nodos de tests anteriores.
     *
     * Va condicionado a que exista `document` porque este setup corre también
     * para los tests de `node`: importar `@testing-library/react` sin DOM tira.
     */
    setupFiles: ['./vitest.setup.ts'],
  },
});
