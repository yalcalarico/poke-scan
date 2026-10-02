/** Índice experimental, reanudable y separado de los handlers públicos. */
import {
  mkdir,
  readFile,
  appendFile,
  writeFile,
  open,
  unlink,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { InferenceSession, Tensor } from 'onnxruntime-node';

const revision = '8b1f705a3a7f6f062f6bdd21986c1583d3ef105d';
const model = resolve(
  process.env.SCANNER_MODEL ?? '.scanner-models/dinov2-small-int8.onnx',
);
const directory = resolve(process.env.SCANNER_INDEX_DIR ?? '.scanner-index');
const preprocessingHash = createHash('sha256')
  .update('sharp-rotate-srgb-cubic-short256-center224-imagenet-cls384-l2-v1')
  .digest('hex');
const indexPath = resolve(directory, `dinov2-${revision}-int8.jsonl`);
const args = process.argv.slice(2);
const evaluate = args[0] === 'evaluate';
const limit = Number(args[1] ?? 100);
if (!['index', 'evaluate'].includes(args[0]))
  throw new Error('Usá index [límite de intentos] o evaluate [manifiesto].');
if (!evaluate && (!Number.isInteger(limit) || limit < 1 || limit > 30000))
  throw new Error('Límite inválido.');
await mkdir(directory, { recursive: true });
const metadata = {
  revision,
  precision: 'int8',
  dimensions: 384,
  preprocessingHash,
  modelHash: createHash('sha256')
    .update(await readFile(model))
    .digest('hex'),
};
const metaPath = resolve(directory, 'meta.json');
try {
  const stored = JSON.parse(await readFile(metaPath, 'utf8'));
  if (JSON.stringify(stored) !== JSON.stringify(metadata))
    throw new Error(
      'Modelo o preprocesado incompatible. Usá otro SCANNER_INDEX_DIR.',
    );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  try {
    await readFile(indexPath);
    throw new Error(
      'Índice legado sin metadata: reconstruí en otro SCANNER_INDEX_DIR.',
    );
  } catch (indexError) {
    if (indexError.code !== 'ENOENT') throw indexError;
  }
  await writeFile(metaPath, JSON.stringify(metadata, null, 2), { flag: 'wx' });
}
const session = await InferenceSession.create(model, { intraOpNumThreads: 2 });

async function embedding(image) {
  // El preprocesado oficial redimensiona el lado corto a 256 y centra un recorte de 224.
  const { width, height } = await sharp(image).rotate().metadata();
  if (!width || !height) throw new Error('Imagen sin dimensiones.');
  const scale = 256 / Math.min(width, height);
  const w = Math.round(width * scale),
    h = Math.round(height * scale);
  const pixels = await sharp(image)
    .rotate()
    .resize(w, h, { kernel: 'cubic' })
    .extract({
      left: Math.floor((w - 224) / 2),
      top: Math.floor((h - 224) / 2),
      width: 224,
      height: 224,
    })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer();
  const data = new Float32Array(3 * 224 * 224);
  const mean = [0.485, 0.456, 0.406],
    std = [0.229, 0.224, 0.225];
  for (let channel = 0; channel < 3; channel++) {
    for (let i = 0; i < 224 * 224; i++)
      data[channel * 224 * 224 + i] =
        (pixels[i * 3 + channel] / 255 - mean[channel]) / std[channel];
  }
  const output = await session.run({
    pixel_values: new Tensor('float32', data, [1, 3, 224, 224]),
  });
  // Primer token (CLS) del last_hidden_state; no promediar los tokens de fondo.
  const vector = Array.from(
    output.last_hidden_state.data.slice(0, 384),
    Number,
  );
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || norm === 0)
    throw new Error('Embedding inválido.');
  return vector.map((value) => value / norm);
}

