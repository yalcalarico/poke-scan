/** Corrección puntual del catálogo; sin peticiones externas ni cambios de precios. */
import { PrismaClient, Prisma } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import corrections from '../src/catalog/card-image-overrides.json' with { type: 'json' };

const args = process.argv.slice(2).filter((arg) => arg !== '--');
if (args.some((arg) => arg !== '--apply'))
  throw new Error(
    'Usá --apply para guardar; sin opciones sólo muestra el plan.',
  );
const prisma = new PrismaClient();
try {
  const before = await prisma.card.findMany({
    where: { id: { in: Object.keys(corrections) } },
    select: { id: true, imageSmall: true, imageLarge: true },
  });
  if (before.length !== Object.keys(corrections).length)
    throw new Error('Faltan cartas del catálogo; no se aplicó la corrección.');
  const changed = before.filter(
    (card) =>
      card.imageSmall !== corrections[card.id] ||
      card.imageLarge !== corrections[card.id],
  );
  console.log(
    JSON.stringify({
      matched: before.length,
      pending: changed.length,
      apply: args.includes('--apply'),
    }),
  );
  if (args.includes('--apply') && changed.length) {
    await mkdir('.scanner-index', { recursive: true });
    const backup =
      '.scanner-index/db-image-urls-before-' + Date.now() + '.json';
    await writeFile(backup, JSON.stringify(before, null, 2), { flag: 'wx' });
    await prisma.$transaction(async (tx) => {
      const values = Prisma.join(
        changed.map(
          (card) => Prisma.sql`(${card.id}, ${corrections[card.id]})`,
        ),
      );
      const updated =
        await tx.$executeRaw`UPDATE cards AS c SET "imageSmall" = v.url, "imageLarge" = v.url FROM (VALUES ${values}) AS v(id,url) WHERE c.id = v.id`;
      if (updated !== changed.length)
        throw new Error(
          'La cantidad actualizada no coincide; transacción revertida.',
        );
    });
    console.log('URLs corregidas. Respaldo anterior: ' + backup);
  }
} finally {
  await prisma.$disconnect();
}
