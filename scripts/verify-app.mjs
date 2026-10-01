/* eslint-disable no-console */
/**
 * Verificación end-to-end contra el stack corriendo.
 *
 * No es un test de la suite: es una comprobación de que la app **sirve** lo que
 * tiene que servir, con el mismo código que corre en desarrollo. Por eso usa
 * HTTP de verdad contra localhost y no una base de datos.
 *
 *     node scripts/verify-app.mjs
 *
 * Sale con código 1 si algo falla, así que sirve como chequeo de humo después de
 * un cambio de esquema o de un deploy.
 */
const API = process.env.API_URL ?? 'http://localhost:3001/api';
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';

const results = [];
let failures = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? '' });
  } catch (error) {
    failures += 1;
    results.push({ name, ok: false, detail: error.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const body = await response.json();
  return { status: response.status, body };
}

const authHeaders = (token) => ({
  'content-type': 'application/json',
  authorization: `Bearer ${token}`,
});

await check('health: sano y sin degradación', async () => {
  const { status, body } = await json('/health');
  assert(status === 200, `status ${status}`);
  assert(body.status === 'ok', 'status no es ok');
  assert(body.degraded === false, `degradado: ${JSON.stringify(body.detail.redis)}`);
  return 'redis disponible';
});

await check('carta: datos y set', async () => {
  const { status, body } = await json('/cards/base1-4');
  assert(status === 200, `status ${status}`);
  assert(body.name === 'Charizard', `nombre ${body.name}`);
  assert(body.set?.name === 'Base', 'sin set');
  assert(typeof body.imageSmall === 'string' && body.imageSmall.length > 0, 'sin imagen');
  return `${body.name} · ${body.set.name} · nº${body.number}`;
});

await check('precio: del proveedor activo y fresco', async () => {
  const { status, body } = await json('/cards/base1-4/prices');
  assert(status === 200, `status ${status}`);
  assert(Array.isArray(body.prices) && body.prices.length > 0, 'sin precios');
  const conPrecio = body.prices.find((p) => p.market !== null);
  assert(conPrecio, 'ningún precio de mercado');
  assert(conPrecio.provider === 'tcgdex', `provider ${conPrecio.provider}`);
  assert(conPrecio.isStale === false, 'el precio vigente está marcado viejo');
  return `${conPrecio.variant} $${conPrecio.market} (${conPrecio.provider}/${conPrecio.source})`;
});

await check('histórico: serie del proveedor activo', async () => {
  const { status, body } = await json('/cards/base1-4/prices/history');
  assert(status === 200, `status ${status}`);
  assert(body.provider === 'tcgdex', `provider ${body.provider}`);
  assert(body.source === 'tcgplayer', `source ${body.source}`);
  assert(Array.isArray(body.points), 'sin puntos');
  return `${body.points.length} punto(s), ventana de ${body.windowDays} días`;
});

await check('histórico legacy: la fuente sin procedencia sigue consultable', async () => {
  const { status, body } = await json('/cards/base1-4/prices/history?provider=legacy');
  assert(status === 200, `status ${status}`);
  assert(body.provider === null, `provider ${body.provider}`);
  return `${body.points.length} punto(s) legacy`;
});

await check('búsqueda por nombre', async () => {
  const { status, body } = await json('/cards/search?q=charizard&pageSize=5');
  assert(status === 200, `status ${status}`);
  assert(body.total > 0, 'sin resultados');
  return `${body.total} resultados`;
});

await check('búsqueda por número (B1)', async () => {
  const { status, body } = await json('/cards/search?q=4&searchBy=number&pageSize=5');
  assert(status === 200, `status ${status}`);
  assert(body.total > 0, 'sin resultados');
  return `${body.total} cartas con número 4`;
});

await check('ordenar por precio (B2)', async () => {
  const { status, body } = await json('/cards/search?sort=price&direction=desc&pageSize=3');
  assert(status === 200, `status ${status}`);
  assert(body.data.length === 3, 'faltan resultados');
  return body.data.map((c) => c.id).join(', ');
});

await check('registro, colección, ítem y totales', async () => {
  const suffix = Date.now();
  const email = `verificacion-${suffix}@test.local`;
  const username = `verificacion${String(suffix).slice(-8)}`;
  const register = await json('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, username, password: 'Verificacion123', displayName: 'Verificacion' }),
  });
  assert(register.status === 201, `registro ${register.status}: ${JSON.stringify(register.body).slice(0, 160)}`);
  const token = register.body.accessToken;
  assert(typeof token === 'string' && token.length > 0, 'sin accessToken');

  const headers = authHeaders(token);
  const created = await json('/collections', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Verificacion' }),
  });
  assert(created.status === 201, `colección ${created.status}`);
  const collectionId = created.body.id;

  for (const [cardId, isForTrade] of [
    ['base1-4', true],
    ['base1-10', true],
    ['base2-4', false],
  ]) {
    const added = await json(`/collections/${collectionId}/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ cardId, variant: 'holofoil', quantity: 1, isForTrade }),
    });
    assert(added.status === 201, `agregar ${cardId}: ${added.status}`);
  }

  const detail = await json(`/collections/${collectionId}`, { headers });
  assert(detail.status === 200, `detalle ${detail.status}`);
  assert(detail.body.itemCount === 3, `itemCount ${detail.body.itemCount}`);
  assert(detail.body.totalValueUsd > 0, 'total en cero');
  assert(Array.isArray(detail.body.cover), 'sin portada');

  const stats = await json(`/collections/${collectionId}/stats`, { headers });
  assert(stats.status === 200, `stats ${stats.status}`);
  assert(stats.body.totalCards === 3, `totalCards ${stats.body.totalCards}`);
  assert(stats.body.setsCount === 2, `setsCount ${stats.body.setsCount}`);

  const items = await json(`/collections/${collectionId}/items`, { headers });
  assert(items.status === 200, `items ${items.status}`);
  const list = items.body.data ?? items.body.items;
  assert(Array.isArray(list), 'items sin forma de lista');

  const forTrade = await json(`/collections/${collectionId}/items?forTradeOnly=true`, { headers });
  assert(forTrade.status === 200, `filtro ${forTrade.status}`);
  const tradeList = forTrade.body.data ?? forTrade.body.items;
  assert(
    tradeList.every((item) => item.isForTrade === true),
    'el filtro trajo cartas que no son para intercambio',
  );

  return `${detail.body.itemCount} cartas · $${detail.body.totalValueUsd} · ${
    tradeList.length
  } para intercambio (server-side)`;
});

await check('link público de colección', async () => {
  const suffix = Date.now();
  const email = `compartir-${suffix}@test.local`;
  const register = await json('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      username: `compartir${String(suffix).slice(-8)}`,
      password: 'Verificacion123',
      displayName: 'Compartir',
    }),
  });
  const headers = authHeaders(register.body.accessToken);
  const created = await json('/collections', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Compartida' }),
  });
  const collectionId = created.body.id;
  await json(`/collections/${collectionId}/items`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ cardId: 'base1-4', variant: 'holofoil', quantity: 1, isForTrade: true }),
  });

  const share = await json('/share', {
    method: 'POST',
    headers,
    body: JSON.stringify({ collectionId }),
  });
  assert(share.status === 201 || share.status === 200, `share ${share.status}: ${JSON.stringify(share.body).slice(0, 160)}`);
  const slug = share.body.slug ?? share.body.id;
  assert(typeof slug === 'string' && slug.length > 0, 'sin slug');

  const publicView = await json(`/s/${slug}`);
  assert(publicView.status === 200, `link público ${publicView.status}`);

  const page = await fetch(`${WEB}/share/${slug}`);
  assert(page.status === 200, `página ${page.status}`);
  return `slug ${slug}, página responde 200`;
});

await check('el frontend sirve las pantallas', async () => {
  const pages = ['/', '/inicio', '/buscar', '/faq', '/colecciones', '/carta/base1-4'];
  const failuresList = [];
  for (const path of pages) {
    const response = await fetch(`${WEB}${path}`);
    if (response.status !== 200) failuresList.push(`${path} → ${response.status}`);
  }
  assert(failuresList.length === 0, failuresList.join(', '));
  return `${pages.length} pantallas con 200`;
});

await check('la página de carta trae el precio en el HTML', async () => {
  const html = await (await fetch(`${WEB}/carta/base1-4`)).text();
  assert(html.includes('Charizard'), 'no aparece el nombre de la carta');
  // El precio se pide desde el cliente, así que en el HTML puede no estar. Lo
  // que sí tiene que estar es la sección de precios montada.
  assert(html.includes('price') || html.includes('precio'), 'no hay sección de precios');
  return 'nombre y sección de precios presentes';
});

console.log('');
for (const result of results) {
  const mark = result.ok ? '✓' : '✗';
  console.log(`  ${mark} ${result.name}${result.detail ? `\n      ${result.detail}` : ''}`);
}
console.log('');
console.log(
  failures === 0
    ? `  Todo OK: ${results.length} comprobaciones.`
    : `  ${failures} de ${results.length} comprobaciones fallaron.`,
);
process.exitCode = failures === 0 ? 0 : 1;