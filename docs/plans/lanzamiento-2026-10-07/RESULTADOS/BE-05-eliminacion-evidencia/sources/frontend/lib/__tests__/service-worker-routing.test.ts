import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: Record<string, unknown>) => void;
type CacheLike = {
  keys: () => Promise<Request[]>;
  delete: (request: Request) => Promise<boolean>;
  match: (request: Request | string) => Promise<Response | undefined>;
  put: (request: Request | string, response: Response) => Promise<void>;
};

function loadWorker(initial = new Map<string, Map<string, Response>>()) {
  const listeners = new Map<string, Handler>();
  const cacheObjects = new Map<string, CacheLike>();
  const cacheStorage = {
    keys: async () => [...initial.keys()],
    open: async (name: string): Promise<CacheLike> => {
      if (!initial.has(name)) initial.set(name, new Map());
      if (!cacheObjects.has(name)) {
        const entries = initial.get(name)!;
        cacheObjects.set(name, {
          keys: async () => [...entries.keys()].map((url) => new Request(url)),
          delete: async (request) => entries.delete(typeof request === 'string' ? new URL(request, 'http://localhost:3000').href : request.url),
          match: async (request) => entries.get(typeof request === 'string' ? new URL(request, 'http://localhost:3000').href : request.url),
          put: async (request, response) => { entries.set(typeof request === 'string' ? new URL(request, 'http://localhost:3000').href : request.url, response); },
        });
      }
      return cacheObjects.get(name)!;
    },
    delete: async (name: string) => initial.delete(name),
    match: async (request: Request | string) => {
      const url = typeof request === 'string' ? new URL(request, 'http://localhost:3000').href : request.url;
      for (const entries of initial.values()) if (entries.has(url)) return entries.get(url);
      return undefined;
    },
  };
  const self = {
    location: { origin: 'http://localhost:3000' },
    registration: { navigationPreload: null },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener: (name: string, handler: Handler) => listeners.set(name, handler),
  };
  const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
  runInNewContext(source, { self, URL, Request, Response, fetch, caches: cacheStorage });
  const version = /const VERSION = '([^']+)'/.exec(source)?.[1];
  if (!version) throw new Error('Falta versión del SW');
  return { listeners, caches: cacheStorage, initial, version };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('Service Worker routing', () => {
  it('no guarda ni reproduce la confirmación de eliminación, ni purga cachés ajenas', async () => {
    const network = vi.fn().mockResolvedValue(new Response('live deletion'));
    vi.stubGlobal('fetch', network);
    const currentVersion = loadWorker().version;
    const key = 'http://localhost:3000/eliminar-cuenta';
    const { listeners, initial } = loadWorker(new Map([
      [`pokescan-shell-${currentVersion}`, new Map([[key, new Response('old deletion')]])],
      ['cache-ajena', new Map([[key, new Response('other service')]])],
    ]));
    let activation: Promise<unknown> | undefined;
    listeners.get('activate')!({ waitUntil: (promise: Promise<unknown>) => { activation = promise; } });
    await activation;
    expect(initial.get(`pokescan-shell-${currentVersion}`)!.has(key)).toBe(false);
    expect(initial.get('cache-ajena')!.has(key)).toBe(true);
    let response: Promise<Response> | undefined;
    const request = { url: key, method: 'GET', mode: 'navigate', headers: new Headers() };
    listeners.get('fetch')!({ request, respondWith: (promise: Promise<Response>) => { response = promise; } });
    expect(await (await response!).text()).toBe('live deletion');
    expect(initial.get(`pokescan-shell-${currentVersion}`)!.has(key)).toBe(false);
    network.mockRejectedValueOnce(new Error('synthetic offline'));
    listeners.get('fetch')!({ request, respondWith: (promise: Promise<Response>) => { response = promise; } });
    await expect(response).rejects.toThrow('synthetic offline');
  });

  it('deja respuestas RSC y rutas dinamicas same-origin en la red', () => {
    const { listeners } = loadWorker();
    const handleFetch = listeners.get('fetch');
    if (!handleFetch) throw new Error('El Service Worker no registró fetch');

    for (const request of [
      new Request('http://localhost:3000/buscar?direction=desc&_rsc=abc', { headers: { RSC: '1', Accept: 'text/x-component' } }),
      new Request('http://localhost:3000/buscar?sort=price&direction=desc'),
    ]) {
      let intercepted = false;
      handleFetch({ request, respondWith: () => { intercepted = true; } });
      expect(intercepted).toBe(false);
    }
  });

  it('no intercepta shares online ni offline y purga copias legacy al activar', async () => {
    const { version } = loadWorker();
    const warmed = new Map<string, Response>([
      ['http://localhost:3000/share/old-slug', new Response('privado')],
      ['http://localhost:3000/buscar', new Response('shell')],
      ['http://localhost:3000/recuperar', new Response('credential page')],
    ]);
    const { listeners, initial } = loadWorker(new Map([
      [`pokescan-shell-${version}`, warmed],
      [`pokescan-images-${version}`, new Map([['http://localhost:3000/share/otro-slug', new Response('privado')]])],
      ['pokescan-shell-v4', new Map([['http://localhost:3000/recuperar', new Response('legacy recovery')]])],
      ['cache-ajena', new Map([['http://localhost:3000/share/ajeno', new Response('de otro servicio')]])],
    ]));
    const activate = listeners.get('activate');
    if (!activate) throw new Error('El Service Worker no registró activate');
    let activation: Promise<unknown> | undefined;
    activate({ waitUntil: (promise: Promise<unknown>) => { activation = promise; } });
    await activation;

    expect([...initial.get(`pokescan-shell-${version}`)!.keys()]).toEqual(['http://localhost:3000/buscar']);
    expect(initial.has('pokescan-shell-v4')).toBe(false);
    expect(initial.get(`pokescan-images-${version}`)!.size).toBe(0);
    expect(initial.get('cache-ajena')!.size).toBe(1);

    const handleFetch = listeners.get('fetch');
    if (!handleFetch) throw new Error('El Service Worker no registró fetch');
    for (const url of ['http://localhost:3000/share/old-slug', 'http://localhost:3000/share/new-slug', 'http://localhost:3000/share/new-slug?_rsc=payload']) {
      let intercepted = false;
      const request = { url, method: 'GET', mode: 'navigate', headers: new Headers() };
      handleFetch({ request, respondWith: () => { intercepted = true; } });
      expect(intercepted).toBe(false);
    }
  });
});
