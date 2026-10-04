/** Índice experimental, reanudable y separado de los handlers públicos. */
import {
  mkdir,
  readFile,
  appendFile,
  writeFile,
  open,
  unlink,
  rename,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import { embedding as computeEmbedding } from './scanner-visual-engine.mjs';
import { InferenceSession } from 'onnxruntime-node';
import { referenceUrl, isAllowedReference } from './scanner-reference-url.mjs';

const args = process.argv.slice(2);
const command = args.shift();
const options = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const argument = args[i];
  if (argument === '--') continue;
  if (argument === '--list-sets') {
    options.listSets = true;
    continue;
  }
  if (argument === '--help') {
    options.help = true;
    continue;
  }
  if (argument.startsWith('--')) {
    if (
      ![
        '--limit',
        '--set',
        '--card-ids',
        '--directory',
        '--model',
        '--delay-ms',
      ].includes(argument) ||
      !args[i + 1] ||
      args[i + 1].startsWith('--')
    )
      throw new Error('Opción inválida: ' + argument);
    options[argument.slice(2)] = args[++i];
  } else positional.push(argument);
}
if (options.help || command === '--help' || !command) {
  console.log(
    'Índice visual experimental (sin integración pública).\n index [límite] --limit N --set ID --card-ids ID,ID --directory RUTA --model RUTA --delay-ms N\n evaluate MANIFIESTO --directory RUTA --model RUTA\n sets o --list-sets: lista expansiones del catálogo local\nEl límite cuenta intentos nuevos; omite referencias ya indexadas. Pausa CDN: 0ms por defecto (--delay-ms 0–60000). Sin presupuesto diario automático.',
  );
  process.exit(0);
}
if (command === 'sets' || command === '--list-sets' || options.listSets) {
  const prisma = new PrismaClient();
  try {
    console.log(
      JSON.stringify(
        await prisma.cardSet.findMany({
          orderBy: { id: 'asc' },
          select: { id: true, name: true, _count: { select: { cards: true } } },
        }),
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
  process.exit(0);
}
const revision = '8b1f705a3a7f6f062f6bdd21986c1583d3ef105d';
const model = resolve(
  options.model ??
    process.env.SCANNER_MODEL ??
    '.scanner-models/dinov2-small-int8.onnx',
);
const directory = resolve(
  options.directory ?? process.env.SCANNER_INDEX_DIR ?? '.scanner-index',
);
const preprocessingHash = createHash('sha256')
  .update('sharp-rotate-srgb-cubic-short256-center224-imagenet-cls384-l2-v1')
  .digest('hex');
const indexPath = resolve(directory, `dinov2-${revision}-int8.jsonl`);
const evaluate = command === 'evaluate';
const limit = Number(options.limit ?? positional[0] ?? 100);
if (!['index', 'evaluate'].includes(command))
  throw new Error('Usá index, evaluate o sets.');
if (!evaluate && (!Number.isInteger(limit) || limit < 1 || limit > 30000))
  throw new Error('Límite inválido (1–30000).');
const delayMs = Number(options['delay-ms'] ?? 0);
if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 60000)
  throw new Error('Pausa inválida (0–60000 ms).');
const cardIds = options['card-ids'] ?? process.env.SCANNER_CARD_IDS;
if (positional.length > 1)
  throw new Error('Demasiados argumentos posicionales.');
if (
  cardIds !== undefined &&
  !cardIds.split(',').every((id) => /^[a-zA-Z0-9_-]+$/.test(id))
)
  throw new Error('IDs de cartas inválidos.');
if (evaluate && !positional[0]) throw new Error('Indicá un manifiesto.');
if (options.set !== undefined && !/^[a-zA-Z0-9_-]+$/.test(options.set))
  throw new Error('ID de expansión inválido.');
await mkdir(directory, { recursive: true });
const lockPath = resolve(directory, 'index.lock');
const lock = await open(lockPath, 'wx');
let session;
let interrupted = false;
process.on('SIGINT', () => {
  interrupted = true;
  console.error(
    'Interrupción solicitada: terminando el intento actual y guardando estado.',
  );
});
try {
  await lock.writeFile(
    JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString(),
      command,
    }),
  );
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
    await writeFile(metaPath, JSON.stringify(metadata, null, 2), {
      flag: 'wx',
    });
  }
  session = await InferenceSession.create(model, { intraOpNumThreads: 2 });

  const embedding = (image) => computeEmbedding(session, image);

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
    if (!positional[0])
      throw new Error('Indicá un manifiesto JSON con [{path, cardId}].');
    const modelReadyMs = performance.now();
    const queries = JSON.parse(await readFile(resolve(positional[0]), 'utf8'));
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
      missingReferences: results.filter((r) => !r.correctReferencePresent)
        .length,
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
    const prisma = new PrismaClient();
    try {
      const cards = await prisma.card.findMany({
        where: {
          ...(options.set ? { setId: options.set } : {}),
          ...(cardIds
            ? { id: { in: cardIds.split(',').filter(Boolean) } }
            : {}),
        },
        orderBy: { id: 'asc' },
        select: { id: true, name: true, imageLarge: true, imageSmall: true },
      });
      if (cards.length === 0)
        throw new Error(
          'No hay cartas para la selección. Revisá --set y --card-ids con scanner:sets.',
        );
      if (cardIds && cards.length !== new Set(cardIds.split(',')).size)
        throw new Error(
          'Algún ID no existe o no pertenece a la expansión seleccionada.',
        );
      const pending = cards.filter(
        (card) => !entries.has(card.id) && referenceUrl(card),
      );
      console.log(
        JSON.stringify({
          catalog: cards.length,
          indexed: entries.size,
          pending: pending.length,
          attemptLimit: limit,
          delayMs,
          minimumThrottleSeconds:
            (Math.min(limit, pending.length) * delayMs) / 1000,
        }),
      );
      await mkdir(resolve(directory, 'images'), { recursive: true });
      let completed = 0,
        attempted = 0,
        failed = 0,
        downloads = 0,
        cachedImages = 0;
      const startedAt = performance.now();
      for (const card of cards) {
        if (entries.has(card.id)) continue;
        const url = referenceUrl(card);
        if (!url) continue;
        attempted++;
        try {
          if (!isAllowedReference(card.id, url))
            throw new Error('Host de referencia no permitido.');
          const imagePath = resolve(
            directory,
            'images',
            createHash('sha256')
              .update(card.id + url)
              .digest('hex') + '.image',
          );
          let bytes;
          try {
            bytes = await readFile(imagePath);
            cachedImages++;
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            const response = await fetch(url, {
              signal: AbortSignal.timeout(30000),
              redirect: 'error',
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.length > 10 * 1024 * 1024)
              throw new Error('Referencia demasiado grande.');
            const temporaryPath = imagePath + '.tmp';
            await writeFile(temporaryPath, bytes);
            await rename(temporaryPath, imagePath);
            downloads++;
          }
          const entry = {
            id: card.id,
            name: card.name,
            imageUrl: url,
            imagePath,
            vector: await embedding(bytes),
          };
          await appendFile(indexPath, JSON.stringify(entry) + '\n');
          entries.set(card.id, entry);
          completed++;
          console.log(
            `${completed}/${limit}: ${card.id} (${entries.size} referencias)`,
          );
        } catch (error) {
          failed++;
          console.error(`${card.id}: ${error.message}`);
        }
        // La pausa del CDN es independiente del throttling de la API de precios.
        if (delayMs > 0) await new Promise((done) => setTimeout(done, delayMs));
        if (attempted >= limit || interrupted) break;
      }
      const summary = {
        selectedCatalog: cards.length,
        delayMs,
        attempted,
        completed,
        failed,
        downloads,
        cachedImages,
        indexed: entries.size,
        elapsedMs: performance.now() - startedAt,
        interrupted,
        productionReady: false,
      };
      await writeFile(
        resolve(directory, 'index-summary.json'),
        JSON.stringify(summary, null, 2),
      );
      console.log(JSON.stringify(summary));
      if (failed > 0) process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  }
  if (interrupted) process.exitCode = 130;
} finally {
  try {
    if (session) await session.release();
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
