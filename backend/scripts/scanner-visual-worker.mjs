import { resolve } from 'node:path';
import sharp from 'sharp';
import { InferenceSession } from 'onnxruntime-node';
import { embedding } from './scanner-visual-engine.mjs';
import { expectedMetadata, refreshIndex } from './scanner-visual-index.mjs';
import { rerankDetails } from './scanner-visual-detail.mjs';

const directory = resolve(
  process.env.SCANNER_VISUAL_INDEX_DIR ??
    process.env.SCANNER_INDEX_DIR ??
    '.scanner-index',
);
const model = resolve(
  process.env.SCANNER_MODEL ?? '.scanner-models/dinov2-small-int8.onnx',
);
let runtime;
let snapshot;
async function load() {
  return {
    expected: await expectedMetadata(model),
    session: await InferenceSession.create(model, {
      intraOpNumThreads: 2,
      interOpNumThreads: 1,
    }),
  };
}
process.on('message', async (message) => {
  const start = performance.now();
  try {
    const bytes = Buffer.from(message.image.split(',')[1], 'base64');
    const metadata = await sharp(bytes, {
      limitInputPixels: 24_000_000,
    }).metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.pages > 1 ||
      Math.max(
        metadata.width / metadata.height,
        metadata.height / metadata.width,
      ) > 20
    )
      throw new Error('Usá una foto JPEG, PNG o WebP de hasta 24 megapíxeles.');
    const cold = !runtime;
    const boot = performance.now();
    runtime ??= await load();
    const modelMs = performance.now() - boot;
    const indexStart = performance.now();
    const refreshed = await refreshIndex(directory, runtime.expected, snapshot);
    snapshot = refreshed.snapshot;
    const indexMs = performance.now() - indexStart;
    const inference = performance.now();
    const vector = await embedding(runtime.session, bytes);
    const inferenceMs = performance.now() - inference;
    const retrieved = snapshot.entries
      .map((entry) => ({
        id: entry.id,
        imagePath: entry.imagePath,
        similarity: entry.vector.reduce(
          (sum, value, i) => sum + value * vector[i],
          0,
        ),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 64)
      .map((candidate, i) => ({ ...candidate, retrievalRank: i + 1 }));
    const verificationStart = performance.now();
    let ranked = retrieved.map((candidate) => ({
      ...candidate,
      geometry: null,
    }));
    let verificationAvailable = false;
    try {
      ranked = await rerankDetails(bytes, retrieved, snapshot.version);
      verificationAvailable = true;
    } catch {
      // Una falla del verificador conserva el ranking DINOv2 y se informa al cliente.
    }
    const verificationMs = performance.now() - verificationStart;
    const candidates = ranked
      .slice(0, 8)
      .map(({ imagePath, ...candidate }) => candidate);
    process.send({
      candidates,
      references: snapshot.entries.length,
      indexVersion: snapshot.version,
      indexStale: refreshed.stale,
      collections: snapshot.collections,
      indexMs,
      cold,
      modelMs,
      inferenceMs,
      verificationMs,
      verificationAvailable,
      retrievalLimit: retrieved.length,
      totalMs: performance.now() - start,
    });
  } catch (error) {
    const missing = error.code === 'ENOENT';
    process.send({
      error: missing
        ? 'Faltan el modelo o los índices locales.'
        : error.message.startsWith('Modelo') ||
            error.message.startsWith('Índice') ||
            error.message.startsWith('Usá')
          ? error.message
          : 'No pudimos procesar la foto. Usá una imagen válida de hasta 24 megapíxeles.',
    });
  }
});
