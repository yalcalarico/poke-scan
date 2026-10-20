#!/usr/bin/env node
import { initializeCustody, LocalSimulatedCustody } from './inf03-custody-common.mjs';

const fail = () => { throw new Error('INF03_CUSTODY_UNVERIFIED'); };
const args = process.argv.slice(2), command = args[0];
const authority = ['--repository', '--inventory', '--inventory-checkpoint', '--suppression-journal', '--suppression-checkpoint'];
const base = ['--mode', '--store', '--anchor', ...authority];
const schemas = { init: base, publish: base, verify: base, recover: [...base, '--objects'] };
let result;
try {
  if (!Object.hasOwn(schemas, command)) fail();
  const allowed = new Set(schemas[command]), seen = new Set(), values = new Map();
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (!allowed.has(flag) || seen.has(flag) || !value || value.startsWith('--') || value.includes('://')) fail();
    seen.add(flag); values.set(flag, value);
  }
  if (schemas[command].some(flag => !seen.has(flag)) || values.get('--mode') !== 'local-simulated') fail();
  // Import diferido: no inicializa Prisma, no carga .env ni incorpora otra autoridad de bajas.
  const journalFactory = async config => {
    const { LocalSuppressionJournal } = await import('../backend/dist/modules/account-deletion/suppression-journal.js');
    return new LocalSuppressionJournal(config);
  };
  const config = {
    store: values.get('--store'), anchor: values.get('--anchor'), key: process.env.INF03_CUSTODY_HMAC_KEY,
    inventoryConfig: { repository: values.get('--repository'), inventory: values.get('--inventory'), checkpoint: values.get('--inventory-checkpoint'), key: process.env.INF03_INVENTORY_HMAC_KEY },
    journalConfig: { journalDirectory: values.get('--suppression-journal'), checkpointDirectory: values.get('--suppression-checkpoint'), hmacKey: process.env.INF03_SUPPRESSION_HMAC_KEY },
    transferKey: process.env.INF03_TRANSFER_HMAC_KEY, journalFactory,
  };
  if (command === 'init') result = await initializeCustody(config);
  else {
    const custody = new LocalSimulatedCustody(config);
    try { await custody.open(); result = command === 'publish' ? await custody.publish() : command === 'verify' ? await custody.verify() : await custody.recover({ objects: values.get('--objects') }); }
    finally { await custody.close(); }
  }
  if (result.expiresAt !== undefined && result.expiresAt !== null && Date.now() >= Date.parse(result.expiresAt)) fail();
  process.stdout.write(JSON.stringify(result) + '\n');
} catch {
  // Nunca revelar paths, claves ni entradas personales a través del diagnóstico del CLI.
  process.stderr.write('INF03_CUSTODY_UNVERIFIED\n'); process.exitCode = 1;
}
