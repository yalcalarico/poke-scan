import { Redis } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/node_modules/.pnpm/ioredis@6.0.0/node_modules/ioredis/built/index.js';
const client = new Redis('redis://127.0.0.1:56381/15', {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
  retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 2000)),
});
let retries = 0;
client.on('error', () => {});
client.on('reconnecting', (delay) => console.log(JSON.stringify({ type: 'legacy-reconnecting', retries: ++retries, delay })));
client.on('end', () => {
  console.log(JSON.stringify({ type: 'legacy-end', retries, status: client.status }));
  process.exit(0);
});
client.connect().catch(() => console.log(JSON.stringify({ type: 'legacy-connect-rejected' })));
setTimeout(() => { client.disconnect(); process.exitCode = 2; }, 15000).unref();
