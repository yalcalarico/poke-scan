#!/usr/bin/env node
import { chmod, cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyBundle } from './inf02-artifacts.mjs';

const [sourceArg, variant] = process.argv.slice(2);
const source = sourceArg && resolve(sourceArg);
const output = variant && `/private/tmp/inf02-negative-${variant}`;
if (!source || !['missing', 'incompatible'].includes(variant) || !/^\/private\/tmp\/inf02-[a-z0-9-]+$/.test(output)) {
  console.error('Uso: node scripts/infra/inf02-negative-artifact.mjs <bundle> missing|incompatible');
  process.exit(2);
}
await verifyBundle(source);
try { await lstat(`${output}.inf02-owner.json`); throw new Error('Ya existe marcador para el destino negativo.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: false, mode: 0o700 });
const artifactId = `dinov2-small-int8-${variant}-${basename(source)}`;
const rootInfo = await lstat(output);
await writeFile(`${output}.inf02-owner.json`, `${JSON.stringify({ schemaVersion: 2, purpose: 'inf02-scratch', artifactId, outputPath: output, sourcePaths: [source], rootDevice: rootInfo.dev, rootInode: rootInfo.ino })}\n`, { mode: 0o600, flag: 'wx' });
try {
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
await cp(join(source, 'model'), join(output, 'model'), { recursive: true });
await cp(join(source, 'index'), join(output, 'index'), { recursive: true });
await cp(join(source, 'manifest.json'), join(output, 'manifest.json'));
async function unlock(path) {
  await chmod(path, 0o700);
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) await unlock(child);
    else await chmod(child, 0o600);
  }
}
await unlock(output);
const indexJsonl = manifest.index.files.find((file) => file.path.endsWith('.jsonl'));
if (!indexJsonl) throw new Error('Bundle origen sin JSONL.');
if (variant === 'missing') {
  const { unlink } = await import('node:fs/promises');
  await unlink(join(output, indexJsonl.path));
} else {
  const metadataPath = join(output, manifest.index.files.find((file) => file.path.endsWith('/meta.json')).path);
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  metadata.modelHash = '0'.repeat(64);
  await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`);
}
console.log(JSON.stringify({ variant, output, artifactId }));
} catch (error) {
  execFileSync(process.execPath, [resolve('scripts/infra/inf02-scratch-cleanup.mjs'), output], { timeout: 30_000, stdio: 'inherit' });
  throw error;
}
