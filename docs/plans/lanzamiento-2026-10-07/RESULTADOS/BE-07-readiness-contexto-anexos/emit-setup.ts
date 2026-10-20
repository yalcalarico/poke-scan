import { afterAll, afterEach, beforeEach, expect } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/node_modules/vitest/dist/index.js';
interface Observer { mark(value: string): void; flush(): void; }
function observer(): Observer {
  const value = (globalThis as unknown as Record<symbol, unknown>)[Symbol.for('be07.contexto.emitObserver')];
  if (!value || typeof value !== 'object' || !('mark' in value) || typeof value.mark !== 'function' || !('flush' in value) || typeof value.flush !== 'function') throw new Error('Observer temporal no inicializado');
  return value as Observer;
}
beforeEach(() => observer().mark(expect.getState().currentTestName ?? 'sin nombre'));
afterEach(() => observer().mark('afterEach'));
afterAll(() => { observer().mark('afterAll flush'); observer().flush(); });
