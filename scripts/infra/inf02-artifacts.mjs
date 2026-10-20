import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

export const revision = '8b1f705a3a7f6f062f6bdd21986c1583d3ef105d';
export const jsonlName = `dinov2-${revision}-int8.jsonl`;
export const preprocessingHash = '8170121eafd1c4dd3122475255b0c6bb811cc598d38abcaf34ac9dd5ca483708';
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const collectionName = (name) => typeof name === 'string' && name.length > 0 && name.length <= 255 && !['.', '..'].includes(name) && !/[\/\\\x00-\x1f\x7f]/.test(name);
export const treeHash = (records) => hash([...records].sort((a, b) => a.path.localeCompare(b.path, 'en')).map((record) => `${record.path}\0${record.sha256}`).join('\n'));

export async function regularFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Se esperaba un archivo regular sin symlink.');
  return info;
}

export function validateMetadata(metadata, modelHash) {
  if (!metadata || metadata.revision !== revision || metadata.precision !== 'int8' || metadata.dimensions !== 384 || metadata.modelHash !== modelHash || metadata.preprocessingHash !== preprocessingHash) throw new Error('Metadata incompatible con el runtime DINOv2.');
}

export function parseVectors(bytes, ids = new Set()) {
  const contents = bytes.toString('utf8');
  if (!contents || !contents.endsWith('\n')) throw new Error('JSONL vacío o incompleto.');
  const records = [];
  for (const line of contents.split('\n').filter(Boolean)) {
    const record = JSON.parse(line);
    if (!record || typeof record.id !== 'string' || !/^[a-zA-Z0-9_!?-]+$/.test(record.id) || !Array.isArray(record.vector) || record.vector.length !== 384 || !record.vector.every(Number.isFinite) || Math.abs(Math.hypot(...record.vector) - 1) > 0.001) throw new Error('ID o vector inválido.');
    if (ids.has(record.id)) throw new Error('ID duplicado en el bundle.');
    ids.add(record.id);
    records.push(record);
  }
  if (!records.length || ids.size > 100_000) throw new Error('Conteo de referencias inválido.');
  return records;
}

export async function verifyBundle(root) {
  if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) throw new Error('Raíz del bundle inválida o symlink.');
  await regularFile(join(root, 'manifest.json'));
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  const { manifestSha256, ...unsigned } = manifest;
  if (hash(`${JSON.stringify(unsigned, null, 2)}\n`) !== manifestSha256) throw new Error('Digest del manifiesto inválido.');
  const { model, index, target, runtime } = manifest;
  if (manifest.schemaVersion !== 1 || target?.os !== 'linux' || !['arm64', 'x64'].includes(target.arch) || runtime?.node !== '22.20.0' || runtime.onnxruntimeNode !== '1.30.0' || runtime.sharp !== '0.35.5') throw new Error('Contrato de plataforma/runtime inválido.');
  if (model?.path !== 'model/dinov2-small-int8.onnx' || !Number.isSafeInteger(model.bytes) || model.bytes < 1_000_000 || !/^[a-f0-9]{64}$/.test(model.sha256)) throw new Error('Contrato de modelo inválido.');
  validateMetadata(index, model.sha256);
  if (!Array.isArray(index.files) || !Number.isSafeInteger(index.collections) || index.collections < 1 || !Number.isSafeInteger(index.expectedEntries) || index.expectedEntries < 1 || index.expectedEntries > 100_000) throw new Error('Contrato de índice inválido.');
  const paths = new Set(['manifest.json', model.path]);
  const folders = new Map();
  for (const file of index.files) {
    const match = typeof file.path === 'string' && file.path.match(/^index\/([^/\\]+)\/(meta\.json|dinov2-[a-f0-9]+-int8\.jsonl)$/);
    if (!match || !collectionName(match[1]) || !['meta.json', jsonlName].includes(match[2]) || paths.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Allowlist de archivos inválida.');
    paths.add(file.path);
    const names = folders.get(match[1]) ?? new Set();
    names.add(match[2]); folders.set(match[1], names);
  }
  if (folders.size !== index.collections || [...folders.values()].some((names) => names.size !== 2)) throw new Error('Faltan pares metadata/JSONL o difiere el conteo de colecciones.');
  const allowedDirs = new Set(['', 'model', 'index', ...[...folders.keys()].map((name) => `index/${name}`)]);
  async function inspect(relative = '') {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      const info = await lstat(join(root, path));
      if (info.isSymbolicLink()) throw new Error('El bundle contiene un symlink.');
      if (info.isDirectory() && allowedDirs.has(path)) await inspect(path);
      else if (!info.isFile() || !paths.has(path)) throw new Error('El bundle contiene archivos/directorios fuera de la allowlist.');
    }
  }
  await inspect();
  const ids = new Set();
  for (const file of [...index.files, { path: model.path, sha256: model.sha256 }]) {
    const info = await regularFile(join(root, file.path));
    const bytes = await readFile(join(root, file.path));
    if (hash(bytes) !== file.sha256 || (file.path === model.path && info.size !== model.bytes)) throw new Error('Digest o tamaño de archivo inválido.');
    if (file.path.endsWith('/meta.json')) validateMetadata(JSON.parse(bytes.toString('utf8')), model.sha256);
    if (file.path.endsWith('.jsonl')) parseVectors(bytes, ids);
  }
  const treeSha256 = treeHash(index.files);
  if (treeSha256 !== index.treeSha256 || ids.size !== index.expectedEntries || manifest.artifactId !== `dinov2-small-int8-${revision}-${treeSha256.slice(0, 12)}` || (index.fixtureCardId !== undefined && (ids.size !== 1 || !ids.has(index.fixtureCardId)))) throw new Error('Manifest, identidad, árbol y referencias no coinciden.');
  return { artifactId: manifest.artifactId, entries: ids.size, collections: folders.size, manifestSha256, treeSha256 };
}
