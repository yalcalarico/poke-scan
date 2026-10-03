import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

// Solo el runner descartable: nunca importar un catálogo sobre datos existentes.
const db = new URL(process.env.DATABASE_URL ?? '');
if (process.env.CI !== 'true' || db.pathname !== '/pokemon_security_test' ||
    !['localhost', '127.0.0.1'].includes(db.hostname)) {
  throw new Error('El seed de CI solo admite pokemon_security_test en el runner');
}
const directory = process.argv[2];
if (!directory) throw new Error('Falta el directorio del catálogo estático');
const prisma = new PrismaClient();
try {
  if (await prisma.card.count() || await prisma.user.count()) {
    throw new Error('El seed requiere una base vacía');
  }
  const sets = JSON.parse(await readFile(join(directory, 'sets/en.json'), 'utf8'));
  await prisma.cardSet.createMany({ data: sets.map((set) => ({
    id: set.id, name: set.name, series: set.series ?? null,
    printedTotal: set.printedTotal ?? null, total: set.total ?? null,
    releaseDate: set.releaseDate ? new Date(set.releaseDate) : null,
    logoUrl: set.images?.logo ?? null, symbolUrl: set.images?.symbol ?? null,
    ptcgoCode: set.ptcgoCode ?? null, rawJson: set,
  })) });
  for (const file of (await readdir(join(directory, 'cards/en'))).filter((name) => name.endsWith('.json'))) {
    const cards = JSON.parse(await readFile(join(directory, 'cards/en', file), 'utf8'));
    for (let offset = 0; offset < cards.length; offset += 250) {
      await prisma.card.createMany({ data: cards.slice(offset, offset + 250).map((card) => ({
        id: card.id, setId: file.slice(0, -5), name: card.name, supertype: card.supertype,
        subtypes: card.subtypes ?? [], types: card.types ?? [], hp: card.hp ?? null,
        number: card.number, rarity: card.rarity ?? null, artist: card.artist ?? null,
        imageSmall: card.images?.small ?? '', imageLarge: card.images?.large ?? '',
        regulationMark: card.regulationMark ?? null, language: 'en', rawJson: card,
      })) });
    }
  }
  console.log(`Catálogo de CI: ${await prisma.cardSet.count()} sets, ${await prisma.card.count()} cartas`);
} finally {
  await prisma.$disconnect();
}
