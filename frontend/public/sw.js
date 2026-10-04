/**
 * Service worker de PokéScan (fase 6, tarea 6.2).
 *
 * Sin librerías, a mano. Estrategias:
 *  - navegaciones      -> NetworkFirst con fallback al shell cacheado
 *  - imagenes de carta -> CacheFirst con limite de ~150 entradas
 *  - /api/             -> NetworkFirst, nunca se cachean requests autenticadas
 *
 * Bump de VERSION para forzar el renuevo del cache en el siguiente activate.
 */

const VERSION = 'v4';
const SHELL_CACHE = `pokescan-shell-${VERSION}`;
const IMAGE_CACHE = `pokescan-images-${VERSION}`;
const API_CACHE = `pokescan-api-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, IMAGE_CACHE, API_CACHE];

/** El shell minimo que hace falta para arrancar la app sin red. */
const SHELL_ASSETS = [
  '/',
  '/inicio',
  '/buscar',
  '/login',
  '/registro',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/favicon.ico',
];

/** Imagenes remotas de cartas. */
const IMAGE_HOSTS = ['images.pokemontcg.io', 'images.scrydex.com'];


const IMAGE_CACHE_LIMIT = 150;

/** Rutas de API que si conviene tener offline (datos publicos, sin token). */
const API_CACHEABLE = [/\/api\/cards(\/|$)/, /\/api\/sets(\/|$)/, /\/api\/search/];

/* -------------------------------------------------------------------------- */
/* install                                                                    */
/* -------------------------------------------------------------------------- */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Uno por uno: un 404 en un asset no debe abortar todo el precache.
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok || response.type === 'opaque') {
              await cache.put(url, response);
            }
          } catch {
            /* offline durante el install: se reintenta en runtime */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

/* -------------------------------------------------------------------------- */
/* activate                                                                   */
/* -------------------------------------------------------------------------- */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('pokescan-') && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* -------------------------------------------------------------------------- */
/* strategies                                                                 */
/* -------------------------------------------------------------------------- */

function isImageRequest(url) {
  if (IMAGE_HOSTS.includes(url.hostname)) return true;
  return url.pathname.startsWith('/_next/image');
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

/** Las respuestas Flight de Next son estado de navegación, no assets reusables. */
function isNextRscRequest(request, url) {
  return (
    url.searchParams.has('_rsc') ||
    request.headers.get('RSC') === '1' ||
    request.headers.get('Accept')?.includes('text/x-component') === true
  );
}

/** Nunca cachear requests autenticadas: la respuesta depende del token. */
function isAuthenticated(request) {
  if (request.headers.has('Authorization')) return true;
  const cookie = request.headers.get('Cookie') || '';
  return /(?:^|;\s*)(?:access_token|refresh_token|token|session)=/i.test(cookie);
}

async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  // `cache.keys()` devuelve en orden de insercion: lo primero es lo viejo.
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const shell =
      (await caches.match('/buscar')) ||
      (await caches.match('/')) ||
      (await caches.match('/registro'));
    if (shell) return shell;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Sin conexion</title>' +
        '<body style="background:#020617;color:#f8fafc;font-family:system-ui;padding:2rem">' +
        '<h1>Sin conexion</h1><p>Volve a conectarte para sincronizar. ' +
        '<a style="color:#38bdf8" href="/buscar">Ir a Buscar</a></p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

async function cacheFirst(request, cacheName, { limit = 0, cacheable = () => true } = {}) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && cacheable(response)) {
    await cache.put(request, response.clone());
    if (limit > 0) await trimCache(cacheName, limit);
  }
  return response;
}

async function networkFirstApi(request) {
  const cacheable =
    !isAuthenticated(request) &&
    API_CACHEABLE.some((pattern) => pattern.test(new URL(request.url).pathname));
  try {
    const response = await fetch(request);
    if (response.ok && cacheable) {
      const cache = await caches.open(API_CACHE);
      await cache.put(request, response.clone());
      await trimCache(API_CACHE, 50);
    }
    return response;
  } catch (err) {
    if (cacheable) {
      const cached = await caches.match(request);
      if (cached) return cached;
    }
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* fetch                                                                      */
/* -------------------------------------------------------------------------- */

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Solo nos interesan el mismo origen y los hosts de imagenes de cartas.
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !IMAGE_HOSTS.includes(url.hostname)) return;

  // Un stream Flight cacheado puede ser el fallback de Suspense de una
  // navegación anterior. No se cachea ni reproduce; el bump de VERSION purga
  // además las entradas `_rsc` viejas de las instalaciones existentes.
  if (sameOrigin && isNextRscRequest(request, url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isImageRequest(url)) {
    event.respondWith(
      cacheFirst(request, IMAGE_CACHE, { limit: IMAGE_CACHE_LIMIT }).catch(
        () => Response.error(),
      ),
    );
    return;
  }


  if (sameOrigin && isApiRequest(url)) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  // Solo los chunks hasheados e inmutables de Next usan cache-first acá. Los
  // requests dinámicos same-origin (incluidas respuestas App Router) van a red.
  if (sameOrigin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      cacheFirst(request, SHELL_CACHE).catch(() => fetch(request)),
    );
  }
});
