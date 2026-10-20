import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageCustody, verifyCustodyPackage } from './inf02-custody-package.mjs';

const names = ['inf03-custody-common.mjs', 'inf03-inventory-common.mjs', 'inf03-transfer-common.mjs'];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', '..');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'inf02-custody-package-'));
  t.after(async () => { await unlockTree(root); await rm(root, { recursive: true, force: true }); });
  const source = path.join(root, 'sources'); await mkdir(source, { mode: 0o700 });
  for (const name of names) await copyFile(path.join(repo, 'scripts', name), path.join(source, name));
  return { root, source, output: path.join(root, 'package') };
}

async function unlockTree(directory) {
  for (const name of await readdir(directory)) {
    const child = path.join(directory, name), info = await lstat(child);
    if (info.isDirectory() && !info.isSymbolicLink()) { await unlockTree(child); await chmod(child, 0o700); }
    else if (!info.isSymbolicLink()) await chmod(child, 0o600);
  }
  await chmod(directory, 0o700);
}

test('paquete allowlist, hashes, layout absoluto y permisos inmutables', async (t) => {
  const f = await fixture(t);
  const manifest = await packageCustody(f.source, f.output);
  assert.equal(manifest.layout, 'absolute-root-scripts');
  assert.deepEqual(manifest.files.map((item) => item.name), names);
  assert.deepEqual(await (await import('node:fs/promises')).readdir(f.output), ['manifest.json', 'scripts']);
  assert.deepEqual((await (await import('node:fs/promises')).readdir(path.join(f.output, 'scripts'))).sort(), names.slice().sort());
  for (const record of manifest.files) {
    assert.equal(record.layout, `/scripts/${record.name}`);
    const output = await readFile(path.join(f.output, 'scripts', record.name));
    assert.equal(record.bytes, output.length);
    assert.equal(record.sha256, digest(output));
    assert.equal((await lstat(path.join(f.output, 'scripts', record.name))).mode & 0o777, 0o444);
  }
  assert.equal((await lstat(f.output)).mode & 0o777, 0o555);
  assert.equal((await lstat(path.join(f.output, 'scripts'))).mode & 0o777, 0o555);
  assert.equal((await verifyCustodyPackage(f.output)).files.length, 3);
});

test('destino existente no se pisa y symlinks de fuente se rechazan', async (t) => {
  const f = await fixture(t);
  await mkdir(f.output); await writeFile(path.join(f.output, 'keep'), 'intacto');
  await assert.rejects(packageCustody(f.source, f.output), /ya existe/);
  assert.equal(await readFile(path.join(f.output, 'keep'), 'utf8'), 'intacto');

  const badSource = path.join(f.root, 'bad-sources'); await mkdir(badSource);
  for (const name of names.slice(1)) await copyFile(path.join(f.source, name), path.join(badSource, name));
  await symlink(path.join(f.source, names[0]), path.join(badSource, names[0]));
  await assert.rejects(packageCustody(badSource, path.join(f.root, 'must-not-exist')));
  await assert.rejects(lstat(path.join(f.root, 'must-not-exist')), { code: 'ENOENT' });
});

test('verificador detecta hash alterado, symlink y rutas extra', async (t) => {
  const f = await fixture(t); await packageCustody(f.source, f.output);
  const custodyFile = path.join(f.output, 'scripts', names[0]);
  const scriptsDir = path.join(f.output, 'scripts');
  await chmod(custodyFile, 0o644); await writeFile(custodyFile, 'alterado');
  await assert.rejects(verifyCustodyPackage(f.output));
  await chmod(scriptsDir, 0o700); await rm(custodyFile); await symlink(path.join(f.source, names[0]), custodyFile); await chmod(scriptsDir, 0o555);
  await assert.rejects(verifyCustodyPackage(f.output));
  await chmod(scriptsDir, 0o700); await rm(custodyFile); await copyFile(path.join(f.source, names[0]), custodyFile); await chmod(custodyFile, 0o444); await chmod(scriptsDir, 0o555);
  await chmod(f.output, 0o700);
  await writeFile(path.join(f.output, 'extra'), 'no permitido');
  await chmod(f.output, 0o555);
  await assert.rejects(verifyCustodyPackage(f.output));
});

test('target por defecto queda en runner y overlay exige contexto y rutas runtime opt-in', async () => {
  const dockerfile = await readFile(path.join(repo, 'backend/Dockerfile'), 'utf8');
  const compose = await readFile(path.join(repo, 'infra/inf02/compose.yaml'), 'utf8');
  const overlay = await readFile(path.join(repo, 'infra/inf02/compose.custody.yaml'), 'utf8');
  assert.match(dockerfile, /FROM runner-base AS custody-runner[\s\S]*COPY --from=custody-ops/);
  assert.match(dockerfile.trimEnd(), /FROM runner-base AS runner$/);
  assert.match(dockerfile, /COPY --from=custody-ops[\s\S]*\/scripts\/inf03-custody-common\.mjs/);
  assert.doesNotMatch(compose, /custody-ops|CUSTODY_PACKAGE_DIR|ACCOUNT_DELETION_CUSTODY_MODE/);
  assert.match(overlay, /target: custody-runner/);
  assert.match(overlay, /custody-ops: \$\{CUSTODY_PACKAGE_DIR:\?/);
  assert.match(overlay, /env_file:[\s\S]*CUSTODY_RUNTIME_ENV_FILE/);
  assert.match(overlay, /ACCOUNT_DELETION_CUSTODY_MODE: local-simulated/);
  assert.match(overlay, /read_only: true/);
  assert.equal((overlay.match(/source: \$\{INF03_[A-Z_]+:\?/g) ?? []).length, 7);
});
