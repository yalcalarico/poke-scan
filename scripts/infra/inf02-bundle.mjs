#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { chmod, copyFile, mkdir, readdir, lstat, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { collectionName, hash, jsonlName, parseVectors, preprocessingHash, regularFile, revision, treeHash, validateMetadata, verifyBundle } from './inf02-artifacts.mjs';

const [sourceArg, modelArg, outputArg] = process.argv.slice(2);
const singleReference = process.argv[5] === '--single-reference';
if (!sourceArg || !modelArg || !outputArg) {
  console.error('Uso: node scripts/infra/inf02-bundle.mjs <índice-origen> <modelo.onnx> <destino>');
  process.exit(2);
}
const source = resolve(sourceArg);
const model = resolve(modelArg);
const output = resolve(outputArg);
if (output === source || output.startsWith(`${source}${sep}`) || source.startsWith(`${output}${sep}`)) {
  throw new Error('El origen y el destino deben ser directorios independientes.');
}
if (await realpath(dirname(output)) !== dirname(output) || model === output || model.startsWith(`${output}${sep}`)) throw new Error('Destino con parent symlink o superpuesto al modelo.');
try {
  await lstat(output);
  throw new Error('El destino ya existe; usá una ruta nueva e inmutable.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const modelInfo = await regularFile(model);
if (!modelInfo.isFile() || modelInfo.size < 1_000_000) throw new Error('El archivo de modelo no parece válido.');
if (await realpath(source) !== source || await realpath(model) !== model) throw new Error('No se permiten fuentes con symlinks.');
const modelHash = hash(await readFile(model));
const targetArch = process.env.INF02_TARGET_ARCH ?? process.arch;
if (!['arm64', 'x64'].includes(targetArch)) throw new Error('Arquitectura destino no soportada.');
const folders = (await readdir(source, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, 'en'));
for (const lock of ['sets-index.lock', 'index.lock']) {
  try { await lstat(join(source, lock)); throw new Error('Índice ocupado.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const selections = [];
for (const folder of folders) {
  if (!collectionName(folder)) throw new Error('Nombre de colección inválido.');
  const dir = join(source, folder);
  try { await lstat(join(dir, 'index.lock')); throw new Error('Colección ocupada.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try {
    await regularFile(join(dir, 'meta.json'));
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  try {
    await regularFile(join(dir, jsonlName));
    selections.push({ folder, dir });
  } catch (error) {
    throw error;
  }
}
if (!selections.length) throw new Error('No se encontraron pares metadata/JSONL compatibles.');
if (singleReference) selections.splice(1);
try { await lstat(`${output}.inf02-owner.json`); throw new Error('Ya existe marcador para el destino.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const temp = `${output}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`;
let stagingCreated = false;
try {
await mkdir(temp, { mode: 0o700 });
stagingCreated = true;
await mkdir(join(temp, 'model'), { recursive: true });
await mkdir(join(temp, 'index'), { recursive: true });
await copyFile(model, join(temp, 'model', 'dinov2-small-int8.onnx'));
const records = [];
const ids = new Set();
let acceptedEntries = 0;
let fixtureCardId;
for (const { folder, dir } of selections) {
  const metadataBytes = await readFile(join(dir, 'meta.json'));
  const metadata = JSON.parse(metadataBytes.toString('utf8'));
  validateMetadata(metadata, modelHash);
  let jsonlBytes = await readFile(join(dir, jsonlName));
  if (singleReference) {
    const firstLine = jsonlBytes.toString('utf8').split('\n').find(Boolean);
    if (!firstLine) throw new Error(`JSONL vacío en colección ${JSON.stringify(folder)}.`);
    const selected = JSON.parse(firstLine);
    fixtureCardId = selected.id;
    jsonlBytes = Buffer.from(`${JSON.stringify(selected)}\n`);
  }
  acceptedEntries += parseVectors(jsonlBytes, ids).length;
  const target = join(temp, 'index', folder);
  await mkdir(target, { recursive: true });
  await copyFile(join(dir, 'meta.json'), join(target, 'meta.json'));
  if (singleReference) await writeFile(join(target, jsonlName), jsonlBytes, { mode: 0o444 });
  else await copyFile(join(dir, jsonlName), join(target, jsonlName));
  records.push({ path: relative(temp, join(target, 'meta.json')).split(sep).join('/'), sha256: hash(metadataBytes) }, { path: relative(temp, join(target, jsonlName)).split(sep).join('/'), sha256: hash(jsonlBytes) });
}
records.sort((a, b) => a.path.localeCompare(b.path, 'en'));
const treeSha256 = treeHash(records);
const artifactId = `dinov2-small-int8-${revision}-${treeSha256.slice(0, 12)}`;
const manifest = {
  schemaVersion: 1,
  artifactId,
  runtime: { node: '22.20.0', onnxruntimeNode: '1.30.0', sharp: '0.35.5' },
  buildHost: { os: process.platform, arch: process.arch },
  target: { os: 'linux', arch: targetArch },
  model: { path: 'model/dinov2-small-int8.onnx', bytes: modelInfo.size, sha256: modelHash },
  index: { revision, precision: 'int8', dimensions: 384, modelHash, preprocessingHash, collections: selections.length, expectedEntries: acceptedEntries, ...(fixtureCardId ? { fixtureCardId } : {}), treeSha256, files: records },
};
const canonical = `${JSON.stringify(manifest, null, 2)}\n`;
manifest.manifestSha256 = hash(canonical);
await writeFile(join(temp, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o444 });
await verifyBundle(temp);
// mkdir exclusivo reserva el destino: rename del directorio entero podría pisar uno vacío.
await mkdir(output, { mode: 0o755 });
const rootInfo = await lstat(output);
await writeFile(`${output}.inf02-owner.json`, `${JSON.stringify({ schemaVersion: 2, purpose: 'inf02-scratch', artifactId, outputPath: output, sourcePaths: [source, model], rootDevice: rootInfo.dev, rootInode: rootInfo.ino })}\n`, { mode: 0o600, flag: 'wx' });
try {
  for (const name of ['model', 'index', 'manifest.json']) await rename(join(temp, name), join(output, name));
} catch (error) {
  throw error;
}
async function lockTree(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error('No se bloquean symlinks.');
  if (info.isDirectory()) {
    for (const entry of await readdir(path)) await lockTree(join(path, entry));
    await chmod(path, 0o555);
  } else {
    await chmod(path, 0o444);
  }
}
await lockTree(output);
console.log(JSON.stringify({ artifactId, collections: selections.length, expectedEntries: acceptedEntries, modelBytes: modelInfo.size, treeSha256, manifestSha256: manifest.manifestSha256 }));
} finally {
  if (stagingCreated) await rm(temp, { recursive: true, force: true });
}
