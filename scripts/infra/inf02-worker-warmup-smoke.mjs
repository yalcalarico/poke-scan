#!/usr/bin/env node
import { fork } from 'node:child_process';

const worker = fork('/app/scripts/scanner-visual-worker.mjs', [], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
const timer = setTimeout(() => {
  worker.kill('SIGTERM');
  console.error('Warmup excedió el plazo de 60 s.');
  process.exit(1);
}, 60_000);
worker.on('message', (message) => {
  if (message?.type !== 'warmup-result') return;
  clearTimeout(timer);
  console.log(JSON.stringify({ generation: message.generation, attempt: message.attempt, state: message.state }));
  worker.kill('SIGTERM');
  const expected = process.env.EXPECTED_WARMUP_STATE ?? 'ready';
  process.exit(message.state === expected ? 0 : 1);
});
worker.on('error', () => {
  clearTimeout(timer);
  console.error('No se pudo iniciar el worker runtime.');
  process.exit(1);
});
worker.send({ type: 'warmup', generation: 1, attempt: 1 });
