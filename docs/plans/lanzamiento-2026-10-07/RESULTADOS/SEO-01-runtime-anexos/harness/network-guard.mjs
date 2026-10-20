import { appendFileSync } from 'node:fs';
const log = '/private/tmp/seo01-runtime-sol-20261008/external-attempts.jsonl';
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!local) {
    appendFileSync(log, JSON.stringify({ host: url.hostname, at: new Date().toISOString() }) + '\n', { mode: 0o600 });
    throw new Error('External fetch blocked by SEO-01 local harness');
  }
  return original(input, init);
};
