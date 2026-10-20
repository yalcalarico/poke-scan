/** Evaluación local: reutiliza el motor vigente y aísla ONNX fuera del coordinador. */
import { fork } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { validateQueries, summarizeIdentity } from './scanner-evaluation-metrics.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const percentile = (values, p) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
    : null;

if (process.argv[2] === '--worker') {
  const { InferenceSession } = await import('onnxruntime-node');
  const { embedding } = await import('./scanner-visual-engine.mjs');
  const { expectedMetadata, loadIndex } =
    await import('./scanner-visual-index.mjs');
  let session, snapshot, metadata;
  process.on('message', async ({ path, cardId }) => {
    const started = performance.now();
    try {
      const cold = !session;
      const modelStart = performance.now();
      if (!session) {
        const model = resolve(
          process.env.SCANNER_MODEL ?? '.scanner-models/dinov2-small-int8.onnx',
        );
        metadata = await expectedMetadata(model);
        session = await InferenceSession.create(model, {
          intraOpNumThreads: 2,
          interOpNumThreads: 1,
        });
      }
      const modelMs = performance.now() - modelStart;
      const indexStart = performance.now();
      snapshot = await loadIndex(
        resolve(
          process.env.SCANNER_VISUAL_INDEX_DIR ??
            process.env.SCANNER_INDEX_DIR ??
            '.scanner-index',
        ),
        metadata,
        snapshot,
      );
      const indexMs = performance.now() - indexStart;
      const bytes = await readFile(path);
      const inferenceStart = performance.now();
      const vector = await embedding(session, bytes);
      const inferenceMs = performance.now() - inferenceStart;
      const rankingStart = performance.now();
      const ranked = snapshot.entries
        .map((entry) => ({
          id: entry.id,
          similarity: entry.vector.reduce(
            (sum, value, i) => sum + value * vector[i],
            0,
          ),
        }))
        .sort((a, b) => b.similarity - a.similarity);
      const expectedRank = ranked.findIndex((entry) => entry.id === cardId);
      const retrieved = ranked
        .slice(0, 8)
        .map((candidate, i) => ({ ...candidate, retrievalRank: i + 1 }));
      const rankingMs = performance.now() - rankingStart;
      const verified = retrieved;
      const retrievalLimit = retrieved.length;
      const finalRank = verified.findIndex((entry) => entry.id === cardId);
      process.send({
        cold,
        metadata,
        indexVersion: snapshot.version,
        references: snapshot.entries.length,
        collections: snapshot.collections,
        photoHash: hash(bytes),
        expectedReferencePresent: cardId === null ? null : expectedRank >= 0,
        retrievalRank: expectedRank < 0 ? null : expectedRank + 1,
        finalRank: finalRank < 0 ? null : finalRank + 1,
        retrievalLimit,
        candidates: verified
          .slice(0, 8)
          .map((candidate) => candidate),
        modelMs,
        indexMs,
        inferenceMs,
        rankingMs,
        totalMs: performance.now() - started,
      });
    } catch (error) {
      process.send({ error: error.message });
    }
  });
} else {
  const [manifestArg, outputArg, repeatsArg = '2'] = process.argv.slice(2);
  if (!manifestArg || manifestArg === '--help') {
    console.log(
      'Uso desde backend: node scripts/scanner-evaluate-current.mjs MANIFIESTO REPORTE [REPETICIONES=2]\nManifiesto: [{path, cardId: ID o null, conditions?: [etiquetas], origin?: original/gallery-crop/camera-crop, labelStatus?: positive/negative/unlabelled, split?: development/holdout}]. Fotos ya preparadas; sin recorte de navegador. No descarga ni modifica el índice.',
    );
    process.exit(manifestArg === '--help' ? 0 : 1);
  }
  const repeats = Number(repeatsArg);
  if (!outputArg || !Number.isInteger(repeats) || repeats < 1 || repeats > 100)
    throw new Error('Indicá salida y repeticiones enteras entre 1 y 100.');
  const manifest = resolve(manifestArg);
  if (resolve(outputArg) === manifest)
    throw new Error('El reporte no puede reemplazar el manifiesto.');
  const manifestBytes = await readFile(manifest);
  const queries = validateQueries(JSON.parse(manifestBytes.toString()));
  const child = fork(fileURLToPath(import.meta.url), ['--worker'], {
    execArgv: [],
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  process.once('SIGINT', () => {
    child.kill('SIGKILL');
    process.exit(130);
  });
  const results = [];
  try {
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (const [sample, query] of queries.entries()) {
        const start = performance.now();
        const result = await new Promise((accept, reject) => {
          const finish = (error, value) => {
            clearTimeout(timer);
            child.off('message', message);
            child.off('exit', failed);
            child.off('error', failed);
            if (error) reject(error);
            else accept(value);
          };
          const failed = () =>
            finish(
              new Error(
                'El worker se interrumpió; no se certifica estabilidad nativa.',
              ),
            );
          const message = (value) =>
            finish(value.error ? new Error(value.error) : null, value);
          const timer = setTimeout(
            () => finish(new Error('Timeout local de 30 s.')),
            30_000,
          );
          child.once('message', message);
          child.once('exit', failed);
          child.once('error', failed);
          child.send(
            {
              path: resolve(dirname(manifest), query.path),
              cardId: query.cardId,
            },
            (error) => {
              if (error) finish(error);
            },
          );
        });
        results.push({
          sample,
          repeat,
          cardId: query.cardId,
          conditions: query.conditions ?? [],
          labelStatus: query.labelStatus,
          origin: query.origin,
          split: query.split,
          ...result,
          coordinatorMs: performance.now() - start,
        });
        console.error(
          `Foto ${sample + 1}/${queries.length}, pasada ${repeat + 1}/${repeats}: ${result.candidates[0]?.id ?? 'sin candidato'}`,
        );
      }
    }
    const timings = (rows) =>
      Object.fromEntries(
        [
          'modelMs',
          'indexMs',
          'inferenceMs',
          'rankingMs',
          'totalMs',
          'coordinatorMs',
        ].map((key) => [
          key,
          {
            n: rows.length,
            p50: percentile(
              rows.map((r) => r[key]),
              0.5,
            ),
            p95: percentile(
              rows.map((r) => r[key]),
              0.95,
            ),
            p99: percentile(
              rows.map((r) => r[key]),
              0.99,
            ),
          },
        ]),
      );
    await writeFile(
      resolve(outputArg),
      JSON.stringify(
        {
          schemaVersion: 2,
          evaluatedAt: new Date().toISOString(),
          manifestHash: hash(manifestBytes),
          scope:
            'Fotos provistas ya preparadas; motor local DINOv2 puro top-8 vigente. Sin cámara, recorte cliente, HTTP ni precio. Primera consulta fría; posteriores calientes, no reinicios por foto.',
          productionReady: false,
          samples: queries.length,
          uniquePhotos: new Set(results.filter(r => r.repeat === 0).map(r => r.photoHash)).size,
          repeats,
          metrics: {
            ...summarizeIdentity(results),
            timing: {
              cold: timings(results.filter((r) => r.cold)),
              warm: timings(results.filter((r) => !r.cold)),
            },
          },
          results,
        },
        null,
        2,
      ),
      { flag: 'wx' },
    );
    console.log(`Reporte creado: ${resolve(outputArg)}`);
  } finally {
    child.kill('SIGKILL');
  }
}
