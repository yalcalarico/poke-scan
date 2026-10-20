import { PrismaClient } from '@prisma/client';
import { setTimeout as delay } from 'node:timers/promises';
import { formatStatus, parseOptions, readPriceStatus, requestCycles } from './prices-control.mjs';

let prisma;
const abort = new AbortController();
const stop = () => abort.abort();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  const options = parseOptions(process.argv.slice(2));
  prisma = new PrismaClient({ transactionOptions: { maxWait: 5000, timeout: 15000 } });
  await prisma.$connect();
  if (options.mode === 'sync') {
    const providers = await requestCycles(prisma);
    if (!options.json) console.log(`${providers.length ? `Ciclo señalado para ${providers.join(' y ')}` : 'Ninguna fuente está habilitada para iniciar ciclos'}. La instancia activa respeta cuotas y leases. Ctrl+C cierra esta vista; los jobs siguen.`);
  }
  const deadline = Date.now() + options.seconds * 1000;
  do {
    const status = await readPriceStatus(prisma);
    console.log(options.json ? JSON.stringify(status) : formatStatus(status));
    if (!options.watch || abort.signal.aborted || Date.now() >= deadline) break;
    try { await delay(Math.min(5000, deadline - Date.now()), undefined, { signal: abort.signal }); }
    catch { break; }
  } while (!abort.signal.aborted && Date.now() < deadline);
} catch {
  console.error('No se pudo consultar o pedir el ciclo de precios. Revisá las opciones, la conexión local y las migraciones.');
  process.exitCode = 1;
} finally {
  if (prisma) await prisma.$disconnect();
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}
