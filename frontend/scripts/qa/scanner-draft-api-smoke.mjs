import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, '../..');
const frontendRequire = createRequire(realpathSync(resolve(frontendDirectory, 'node_modules/vitest/package.json')));
const { createServer } = frontendRequire('vite');
// Arrancá la API con DB *_test y Redis/índice aislado de QA; este runner no vacía Redis.
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
process.env.NEXT_PUBLIC_API_URL = apiBaseUrl;

const storage = new Map();
globalThis.sessionStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); },
};

const vite = await createServer({
  root: frontendDirectory,
  configFile: resolve(frontendDirectory, 'vitest.config.ts'),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

let registered = false;
let collection = null;
let originalFetch = globalThis.fetch;
let userId = null;
let clearTokens = null;

try {
  const auth = await vite.ssrLoadModule('/lib/api/auth.ts');
  const collections = await vite.ssrLoadModule('/lib/api/collections.ts');
  const cardsApi = await vite.ssrLoadModule('/lib/api/cards.ts');
  const draftApi = await vite.ssrLoadModule('/components/scanner/session-draft.ts');
  const tokenStorage = await vite.ssrLoadModule('/lib/api/token-storage.ts');
  clearTokens = tokenStorage.clearTokens;

  const health = await fetch(`${apiBaseUrl}/health`);
  assert.equal(health.status, 200, 'La API local debe responder health=200');

  const pricedCard = await cardsApi.getCard('base1-1');
  const pricedResult = await cardsApi.getCardPrices(pricedCard.id);
  const fixturePrice = pricedResult.prices.find((price) =>
    price.cardId === pricedCard.id && price.variant === 'normal' && price.provider === 'tcgcsv'
      && price.source === 'tcgplayer' && price.currency === 'USD' && price.market === 9876.54,
  );
  assert.ok(fixturePrice, 'La API debe leer el fixture TCGCSV centinela de la base *_test aislada');

  const pendingCard = await cardsApi.getCard('base1-10');
  const pendingResult = await cardsApi.getCardPrices(pendingCard.id);
  assert.equal(pendingResult.prices.length, 0, 'La carta de control debe carecer de precio local');

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const email = `qa-${suffix}@example.invalid`;
  const username = `qa${suffix}`;
  const password = `Qa-${randomUUID()}-9x`;
  const authResult = await auth.register({ email, username, displayName: `QA ${suffix}`, password });
  registered = true;
  userId = authResult.user.id;
  collection = await collections.createCollection({ name: `QA scan ${suffix}` });

  const makeEntry = (card, prices, runId) => ({
    runId,
    candidate: {
      card,
      score: 1,
      rawScore: 1,
      price: prices[0] ?? null,
      prices,
    },
  });
  const entries = Array.from({ length: 1002 }, (_, index) => makeEntry(pricedCard, pricedResult.prices, index + 1));
  entries.push(makeEntry(pendingCard, [], 1003));

  let draft = draftApi.createSessionDraft(entries);
  draft = {
    ...draft,
    ownerUserId: userId,
    selectedCollectionId: collection.id,
    destinationConfirmed: true,
  };
  assert.equal(draft.allocations.length, 1003);
  assert.equal(draft.allocations.at(-1).variant, null, 'La entrada sin precio queda sin variante');
  assert.equal(draftApi.writeSessionDraft(draft), true, 'El borrador inicial se debe persistir');

  const groups = draftApi.readyAllocationGroups(draft);
  assert.deepEqual(groups.map((group) => group.reduce((sum, allocation) => sum + allocation.quantity, 0)), [999, 3]);
  assert.equal(groups.flat().length, 1002);

  const itemPath = `/collections/${encodeURIComponent(collection.id)}/items`;
  const capturedRequests = [];
  let loseNextAcknowledgement = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const body = typeof init?.body === 'string' ? init.body : '';
    if (url.includes(itemPath) && init?.method === 'POST') {
      const request = { key: headers.get('Idempotency-Key'), body: JSON.parse(body) };
      capturedRequests.push(request);
      const response = await originalFetch(input, init);
      if (loseNextAcknowledgement) {
        loseNextAcknowledgement = false;
        assert.ok(response.status >= 200 && response.status < 300, 'El backend debe haber aplicado el segundo delta');
        throw new TypeError('Respuesta de red perdida después del commit (simulada)');
      }
      return response;
    }
    return originalFetch(input, init);
  };

  let lostAcknowledgement = false;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const operation = {
      id: randomUUID(),
      userId,
      collectionId: collection.id,
      payload: {
        cardId: group[0].cardId,
        variant: group[0].variant,
        condition: group[0].condition,
        quantity: group.reduce((sum, allocation) => sum + allocation.quantity, 0),
      },
      allocationIds: group.map((allocation) => allocation.id),
      status: 'saving',
    };
    draft = { ...draft, operations: [...draft.operations, operation] };
    assert.equal(draftApi.writeSessionDraft(draft), true, 'La operación se persiste antes del POST');

    if (index === 1) loseNextAcknowledgement = true;
    try {
      await collections.addItem(collection.id, operation.payload, operation.id);
      assert.equal(index, 0, 'El segundo POST debía simular una respuesta perdida');
    } catch {
      assert.equal(index, 1, 'Sólo se esperaba incertidumbre en el segundo incremento');
      lostAcknowledgement = true;
      draft = draftApi.settleDraftOperation(draft, operation.id, 'uncertain', 'Respuesta perdida simulada');
      assert.equal(draftApi.writeSessionDraft(draft), true);

      const restored = draftApi.readSessionDraft([]);
      assert.ok(restored, 'El borrador con operación incierta debe restaurarse');
      const replay = restored.operations.find((item) => item.id === operation.id);
      assert.ok(replay);
      assert.equal(replay.status, 'uncertain');
      assert.deepEqual(replay.payload, operation.payload);
      assert.deepEqual(replay.allocationIds, operation.allocationIds);

      const replayResult = await collections.addItem(collection.id, replay.payload, replay.id);
      assert.equal(replayResult.quantity, 1002, 'El replay debe devolver el total actual, sin sumar dos veces');
      draft = draftApi.settleDraftOperation(restored, replay.id, 'confirmed');
      assert.equal(draftApi.writeSessionDraft(draft), true);
    }

    if (index === 0) {
      draft = draftApi.settleDraftOperation(draft, operation.id, 'confirmed');
      assert.equal(draftApi.writeSessionDraft(draft), true);
    }
  }

  assert.equal(lostAcknowledgement, true);
  assert.equal(capturedRequests.length, 3, '999 se envía una vez; 3 se envía y se verifica con replay');
  assert.ok(capturedRequests.every((request) => request.key));
  assert.equal(capturedRequests[1].key, capturedRequests[2].key, 'El replay conserva la misma clave idempotente');
  assert.deepEqual(capturedRequests[1].body, capturedRequests[2].body, 'El replay conserva el payload exacto');
  assert.equal(capturedRequests[0].body.quantity, 999);
  assert.equal(capturedRequests[1].body.quantity, 3);

  const items = await collections.listItems(collection.id, { page: 1, pageSize: 10 });
  assert.equal(items.data.length, 1);
  assert.equal(items.data[0].quantity, 1002, 'La colección debe mostrar 1002 copias de una fila');
  assert.equal(draft.allocations.length, 1, 'Las 1002 allocations confirmadas se retiran');
  assert.equal(draft.allocations[0].runId, 1003, 'La lectura pendiente sin precio se conserva');
  assert.equal(draft.allocations[0].variant, null);
  assert.deepEqual(draftApi.readyAllocationGroups(draft), [], 'La pendiente no se envía ni bloquea el resto');
  assert.equal(draftApi.writeSessionDraft(draft), true);
  const restoredFinal = draftApi.readSessionDraft([]);
  assert.equal(restoredFinal.allocations.length, 1);
  assert.equal(restoredFinal.allocations[0].runId, 1003);

  const dbResult = execFileSync('docker', [
    'exec', 'pokemon-scanner-db', 'psql', '-U', 'pokemon', '-d', 'pokemon_cards_qa_test', '-Atc',
    `SELECT 'item='||count(*)||'|'||COALESCE(sum(quantity),0)||'|'||COALESCE(min(quantity),0)||'|'||COALESCE(min(variant),'')||'|'||COALESCE(min(condition),'') FROM collection_items WHERE \"collectionId\"='${collection.id}'; ` +
      `SELECT 'idempotency-keys='||count(*) FROM collection_item_add_operations WHERE \"userId\"='${userId}';`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assert.ok(dbResult.includes('item=1|1002|1002|normal|NM'), 'Postgres debe tener una fila NM/normal con quantity=1002');
  assert.ok(dbResult.includes('idempotency-keys=2'), 'Postgres debe tener exactamente las dos claves aceptadas');

  console.log(JSON.stringify({
    result: 'passed',
    api: 'local 200',
    account: 'temporary QA account',
    catalogCards: 20670,
    fixture: 'isolated TCGCSV sentinel only',
    allocations: 1003,
    readyDeltas: [999, 3],
    collectionRows: items.data.length,
    collectionQuantity: items.data[0].quantity,
    database: dbResult.split('\n'),
    idempotentRequests: capturedRequests.length,
    replaySameKeyAndPayload: true,
    pendingUnpricedPreserved: true,
    draftStorage: 'pcs.scanDraft helper round-trip passed',
  }));
} finally {
  globalThis.fetch = originalFetch;
  if (collection && registered) {
    try { await (await vite.ssrLoadModule('/lib/api/collections.ts')).deleteCollection(collection.id); } catch {}
  }
  clearTokens?.();
  await vite.close();
}
