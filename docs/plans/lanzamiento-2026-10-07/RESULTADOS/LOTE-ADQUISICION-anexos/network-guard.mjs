import fs from 'node:fs';
const log = new URL('./next-external-blocked.jsonl', import.meta.url);
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const value = typeof input === 'string' || input instanceof URL ? input : input.url;
  const url = new URL(value);
  const local = ['127.0.0.1', 'localhost', '[::1]'];
  if (url.protocol === 'data:') return original(input, init);
  let blocked = !local.includes(url.hostname);
  if (url.pathname === '/_next/image' && url.searchParams.has('url')) {
    const source = new URL(url.searchParams.get('url'), url);
    blocked ||= !local.includes(source.hostname);
  }
  if (blocked) {
    fs.appendFileSync(log, JSON.stringify({ blocked: true, role: 'next-fetch', atUtc: new Date().toISOString() }) + '\n');
    throw new Error('GATE_EXTERNAL_FETCH_BLOCKED');
  }
  return original(input, init);
};
