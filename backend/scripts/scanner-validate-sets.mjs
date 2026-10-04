/** Verificación local de pertenencia y completitud; sin descargas ni cambios. */
import { PrismaClient } from '@prisma/client';
import { readdir, readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setFolderName } from './scanner-set-name.mjs';
import { referenceUrl } from './scanner-reference-url.mjs';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const options = new Map();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--help') {
    console.log(
      'Validá índices contra el catálogo local.\n--directory RUTA (.scanner-index) --set ID --json\nExit 1: incompleto o inválido; exit 2: índice activo o sin set identificable. No modifica archivos.',
    );
    process.exit(0);
  }
  if (args[i] === '--json') {
    options.set('--json', true);
    continue;
  }
  if (
    !['--directory', '--set'].includes(args[i]) ||
    !args[i + 1] ||
    args[i + 1].startsWith('--')
  )
    throw new Error('Opción inválida: ' + args[i]);
  options.set(args[i], args[++i]);
}
const root = resolve(options.get('--directory') ?? '.scanner-index');
const prisma = new PrismaClient();
try {
  const sets = await prisma.cardSet.findMany({
    select: {
      id: true,
      name: true,
      cards: { select: { id: true, imageLarge: true, imageSmall: true } },
    },
  });
  const byId = new Map(sets.map((set) => [set.id, set]));
  if (options.has('--set') && !byId.has(options.get('--set')))
    throw new Error('Set inexistente.');
  const cards = new Map(
    sets.flatMap((set) =>
      set.cards.map((card) => [card.id, { ...card, setId: set.id }]),
    ),
  );
  const reports = [];
  let folders = [];
  try {
    folders = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const folder of folders.filter((folder) => folder.isDirectory())) {
    const dir = resolve(root, folder.name);
    const files = await readdir(dir);
    const indexFiles = files.filter((file) => file.endsWith('.jsonl'));
    const expected = new Set(
      sets
        .filter(
          (set) =>
            setFolderName(set.name) === folder.name || set.id === folder.name,
        )
        .map((set) => set.id),
    );
    let manifest;
    try {
      manifest = JSON.parse(
        await readFile(resolve(dir, 'backup-manifest.json'), 'utf8'),
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (manifest) {
      if (!Array.isArray(manifest.references))
        throw new Error('Manifiesto inválido: ' + folder.name);
      for (const ref of manifest.references)
        if (typeof ref.setId === 'string') expected.add(ref.setId);
    }
    if (options.has('--set') && !expected.has(options.get('--set'))) continue;
    if (!indexFiles.length && !expected.size) continue;
    if (files.includes('index.lock')) {
      reports.push({
        folder: folder.name,
        status: 'en ejecución',
        sets: [...expected],
      });
      continue;
    }
    if (!expected.size) {
      reports.push({ folder: folder.name, status: 'set no identificado' });
      continue;
    }
    const unknownSets = [...expected].filter((id) => !byId.has(id));
    const expectedIds = new Set(
      [...expected].flatMap(
        (id) => byId.get(id)?.cards.map((card) => card.id) ?? [],
      ),
    );
    const seen = new Set();
    const validIds = new Set();
    const foreignIds = [];
    const duplicates = [];
    const invalidRows = [];
    const missingImages = [];
    if (indexFiles.length > 1)
      invalidRows.push(
        'Más de un índice JSONL: seleccioná un único modelo por directorio.',
      );
    for (const file of indexFiles) {
      const lines = (await readFile(resolve(dir, file), 'utf8'))
        .split('\n')
        .filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        let entry;
        try {
          entry = JSON.parse(lines[i]);
        } catch {
          invalidRows.push(`${file}:${i + 1}`);
          continue;
        }
        if (!entry || typeof entry.id !== 'string') {
          invalidRows.push(`${file}:${i + 1}`);
          continue;
        }
        if (seen.has(entry.id)) duplicates.push(entry.id);
        seen.add(entry.id);
        if (!expectedIds.has(entry.id)) {
          foreignIds.push(entry.id);
          continue;
        }
        const card = cards.get(entry.id);
        const url = referenceUrl(card);
        if (
          !Array.isArray(entry.vector) ||
          entry.vector.length !== 384 ||
          !entry.vector.every(Number.isFinite) ||
          Math.abs(Math.hypot(...entry.vector) - 1) > 0.001 ||
          entry.imageUrl !== url
        ) {
          invalidRows.push(
            `${file}:${i + 1} (${entry.id}: vector o URL incompatible)`,
          );
          continue;
        }
        validIds.add(entry.id);
        const filename =
          createHash('sha256')
            .update(entry.id + url)
            .digest('hex') + '.image';
        try {
          const image = await lstat(resolve(dir, 'images', filename));
          if (!image.isFile() || image.size === 0) missingImages.push(entry.id);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          missingImages.push(entry.id);
        }
      }
    }
    const missingIds = [...expectedIds].filter((id) => !validIds.has(id));
    const complete =
      !missingIds.length &&
      !foreignIds.length &&
      !duplicates.length &&
      !invalidRows.length &&
      !unknownSets.length;
    reports.push({
      folder: folder.name,
      status: complete ? 'completo' : 'incompleto o inválido',
      expected: expectedIds.size,
      validVectors: validIds.size,
      sets: [...expected],
      missingIds,
      foreignIds,
      duplicates,
      invalidRows,
      unknownSets,
      missingImages,
    });
  }
  if (options.has('--set') && !reports.length)
    reports.push({
      set: options.get('--set'),
      status: 'sin índice',
      expected: byId.get(options.get('--set')).cards.length,
      validVectors: 0,
    });
  if (options.has('--json')) console.log(JSON.stringify(reports, null, 2));
  else
    for (const report of reports)
      console.log(
        `${report.folder ?? report.set}: ${report.status}; vectores ${report.validVectors ?? '?'}/${report.expected ?? '?'}; faltantes ${report.missingIds?.length ?? '?'}; ajenas ${report.foreignIds?.length ?? 0}; duplicadas ${report.duplicates?.length ?? 0}; inválidas ${report.invalidRows?.length ?? 0}; imágenes ausentes ${report.missingImages?.length ?? 0}`,
      );
  console.log(
    options.has('--json')
      ? ''
      : 'Las imágenes ausentes no invalidan los vectores: pueden haberse eliminado tras respaldarlas. La validación no detecta contenido visual incorrecto ni comprueba hashes de imágenes.',
  );
  if (
    !reports.length ||
    reports.some((report) =>
      ['en ejecución', 'set no identificado'].includes(report.status),
    )
  )
    process.exitCode = 2;
  else if (reports.some((report) => report.status !== 'completo'))
    process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
