#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { httpsRequest } from './inf02-https.mjs';
import sharp from '../../backend/node_modules/sharp/dist/index.mjs';

const origin = process.env.PUBLIC_ORIGIN;
const caPath = process.env.INF02_CA_FILE;
if (!origin || !caPath || new URL(origin).protocol !== 'https:') throw new Error('Se requieren PUBLIC_ORIGIN HTTPS e INF02_CA_FILE.');
const ca = await readFile(caPath);
function request(path, { method = 'GET', body, headers = {} } = {}) {
  return httpsRequest(new URL(path, origin), { method, ca, headers: { Accept: 'application/json', ...headers } }, body, path.endsWith('identify-visual') ? 60_000 : 15_000);
}
function cookieFrom(response) {
  const line = response.headers['set-cookie']?.find((value) => value.startsWith('pcs.refreshToken='));
  if (!line) throw new Error('Falta cookie de refresh.');
  const [pair, ...attributes] = line.split(';').map((part) => part.trim());
  const [name, ...parts] = pair.split('=');
  const value = parts.join('=');
  const normalized = attributes.map((attribute) => attribute.toLowerCase());
  if (name !== 'pcs.refreshToken' || !normalized.includes('secure') || !normalized.includes('httponly') || !normalized.some((attribute) => attribute === 'samesite=lax') || !normalized.some((attribute) => attribute === 'path=/api/auth') || normalized.some((attribute) => attribute.startsWith('domain='))) throw new Error('Atributos de cookie fuera del contrato.');
  return { value, attributes: ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/api/auth', 'host-only'] };
}
const suffix = randomBytes(8).toString('hex');
const email = `inf02-${suffix}@example.test`;
const username = `inf02_${suffix.slice(0, 10)}`;
const password = randomBytes(24).toString('base64url');
const headers = { Origin: origin, 'X-Session-Request': '1', 'Content-Type': 'application/json' };
const registered = await request('/api/auth/register', { method: 'POST', headers, body: JSON.stringify({ email, username, displayName: 'Fixture INF02', password }) });
if (registered.status !== 201) throw new Error(`Registro fixture falló: HTTP ${registered.status}.`);
const session = JSON.parse(registered.body);
if (typeof session.accessToken !== 'string' || !session.accessToken) throw new Error('La respuesta de sesión no incluyó access token.');
const firstCookie = cookieFrom(registered);
const refreshed = await request('/api/auth/refresh', { method: 'POST', headers: { ...headers, Cookie: `pcs.refreshToken=${firstCookie.value}` }, body: '{}' });
if (refreshed.status !== 200) throw new Error(`Refresh falló: HTTP ${refreshed.status}.`);
const secondCookie = cookieFrom(refreshed);
if (firstCookie.value === secondCookie.value) throw new Error('El refresh token no rotó.');
const refreshedSession = JSON.parse(refreshed.body);
if (typeof refreshedSession.accessToken !== 'string') throw new Error('Refresh no emitió access token.');
const syntheticPng = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 240, g: 200, b: 20 } } }).png().toBuffer();
const image = `data:image/png;base64,${syntheticPng.toString('base64')}`;
const scanner = await request('/api/cards/identify-visual', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) });
if (scanner.status !== 401) throw new Error(`Identify sin Bearer debía responder 401 y respondió ${scanner.status}.`);
const expectedCardId = process.env.EXPECTED_CARD_ID;
if (expectedCardId) {
  const identified = await request('/api/cards/identify-visual', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: `Bearer ${refreshedSession.accessToken}` }, body: JSON.stringify({ image }) });
  if (identified.status !== 200) {
    throw new Error(`Identify autenticado falló: HTTP ${identified.status}.`);
  }
  const result = JSON.parse(identified.body);
  if (result.references !== 1 || result.candidates?.[0]?.card?.id !== expectedCardId) throw new Error(`Identify no devolvió la única referencia fixture (references=${result.references}, candidate=${result.candidates?.[0]?.card?.id ?? 'none'}).`);
  console.log(JSON.stringify({ register: registered.status, refresh: refreshed.status, refreshRotated: true, cookieAttributes: firstCookie.attributes, scannerWithoutBearer: scanner.status, scannerCookieSent: false, scannerWithBearer: identified.status, references: result.references, candidateMatched: true, accuracyClaimed: false }));
} else {
  console.log(JSON.stringify({ register: registered.status, refresh: refreshed.status, refreshRotated: true, cookieAttributes: firstCookie.attributes, scannerWithoutBearer: scanner.status, scannerCookieSent: false }));
}
