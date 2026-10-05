import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadIndex,
  refreshIndex,
  indexFilename,
} from './scanner-visual-index.mjs';
const meta = { dimensions: 384, revision: 'test' };
const vector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0));
test('carga sólo vectores, sin resolver ni necesitar imágenes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scanner-index-'));
  try {
    const dir = await folder(root, 'A', ['base1-1']);
    const imageUrl = 'https://images.example.test/card.png';
    await writeFile(
      join(dir, indexFilename),
      JSON.stringify({
        id: 'base1-1',
        vector,
        imageUrl,
        imagePath: '/ruta/arbitraria',
      }) + '\n',
    );
    const result = await loadIndex(root, meta);
    assert.equal('imagePath' in result.entries[0], false);
    assert.deepEqual(result.entries[0].vector, vector);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
async function folder(root, name, entries) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'meta.json'), JSON.stringify(meta));
  await writeFile(
    join(dir, indexFilename),
    entries.map((id) => JSON.stringify({ id, vector })).join('\n') + '\n',
  );
  return dir;
}
test('reúne colecciones, deduplica IDs y recarga al agregar otra sin modificar el snapshot anterior', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scanner-index-'));
  try {
    await folder(root, 'A', ['base1-1', 'base1-2']);
    await folder(root, 'B', ['sv1-1', 'base1-1']);
    const first = await loadIndex(root, meta);
    assert.equal(first.entries.length, 3);
    assert.equal(first.collections, 2);
    assert.equal(await loadIndex(root, meta, first), first);
    await folder(root, 'C', ['me55-92']);
    const next = await loadIndex(root, meta, first);
    assert.equal(next.entries.length, 4);
    assert.notEqual(next.version, first.version);
    assert.equal(first.entries.length, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('bloqueo o metadata incompatible conservan el snapshot válido y fallan sin uno previo', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scanner-index-'));
  try {
    const dir = await folder(root, 'A', ['base1-1']);
    const first = await loadIndex(root, meta);
    await writeFile(join(dir, 'index.lock'), 'activo');
    await assert.rejects(loadIndex(root, meta), /ocupado/);
    assert.deepEqual(await refreshIndex(root, meta, first), {
      snapshot: first,
      stale: true,
    });
    await rm(join(dir, 'index.lock'));
    await writeFile(join(dir, 'meta.json'), '{"dimensions":128}');
    await assert.rejects(loadIndex(root, meta), /incompatibles/);
    assert.equal((await refreshIndex(root, meta, first)).snapshot, first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('rechaza líneas incompletas, vectores inválidos y duplicados diferentes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scanner-index-'));
  try {
    const dir = await folder(root, 'A', ['base1-1']);
    await writeFile(join(dir, indexFilename), '{');
    await assert.rejects(loadIndex(root, meta), /incompleta/);
    await writeFile(
      join(dir, indexFilename),
      JSON.stringify({ id: 'base1-1', vector: [0] }) + '\n',
    );
    await assert.rejects(loadIndex(root, meta), /vector/);
    await folder(root, 'A', ['base1-1']);
    const second = await folder(root, 'B', ['base1-1']);
    await writeFile(
      join(second, indexFilename),
      JSON.stringify({
        id: 'base1-1',
        vector: vector.map((_, i) => (i === 1 ? 1 : 0)),
      }) + '\n',
    );
    await assert.rejects(loadIndex(root, meta), /duplicadas/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
