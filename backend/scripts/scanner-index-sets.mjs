/** Lotes por expansión completa; --limit cuenta sets, no cartas. */
import { PrismaClient } from '@prisma/client';
import {
  lstat,
  readdir,
  readFile,
  open,
  unlink,
  mkdir,
} from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setFolderName } from './scanner-set-name.mjs';
import { referenceUrl } from './scanner-reference-url.mjs';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
if (args.includes('--help')) {
  console.log(
    'Indexá sets completos en carpetas por nombre.\n--limit N (cantidad de sets pendientes, default 1) --directory RUTA (.scanner-index)\n--delay-ms N (0, sin pausa) --model RUTA --set ID --dry-run\nValida IDs del catálogo: saltea completos y reanuda incompletos. Continúa con otros sets ante fallos y los informa al final.',
  );
  process.exit(0);
}
const options = new Map();
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (key === '--dry-run') {
    options.set(key, true);
    continue;
  }
  if (
    ![
      '--limit',
      '--max-sets',
      '--directory',
      '--delay-ms',
      '--model',
      '--set',
    ].includes(key) ||
    !args[i + 1] ||
    args[i + 1].startsWith('--')
  )
    throw new Error('Opción inválida: ' + key);
  options.set(key, args[++i]);
}
if (options.has('--limit') && options.has('--max-sets'))
  throw new Error('Usá sólo --limit para la cantidad de sets.');
const limit = Number(options.get('--limit') ?? options.get('--max-sets') ?? 1);
const delayMs = Number(options.get('--delay-ms') ?? 0);
if (!Number.isSafeInteger(limit) || limit < 1)
  throw new Error('Límite inválido: cantidad positiva de sets.');
if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 60000)
  throw new Error('Pausa inválida (0–60000 ms).');
if (process.env.SCANNER_CARD_IDS)
  throw new Error('Quitá SCANNER_CARD_IDS para indexar sets completos.');
const root = resolve(options.get('--directory') ?? '.scanner-index');
const dryRun = options.has('--dry-run');
const prisma = new PrismaClient();
let child, batchLock;
let interrupted = false;
const lockPath = resolve(root, 'sets-index.lock');
process.on('SIGINT', () => {
  interrupted = true;
  child?.kill('SIGINT');
});
process.on('SIGTERM', () => {
  interrupted = true;
  child?.kill('SIGINT');
});

