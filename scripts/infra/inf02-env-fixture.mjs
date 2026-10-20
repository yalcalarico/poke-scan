#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { appendFile, chmod, readFile } from 'node:fs/promises';

const [file, project] = process.argv.slice(2);
if (!file || !project || !/^inf02-[a-z0-9-]{8,48}$/.test(project)) throw new Error('Uso: node scripts/infra/inf02-env-fixture.mjs <env-privado> inf02-<id>');
const contents = await readFile(file, 'utf8');
if (/^FIXTURE_EMAIL=/m.test(contents)) throw new Error('El env ya tiene datos de fixture.');
const values = {
  FIXTURE_EMAIL: `inf02-${randomBytes(6).toString('hex')}@example.test`,
  FIXTURE_USERNAME: `if02_${randomBytes(6).toString('hex')}`,
  FIXTURE_PASSWORD: randomBytes(24).toString('base64url'),
  FIXTURE_SLUG: `inf02-${project.slice(-8)}`,
};
await appendFile(file, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 });
await chmod(file, 0o600);
console.log(`Credenciales sintéticas agregadas al archivo privado ${file}.`);
