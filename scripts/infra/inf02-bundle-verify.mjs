#!/usr/bin/env node
import { resolve } from 'node:path';
import { verifyBundle } from './inf02-artifacts.mjs';
const root = process.argv[2] && resolve(process.argv[2]);
if (!root) throw new Error('Uso: node scripts/infra/inf02-bundle-verify.mjs <bundle>');
console.log(JSON.stringify(await verifyBundle(root)));