try {
  // Tomar el bloqueo antes de leer índices para que dos lotes no planifiquen a la vez.
  if (!dryRun) {
    await mkdir(root, { recursive: true });
    batchLock = await open(lockPath, 'wx');
    await batchLock.writeFile(JSON.stringify({ pid: process.pid }));
  }
  const sets = await prisma.cardSet.findMany({
    where: options.has('--set') ? { id: options.get('--set') } : undefined,
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      cards: { select: { id: true, imageLarge: true, imageSmall: true } },
    },
  });
  if (!sets.length) throw new Error('No hay expansiones para la selección.');
  await prisma.$disconnect();
  const modelPath = resolve(
    options.get('--model') ??
      process.env.SCANNER_MODEL ??
      '.scanner-models/dinov2-small-int8.onnx',
  );
  const modelHash = createHash('sha256')
    .update(await readFile(modelPath))
    .digest('hex');
  const preprocessingHash = createHash('sha256')
    .update('sharp-rotate-srgb-cubic-short256-center224-imagenet-cls384-l2-v1')
    .digest('hex');
  let folders = [];
  try {
    folders = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const indexes = new Map();
  for (const folder of folders.filter((folder) => folder.isDirectory())) {
    const dir = resolve(root, folder.name);
    const files = await readdir(dir);
    // Nunca leer un JSONL que otro proceso todavía puede estar escribiendo.
    if (files.includes('index.lock'))
      throw new Error(
        'Hay una indexación activa en ' + dir + '. Esperá a que termine.',
      );
    let metadata;
    try {
      metadata = JSON.parse(await readFile(resolve(dir, 'meta.json'), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (
      metadata.modelHash !== modelHash ||
      metadata.preprocessingHash !== preprocessingHash ||
      metadata.dimensions !== 384 ||
      metadata.precision !== 'int8'
    )
      continue;
    const indexFiles = files.filter((file) => file.endsWith('.jsonl'));
    // Un lote con cero éxitos deja metadata válida sin crear aún el JSONL.
    if (indexFiles.length === 0) {
      indexes.set(dir, new Map());
      continue;
    }
    if (indexFiles.length !== 1) continue;
    const entries = new Map();
    for (const line of (await readFile(resolve(dir, indexFiles[0]), 'utf8'))
      .split('\n')
      .filter(Boolean)) {
      const entry = JSON.parse(line);
      if (
        !entry ||
        typeof entry.id !== 'string' ||
        entries.has(entry.id) ||
        !Array.isArray(entry.vector) ||
        entry.vector.length !== 384 ||
        !entry.vector.every(Number.isFinite) ||
        Math.abs(Math.hypot(...entry.vector) - 1) > 0.001
      )
        throw new Error('Índice inválido: ' + dir);
      entries.set(entry.id, entry);
    }
    indexes.set(dir, entries);
  }
  const names = new Set();
  const plan = [];
  for (const set of sets) {
    const name = setFolderName(set.name);
    if (!name) throw new Error('Nombre inválido: ' + set.id);
    const key = name.normalize('NFC').toLowerCase();
    if (names.has(key))
      throw new Error('Nombres de carpetas repetidos: ' + name);
    names.add(key);
    const namedDirectory = resolve(root, name);
    const expectedCards = new Map(set.cards.map((card) => [card.id, card]));
    const urlFor = referenceUrl;
    const complete = [...indexes.values()].some((entries) =>
      set.cards.every(
        (card) => entries.get(card.id)?.imageUrl === urlFor(card),
      ),
    );
    if (complete || !set.cards.length) {
      console.log(
        'Omitiendo ' +
          set.name +
          ': ' +
          (complete
            ? 'set completo (' + set.cards.length + ' cartas)'
            : 'sin cartas') +
          '.',
      );
      continue;
    }
    // Reutilizar también carpetas históricas identificadas por ID o por sus cartas.
    let directory = namedDirectory;
    const partial = [...indexes].filter(
      ([dir, entries]) =>
        dir === namedDirectory ||
        (entries.size > 0 &&
          [...entries.keys()].every((id) => expectedCards.has(id))),
    );
    if (partial.length > 1)
      throw new Error(
        'Hay varios índices parciales para ' +
          set.name +
          '. Consolidalos antes de continuar.',
      );
    if (partial.length === 1) directory = partial[0][0];
    const own = indexes.get(directory);
    let exists = false;
    try {
      await lstat(directory);
      exists = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (exists && !own)
      throw new Error(
        'Carpeta sin índice compatible: ' +
          directory +
          '. Revisala antes de continuar.',
      );
    if (
      own &&
      [...own.values()].some(
        (entry) =>
          !expectedCards.has(entry.id) ||
          entry.imageUrl !== urlFor(expectedCards.get(entry.id)),
      )
    )
      throw new Error(
        'Cartas ajenas o URLs desactualizadas en ' +
          directory +
          '. Revisá el índice.',
      );
    if (set.cards.some((card) => !urlFor(card)))
      throw new Error(
        'Hay cartas sin URL de imagen en ' +
          set.name +
          '. No se puede completar el set.',
      );
    const missing = set.cards.length - (own?.size ?? 0);
    if (plan.length < limit) plan.push({ ...set, directory, missing });
  }
  console.log(
    JSON.stringify({
      dryRun,
      sets: plan.length,
      setLimit: limit,
      maximumAttempts: plan.reduce((n, set) => n + set.missing, 0),
      delayMs,
    }),
  );
  const failedSets = [];
  let completedSets = 0;
  for (const set of plan) {
    if (interrupted) break;
    console.log(
      `${dryRun ? 'Plan' : 'Indexando'}: ${set.name} [${set.id}] — ${set.missing}/${set.cards.length} pendientes → ${set.directory}`,
    );
    if (dryRun) continue;
    if (set.cards.length > 30000)
      throw new Error('Set fuera del límite soportado: ' + set.id);
    const childArgs = [
      '--env-file-if-exists=.env',
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        'scanner-visual-spike.mjs',
      ),
      'index',
      '--set',
      set.id,
      '--limit',
      String(set.cards.length),
      '--directory',
      set.directory,
      '--delay-ms',
      String(delayMs),
      '--model',
      modelPath,
    ];
    const code = await new Promise((done, reject) => {
      child = spawn(process.execPath, childArgs, { stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', (code, signal) =>
        done(code ?? (signal === 'SIGINT' ? 130 : 1)),
      );
    });
    child = undefined;
    if (code !== 0) {
      if (interrupted) break;
      failedSets.push({ id: set.id, name: set.name, exitCode: code });
      console.error('Set pendiente: ' + set.name + '. Continuando con el siguiente set.');
      continue;
    }
    const files = await readdir(set.directory);
    const index = files.find((file) => file.endsWith('.jsonl'));
    const saved = new Set(
      (await readFile(resolve(set.directory, index), 'utf8'))
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line).id),
    );
    const expected = new Set(set.cards.map((card) => card.id));
    if (
      saved.size !== expected.size ||
      [...expected].some((id) => !saved.has(id))
    )
      throw new Error(
        set.name +
          ': el índice no coincide con todas las cartas del catálogo después de indexar.',
      );
    console.log(
      'Set completo: ' + set.name + ' (' + set.cards.length + ' cartas).',
    );
    completedSets++;
  }
  if (!dryRun) {
    console.log(JSON.stringify({ selectedSets: plan.length, completedSets, failedSets, interrupted }));
    if (failedSets.length) process.exitCode = 1;
  }
  if (interrupted) process.exitCode = 130;
} finally {
  await prisma.$disconnect();
  if (batchLock) {
    await batchLock.close();
    await unlink(lockPath);
  }
}
