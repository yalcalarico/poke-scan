import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const revision = '8b1f705a3a7f6f062f6bdd21986c1583d3ef105d';
export const indexFilename = `dinov2-${revision}-int8.jsonl`;
export async function expectedMetadata(model) {
  return {
    revision,
    precision: 'int8',
    dimensions: 384,
    preprocessingHash: createHash('sha256')
      .update(
        'sharp-rotate-srgb-cubic-short256-center224-imagenet-cls384-l2-v1',
      )
      .digest('hex'),
    modelHash: createHash('sha256')
      .update(await readFile(model))
      .digest('hex'),
  };
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function inventory(root) {
  if (await exists(resolve(root, 'sets-index.lock')))
    throw new Error(
      'Índice ocupado: esperá que termine la indexación de colecciones.',
    );
  const children = await readdir(root, { withFileTypes: true });
  const folders = [];
  for (const child of children) {
    if (!child.isDirectory()) continue;
    const folder = resolve(root, child.name);
    if (await exists(resolve(folder, 'index.lock')))
      throw new Error('Índice ocupado: esperá que termine la indexación.');
    if (await exists(resolve(folder, 'meta.json'))) folders.push(folder);
  }
  // La raíz puede tener un vector del spike antiguo: no mezclarlo con las colecciones.
  if (!folders.length) folders.push(root);
  if (await exists(resolve(root, 'index.lock')))
    throw new Error('Índice ocupado: esperá que termine la indexación.');
  const files = [];
  for (const folder of folders.sort()) {
    for (const name of ['meta.json', indexFilename]) {
      const path = resolve(folder, name);
      const info = await stat(path);
      if (!info.isFile())
        throw new Error('Índice inválido: se esperaba un archivo.');
      files.push({
        path,
        signature: `${path}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`,
      });
    }
  }
  return {
    folders,
    version: createHash('sha256')
      .update(files.map((f) => f.signature).join('\n'))
      .digest('hex'),
  };
}

export async function loadIndex(root, expected, previous) {
  const before = await inventory(root);
  if (previous?.version === before.version) return previous;
  const entries = new Map();
  for (const folder of before.folders) {
    const meta = JSON.parse(
      await readFile(resolve(folder, 'meta.json'), 'utf8'),
    );
    if (Object.keys(expected).some((key) => meta[key] !== expected[key]))
      throw new Error('Modelo o metadata del índice incompatibles.');
    const content = await readFile(resolve(folder, indexFilename), 'utf8');
    if (content && !content.endsWith('\n'))
      throw new Error('Índice inválido: hay una línea incompleta.');
    for (const line of content.split('\n').filter(Boolean)) {
      const entry = JSON.parse(line);
      if (
        !entry ||
        typeof entry.id !== 'string' ||
        !/^[a-zA-Z0-9_!?-]+$/.test(entry.id) ||
        !Array.isArray(entry.vector) ||
        entry.vector.length !== 384 ||
        !entry.vector.every(Number.isFinite) ||
        Math.abs(Math.hypot(...entry.vector) - 1) > 0.001
      )
        throw new Error('Índice inválido: ID o vector incompatible.');
      const duplicate = entries.get(entry.id);
      if (
        duplicate &&
        duplicate.vector.some(
          (value, i) => Math.abs(value - entry.vector[i]) > 1e-6,
        )
      )
        throw new Error(
          'Índice inválido: referencias duplicadas incompatibles.',
        );
      entries.set(entry.id, { id: entry.id, vector: entry.vector });
    }
  }
  if (!entries.size) throw new Error('Índice inválido: no hay referencias.');
  if (entries.size > 100_000)
    throw new Error('Índice inválido: demasiadas referencias.');
  const after = await inventory(root);
  if (before.version !== after.version)
    throw new Error('Índice ocupado: cambió durante la lectura.');
  return {
    entries: [...entries.values()],
    version: before.version,
    collections: before.folders.length,
  };
}

export async function refreshIndex(root, expected, previous) {
  try {
    return {
      snapshot: await loadIndex(root, expected, previous),
      stale: false,
    };
  } catch (error) {
    if (!previous) throw error;
    // El último snapshot válido sigue sirviendo mientras el indexador escribe.
    return { snapshot: previous, stale: true };
  }
}