const entries = new Map();
try {
  for (const line of (await readFile(indexPath, 'utf8'))
    .split('\n')
    .filter(Boolean)) {
    const entry = JSON.parse(line);
    if (
      entry === null ||
      typeof entry !== 'object' ||
      typeof entry.id !== 'string' ||
      !Array.isArray(entry.vector) ||
      entry.vector.length !== 384 ||
      !entry.vector.every(Number.isFinite)
    )
      throw new Error('Índice inválido.');
    entries.set(entry.id, entry);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

if (evaluate) {
  if (!args[1])
    throw new Error('Indicá un manifiesto JSON con [{path, cardId}].');
  const modelReadyMs = performance.now();
  const queries = JSON.parse(await readFile(resolve(args[1]), 'utf8'));
  if (
    !Array.isArray(queries) ||
    queries.length === 0 ||
    !queries.every(
      (q) =>
        q !== null &&
        typeof q === 'object' &&
        typeof q.path === 'string' &&
        typeof q.cardId === 'string' &&
        q.cardId.length > 0,
    )
  )
    throw new Error('Manifiesto inválido: requiere path y cardId exacto.');
  if (entries.size === 0) throw new Error('Índice vacío.');
  const results = [];
  for (const query of queries) {
    const start = performance.now();
    const vector = await embedding(await readFile(resolve(query.path)));
    const ranked = [...entries.values()]
      .map((entry) => ({
        id: entry.id,
        name: entry.name ?? null,
        cosine: entry.vector.reduce(
          (sum, value, i) => sum + value * vector[i],
          0,
        ),
      }))
      .sort((a, b) => b.cosine - a.cosine);
    const rank = ranked.findIndex((entry) => entry.id === query.cardId);
    const distractors = ranked
      .filter((entry) => entry.id !== query.cardId)
      .map((entry) => entry.cosine)
      .sort((a, b) => a - b);
    results.push({
      path: query.path,
      cardId: query.cardId,
      correctReferencePresent: rank >= 0,
      rank: rank < 0 ? null : rank + 1,
      marginOverMedian:
        rank < 0 || distractors.length === 0
          ? null
          : ranked[rank].cosine -
            (distractors[Math.floor((distractors.length - 1) / 2)] +
              distractors[Math.floor(distractors.length / 2)]) /
              2,
      elapsedMs: performance.now() - start,
      top10: ranked.slice(0, 10),
    });
  }
  const times = results.map((r) => r.elapsedMs).sort((a, b) => a - b);
  const report = {
    evaluatedAt: new Date().toISOString(),
    evaluationWallMs: performance.now() - modelReadyMs,
    metadata,
    queries: queries.length,
    top1: results.filter((r) => r.rank === 1).length,
    top10: results.filter((r) => r.rank !== null && r.rank <= 10).length,
    missingReferences: results.filter((r) => !r.correctReferencePresent).length,
    latencyMs: {
      p50: times[Math.ceil(times.length * 0.5) - 1],
      p99: times[Math.ceil(times.length * 0.99) - 1],
      scope:
        'lectura + preprocesado + inferencia + ranking; sin inicio del modelo',
    },
    revision,
    precision: 'int8',
    references: entries.size,
    results,
    productionReady: false,
    note: 'Evaluar contra el catálogo completo y ground truth exacto antes de integrar.',
  };
  await writeFile(
    resolve(directory, 'evaluation.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} else {
  const lockPath = resolve(directory, 'index.lock');
  const lock = await open(lockPath, 'wx');
  await lock.writeFile(
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
  );
  const prisma = new PrismaClient();
  try {
    const cards = await prisma.card.findMany({
      ...(process.env.SCANNER_CARD_IDS
        ? {
            where: {
              id: {
                in: process.env.SCANNER_CARD_IDS.split(',').filter(Boolean),
              },
            },
          }
        : {}),
      orderBy: { id: 'asc' },
      select: { id: true, name: true, imageLarge: true, imageSmall: true },
    });
    const pending = cards.filter(
      (card) => !entries.has(card.id) && (card.imageLarge || card.imageSmall),
    );
    console.log(
      JSON.stringify({
        catalog: cards.length,
        indexed: entries.size,
        pending: pending.length,
        attemptLimit: limit,
        minimumThrottleSeconds: Math.min(limit, pending.length) * 2.3,
      }),
    );
    let completed = 0,
      attempted = 0;
    for (const card of cards) {
      if (entries.has(card.id)) continue;
      const url = card.imageLarge ?? card.imageSmall;
      if (!url) continue;
      attempted++;
      try {
        const parsed = new URL(url);
        if (
          parsed.protocol !== 'https:' ||
          !['images.pokemontcg.io', 'images.scrydex.com'].includes(
            parsed.hostname,
          )
        )
          throw new Error('Host de referencia no permitido.');
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30000),
          redirect: 'error',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 10 * 1024 * 1024)
          throw new Error('Referencia demasiado grande.');
        const entry = {
          id: card.id,
          name: card.name,
          vector: await embedding(bytes),
        };
        await appendFile(indexPath, JSON.stringify(entry) + '\n');
        entries.set(card.id, entry);
        completed++;
        console.log(
          `${completed}/${limit}: ${card.id} (${entries.size} referencias)`,
        );
      } catch (error) {
        console.error(`${card.id}: ${error.message}`);
      }
      // Respetar el presupuesto aun si una descarga falla; nunca correr en un handler.
      await new Promise((done) => setTimeout(done, 2300));
      if (attempted >= limit) break;
    }
  } finally {
    await prisma.$disconnect();
    await lock.close();
    await unlink(lockPath);
  }
}
await session.release();
