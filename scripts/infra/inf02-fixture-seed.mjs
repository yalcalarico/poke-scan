#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const root = process.env.ARTIFACT_DIR;
if (!root) throw new Error('Falta ARTIFACT_DIR.');
const collections = (await readdir(join(root, 'index'), { withFileTypes: true })).filter((entry) => entry.isDirectory());
let cardId;
for (const collection of collections) {
  const files = await readdir(join(root, 'index', collection.name));
  const jsonl = files.find((name) => name.endsWith('.jsonl'));
  if (!jsonl) continue;
  const first = (await readFile(join(root, 'index', collection.name, jsonl), 'utf8')).split('\n').find(Boolean);
  if (first) { cardId = JSON.parse(first).id; break; }
}
if (!cardId) {
  console.log(JSON.stringify({ fixture: 'skipped', reason: 'bundle sin referencias' }));
  process.exit(0);
}
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: process.env.FIXTURE_EMAIL },
      update: {},
      create: {
        email: process.env.FIXTURE_EMAIL,
        username: process.env.FIXTURE_USERNAME,
        passwordHash: await argon2.hash(process.env.FIXTURE_PASSWORD),
        displayName: 'Coleccionista INF02',
      },
    });
    await tx.cardSet.upsert({
      where: { id: 'inf02-fixture-set' }, update: {},
      create: { id: 'inf02-fixture-set', name: 'Colección de prueba INF02', series: 'Fixture' },
    });
    const image = '/icons/icon-192.png';
    await tx.card.upsert({
      where: { id: cardId }, update: {},
      create: {
        id: cardId, name: 'Pokémon de prueba INF02', supertype: 'Pokémon', subtypes: [], types: ['Colorless'],
        number: '1', rarity: 'Common', artist: 'Fixture', setId: 'inf02-fixture-set', imageSmall: image,
        imageLarge: image, rawJson: { id: cardId, name: 'Pokémon de prueba INF02', images: { small: image, large: image } },
      },
    });
    const collection = await tx.collection.upsert({
      where: { id: 'c4d2d715-3c09-4cae-9ac5-383123f82573' }, update: {},
      create: { id: 'c4d2d715-3c09-4cae-9ac5-383123f82573', userId: user.id, name: 'Binder INF02', isDefault: false },
    });
    await tx.collectionItem.upsert({
      where: { collectionId_cardId_variant_condition: { collectionId: collection.id, cardId, variant: 'normal', condition: 'NM' } },
      update: {}, create: { collectionId: collection.id, cardId, variant: 'normal', condition: 'NM', quantity: 1 },
    });
    await tx.shareLink.upsert({
      where: { slug: process.env.FIXTURE_SLUG }, update: {},
      create: { userId: user.id, collectionId: collection.id, slug: process.env.FIXTURE_SLUG },
    });
  });
  console.log(JSON.stringify({ fixture: 'ready', cardId, share: 'ready' }));
} finally {
  await db.$disconnect();
}
