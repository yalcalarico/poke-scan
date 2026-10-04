/** Prueba manual contra el stack local; no guarda cartas ni fotos. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
const base = 'http://localhost:3001/api';
const login = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Session-Request': '1' },
  body: JSON.stringify({
    email: process.env.SCANNER_SMOKE_EMAIL ?? 'test@test.com',
    password: process.env.SCANNER_SMOKE_PASSWORD ?? '12345678',
  }),
});
if (!login.ok)
  throw new Error(
    'Ingresá con un usuario de desarrollo válido mediante SCANNER_SMOKE_EMAIL/PASSWORD.',
  );
const { accessToken } = await login.json();
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${accessToken}`,
};
const entries = JSON.parse(
  await readFile(resolve('../docs/evaluations/manifest.json'), 'utf8'),
);
const results = [];
for (const entry of entries) {
  const bytes = await sharp(await readFile(entry.path))
    .rotate()
    .jpeg({ quality: 92 })
    .toBuffer();
  const start = performance.now();
  const response = await fetch(`${base}/cards/identify-visual`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      image: 'data:image/jpeg;base64,' + bytes.toString('base64'),
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  results.push({
    cardId: entry.cardId,
    bytes: bytes.length,
    rank: result.candidates.findIndex((c) => c.card.id === entry.cardId) + 1,
    httpMs: performance.now() - start,
    ...result,
    candidates: result.candidates.map((c) => ({
      id: c.card.id,
      name: c.card.name,
      number: c.card.number,
      set: c.card.set.name,
      similarity: c.similarity,
    })),
  });
}
const errors = [];
for (const image of [
  'data:image/svg+xml;base64,YQ==',
  'data:image/png;base64,YQ==',
  'data:image/png;base64,',
]) {
  const response = await fetch(`${base}/cards/identify-visual`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ image }),
  });
  errors.push({ image, status: response.status, body: await response.json() });
  if (response.status !== 400)
    throw new Error('Se esperaba 400 para foto inválida.');
}
const unauthorized = await fetch(`${base}/cards/identify-visual`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image: 'data:image/png;base64,YQ==' }),
});
if (unauthorized.status !== 401) throw new Error('Se esperaba 401 sin sesión.');
const report = {
  at: new Date().toISOString(),
  references: results[0]?.references ?? 0,
  productionReady: false,
  results,
  errors,
  unauthorized: unauthorized.status,
};
await writeFile(
  '../docs/evaluations/visual-screen-2026-10-02.json',
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    top1: results.filter((r) => r.rank === 1).length,
    ranks: results.map((r) => r.rank),
    times: results.map((r) => ({
      cold: r.cold,
      totalMs: r.totalMs,
      httpMs: r.httpMs,
    })),
    errors: errors.map((e) => e.status),
    unauthorized: unauthorized.status,
  }),
);
