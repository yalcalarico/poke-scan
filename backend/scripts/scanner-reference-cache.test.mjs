import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { loadReferenceImage } from './scanner-reference-cache.mjs';
const png = await sharp({
  create: {
    width: 63,
    height: 88,
    channels: 3,
    background: { r: 70, g: 110, b: 150 },
  },
})
  .png()
  .toBuffer();
const url = 'https://images.pokemontcg.io/example/card.png';
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'reference-cache-'));
  try {
    await run(join(root, 'card.image'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function absent(path) {
  await assert.rejects(access(path), { code: 'ENOENT' });
}
test('HTTP fallido no publica una imagen ni temporal', () =>
  fixture(async (path) => {
    await assert.rejects(
      loadReferenceImage(path, url, {
        fetchImpl: async () => new Response('no', { status: 503 }),
      }),
      /HTTP 503/,
    );
    await absent(path);
    await absent(path + '.tmp');
  }));
test('HTTP 200 con contenido inválido o PNG truncado no envenena caché', () =>
  fixture(async (path) => {
    for (const bytes of [
      Buffer.from('no es una imagen'),
      png.subarray(0, 60),
    ]) {
      await assert.rejects(
        loadReferenceImage(path, url, {
          fetchImpl: async () => new Response(bytes),
        }),
      );
      await absent(path);
      await absent(path + '.tmp');
    }
    const result = await loadReferenceImage(path, url, {
      fetchImpl: async () => new Response(png),
    });
    assert.equal(result.cached, false);
    assert.deepEqual(await readFile(path), png);
  }));
test('caché corrupta se vuelve a descargar y conserva una caché válida', () =>
  fixture(async (path) => {
    await writeFile(path, 'corrupta');
    await writeFile(path + '.tmp', 'descarga interrumpida');
    assert.equal(
      (
        await loadReferenceImage(path, url, {
          fetchImpl: async () => new Response(png),
        })
      ).cached,
      false,
    );
    await absent(path + '.tmp');
    const result = await loadReferenceImage(path, url, {
      fetchImpl: async () => {
        throw new Error('No debe descargar');
      },
    });
    assert.equal(result.cached, true);
    assert.deepEqual(result.bytes, png);
  }));
test('respuesta demasiado grande corta el stream antes de publicarla', () =>
  fixture(async (path) => {
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    await assert.rejects(
      loadReferenceImage(path, url, {
        fetchImpl: async () => new Response(stream),
      }),
      /demasiado grande/,
    );
    assert.equal(cancelled, true);
    await absent(path);
  }));
test('desconexión a mitad de stream deja la descarga pendiente y permite reintentar', () =>
  fixture(async (path) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(png.subarray(0, 40));
        controller.error(new Error('red interrumpida'));
      },
    });
    await assert.rejects(
      loadReferenceImage(path, url, {
        fetchImpl: async () => new Response(stream),
      }),
      /red interrumpida/,
    );
    await absent(path);
    await absent(path + '.tmp');
    assert.equal(
      (
        await loadReferenceImage(path, url, {
          fetchImpl: async () => new Response(png),
        })
      ).cached,
      false,
    );
  }));
test('abort cancela un lector pendiente aunque el transporte ignore la señal', () =>
  fixture(async (path) => {
    const abort = new AbortController();
    let entered;
    const ready = new Promise((resolve) => {
      entered = resolve;
    });
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(png.subarray(0, 40));
      },
      cancel() {
        cancelled = true;
      },
    });
    const pending = loadReferenceImage(path, url, {
      signal: abort.signal,
      fetchImpl: async () => {
        entered();
        return new Response(stream);
      },
    });
    const rejected = assert.rejects(pending, /timeout controlado/);
    await ready;
    await new Promise((resolve) => setImmediate(resolve));
    abort.abort(new Error('timeout controlado'));
    await rejected;
    assert.equal(cancelled, true);
    await absent(path);
    await absent(path + '.tmp');
  }));
