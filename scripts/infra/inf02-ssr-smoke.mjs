#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { httpsRequest } from './inf02-https.mjs';

const origin = process.env.PUBLIC_ORIGIN;
const caPath = process.env.INF02_CA_FILE;
const artifact = process.env.ARTIFACT_DIR;
const slug = process.env.FIXTURE_SLUG;
if (!origin || !caPath || !artifact || !slug) throw new Error('Faltan variables de smoke SSR.');
const manifest = JSON.parse(await readFile(join(artifact, 'manifest.json'), 'utf8'));
const indexFile = manifest.index.files.find((file) => file.path.endsWith('.jsonl'));
if (!indexFile) throw new Error('El manifiesto no tiene una referencia para SSR.');
const folder = indexFile.path.split('/').slice(1, -1).join('/');
const jsonl = await readFile(join(artifact, 'index', folder, indexFile.path.split('/').at(-1)), 'utf8');
const cardId = JSON.parse(jsonl.split('\n').find(Boolean)).id;
const ca = await readFile(caPath);
function get(path) {
  return httpsRequest(new URL(path, origin), { ca }).then((response) => ({ ...response, html: response.body }));
}
const share = await get(`/share/${encodeURIComponent(slug)}`);
const card = await get(`/carta/${encodeURIComponent(cardId)}`);
const hasPrivateHost = (html) => /backend:3001|127\.0\.0\.1:1\/api/.test(html);
if (share.status !== 200 || !share.html.includes('Binder INF02') || !share.html.includes('Pokémon de prueba INF02') || hasPrivateHost(share.html)) throw new Error(`SSR share fixture inválido: HTTP ${share.status}.`);
if (card.status !== 200 || !card.html.includes('Pokémon de prueba INF02') || hasPrivateHost(card.html)) throw new Error(`SSR carta fixture inválido: HTTP ${card.status}.`);
const robots = share.html.match(/<meta[^>]+name="robots"[^>]+content="([^"]+)"/i)?.[1] ?? '';
if (!robots.includes('noindex')) throw new Error('SSR share no emitió noindex.');
console.log(JSON.stringify({ share: share.status, card: card.status, shareNoindex: true, privateHostnameLeaked: false, cardId }));
