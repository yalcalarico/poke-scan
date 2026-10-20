#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [projectArg, artifactArg, portArg = '35443', fileArg, gateTimeoutArg = '180000'] = process.argv.slice(2);
if (!projectArg || !artifactArg || !fileArg || !/^inf02-[a-z0-9-]{8,48}$/.test(projectArg)) {
  console.error('Uso: node scripts/infra/inf02-env.mjs inf02-<id> <bundle-abs> <puerto> <env-abs>');
  process.exit(2);
}
const artifact = resolve(artifactArg);
const file = resolve(fileArg);
const port = Number(portArg);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Puerto inválido.');
const values = {
  COMPOSE_PROJECT_NAME: projectArg,
  ARTIFACT_DIR: artifact,
  HTTPS_PORT: String(port),
  PUBLIC_ORIGIN: `https://localhost:${port}`,
  POSTGRES_USER: 'inf02',
  POSTGRES_PASSWORD: randomBytes(36).toString('base64url'),
  POSTGRES_DB: 'inf02',
  JWT_SECRET: randomBytes(48).toString('base64url'),
  JWT_REFRESH_SECRET: randomBytes(48).toString('base64url'),
  FIXTURE_EMAIL: `inf02-${randomBytes(6).toString('hex')}@example.test`,
  FIXTURE_USERNAME: `if02_${randomBytes(6).toString('hex')}`,
  FIXTURE_PASSWORD: randomBytes(24).toString('base64url'),
  FIXTURE_SLUG: `inf02-${projectArg.slice(-8)}`,
  GATE_TIMEOUT_MS: String(Number(gateTimeoutArg)),
};
if (!/^(?:[1-9][0-9]{2,5})$/.test(values.GATE_TIMEOUT_MS)) throw new Error('El plazo del gate debe ser 100–999999 ms.');
await mkdir(dirname(file), { recursive: true, mode: 0o700 });
await writeFile(file, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600, flag: 'wx' });
await chmod(file, 0o600);
console.log(`Archivo privado creado: ${file}; proyecto ${projectArg}; puerto ${port}.`);
