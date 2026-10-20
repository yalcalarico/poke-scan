#!/usr/bin/env node
import { initializeInventory, inventoryConfig } from './inf03-inventory-common.mjs';
const args = process.argv.slice(2);
if (args[0] !== 'init') throw new Error('Usá init para provisión explícita del inventario INF-03.');
const repositoryId = await initializeInventory(inventoryConfig(args));
process.stdout.write(JSON.stringify({ initialized: true, repositoryId }) + '\n');
