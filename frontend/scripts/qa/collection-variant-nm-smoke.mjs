import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const base = process.env.QA_API_URL ?? 'http://127.0.0.1:13301/api';
const api = new URL(base);
assert.ok(['127.0.0.1', 'localhost'].includes(api.hostname) && api.port === '13301', 'Usá la API aislada de QA');
const database = new URL(process.env.DATABASE_URL ?? '');
assert.match(database.pathname, /_test$/);
const require = createRequire(new URL('../../../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
let userId;
let collectionId;
let token;
const priceIds = [];

async function request(path, method = 'GET', body, key) {
  const response = await fetch(`${base}${path}`, {
    method,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Session-Request': '1', Origin: 'http://localhost:13300', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = response.status === 204 ? null : await response.json();
  assert.ok(response.ok, `HTTP ${response.status} en ${path}`);
  return data;
}

try {
  for (const [variant, market] of [['normal', 9876.54], ['reverseHolofoil', 1234.56]]) {
    const price = await prisma.cardPrice.create({ data: { cardId: 'base1-1', variant, market, provider: 'tcgcsv', source: 'tcgplayer', currency: 'USD' } });
    priceIds.push(price.id);
  }
  const prices = await request('/cards/base1-1/prices');
  assert.ok(prices.prices.some((price) => price.variant === 'normal' && price.market === 9876.54), 'La API no está conectada al fixture aislado');
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const auth = await request('/auth/register', 'POST', { email: `qanmv${suffix}@example.invalid`, username: `qanmv${suffix}`, displayName: 'QA variantes NM', password: `Qa-${randomUUID()}-9x` });
  token = auth.accessToken;
  userId = auth.user.id;
  const collection = await request('/collections', 'POST', { name: 'QA variantes NM' });
  collectionId = collection.id;
  const key = randomUUID();
  const original = { cardId: 'base1-1', variant: 'normal', condition: 'HP', quantity: 2 };
  const added = await request(`/collections/${collectionId}/items`, 'POST', original, key);
  assert.equal(added.condition, 'NM');
  assert.equal(added.price.market, 9876.54);
  const updated = await request(`/items/${added.id}`, 'PATCH', { variant: 'reverseHolofoil', condition: 'DM', quantity: 3, notes: 'nota QA', isForTrade: true });
  assert.equal(updated.condition, 'NM');
  assert.equal(updated.price.market, 1234.56);
  assert.equal(updated.quantity, 3);
  const list = await request(`/collections/${collectionId}/items`);
  const stats = await request(`/collections/${collectionId}/stats`);
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].variant, 'reverseHolofoil');
  assert.equal(list.data[0].quantity, 3);
  assert.equal(list.data[0].notes, 'nota QA');
  assert.equal(list.data[0].isForTrade, true);
  assert.equal(stats.totalCards, 3);
  const replay = await request(`/collections/${collectionId}/items`, 'POST', original, key);
  assert.equal(replay.id, added.id);
  assert.equal(replay.quantity, 3);
  assert.equal(replay.condition, 'NM');
  const restored = await request(`/items/${added.id}`, 'PATCH', { variant: 'normal' });
  assert.equal(restored.price.market, 9876.54);
  console.log(JSON.stringify({ normalPrice: 9876.54, reversePrice: 1234.56, quantity: 3, condition: 'NM', listAndStatsRefreshed: true, notesAndTradePreserved: true, legacyReplayNoIncrement: true, restoredNormalPrice: true }));
} finally {
  try {
    if (collectionId && token) await request(`/collections/${collectionId}`, 'DELETE');
  } finally {
    try {
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.cardPrice.deleteMany({ where: { id: { in: priceIds } } });
    } finally {
      await prisma.$disconnect();
    }
  }
}
