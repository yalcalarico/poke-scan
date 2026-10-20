import { afterAll } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/node_modules/vitest/dist/index.js';
afterAll(() => {
  const scope = globalThis as unknown as Record<symbol, unknown>;
  const flush = scope[Symbol.for('be07.readiness.observer.flush')];
  if (typeof flush !== 'function') throw new Error('Observer temporal no inicializado');
  flush();
});
