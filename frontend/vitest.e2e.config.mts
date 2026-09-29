import { defineConfig } from 'vitest/config';

/**
 * Config aparte para los scripts que corren contra la API real y dejan
 * archivos en /tmp: son lentos y no pueden estar en la suite normal, que tiene
 * que ser rápida y offline.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.e2e.ts'],
    testTimeout: 10 * 60_000,
    fileParallelism: false,
  },
});
