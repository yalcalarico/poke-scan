#!/usr/bin/env node
import { BackupInventory, inventoryConfig } from './inf03-inventory-common.mjs';
const args = process.argv.slice(2);
const known = new Set(['--repository', '--inventory', '--inventory-checkpoint', '--apply']);
for (let i = 0; i < args.length; i++) {
  if (!known.has(args[i])) throw new Error('Argumentos de retención INF-03 inválidos.');
  if (args[i] !== '--apply') { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Falta directorio de retención.'); i++; }
}
const inventory = new BackupInventory(inventoryConfig(args));
let summary;
try { await inventory.open(); summary = await inventory.prune({ apply: args.includes('--apply') }); }
finally { await inventory.close(); }
process.stdout.write(JSON.stringify(summary) + '\n');
