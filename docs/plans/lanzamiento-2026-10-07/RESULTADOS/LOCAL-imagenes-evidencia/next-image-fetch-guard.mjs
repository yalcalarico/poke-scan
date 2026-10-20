const original = globalThis.fetch;
const local = new Set(['localhost', '127.0.0.1', '[::1]']);
export function allowsImageFetch(input, init) {
  const request = input instanceof Request ? input : null;
  const url = new URL(request ? request.url : String(input));
  if (local.has(url.hostname)) return true;
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers ?? request?.headers);
  if (method !== 'GET' || headers.has('authorization') || headers.has('cookie') ||
      url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash) return false;
  return url.hostname === 'images.pokemontcg.io' || url.hostname === 'images.scrydex.com' ||
    (url.hostname === 'static.tcgcollector.com' && url.pathname.startsWith('/content/images/')) ||
    (url.hostname === 'www.serebii.net' && url.pathname === '/card/xypromos/68.jpg');
}
globalThis.fetch = (input, init) => {
  if (!allowsImageFetch(input, init)) return Promise.reject(new Error('Proveedor externo bloqueado; sólo imágenes públicas del catálogo habilitadas en Next'));
  const url = new URL(input instanceof Request ? input.url : String(input));
  return original(input, local.has(url.hostname) ? init : { ...init, redirect: 'manual' });
};
