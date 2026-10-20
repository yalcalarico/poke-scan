import { RedisService } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/dist/redis/redis.service.js';
const service = new RedisService({ get: () => 'redis://127.0.0.1:56381/15' });
const logger = {
  warn: (message) => console.log(JSON.stringify({ type: 'warn', message })),
  log: (message) => console.log(JSON.stringify({ type: 'log', message })),
  error: (message) => console.log(JSON.stringify({ type: 'error', message })),
};
service.logger = logger;
service.onModuleInit();
const client = service.client;
let retries = 0;
client.on('reconnecting', (delay) => {
  retries += 1;
  console.log(JSON.stringify({ type: 'reconnecting', retries, delay }));
});
let previous = '';
const timer = setInterval(() => {
  const status = service.status();
  const key = `${status.available}:${status.degradedSince}`;
  if (key !== previous) {
    previous = key;
    console.log(JSON.stringify({ type: 'state', ...status, retries }));
  }
}, 250);
process.on('SIGTERM', async () => {
  clearInterval(timer);
  await service.onModuleDestroy();
  console.log(JSON.stringify({ type: 'shutdown', status: service.status() }));
  process.exit(0);
});
