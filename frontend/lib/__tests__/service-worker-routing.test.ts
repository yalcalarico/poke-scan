import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

type FetchHandler = (event: {
  request: Request;
  respondWith: (response: Promise<Response>) => void;
}) => void;

function loadFetchHandler(): FetchHandler {
  const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
  const listeners = new Map<string, (event: never) => void>();
  const self = {
    location: { origin: 'http://localhost:3000' },
    addEventListener: (name: string, handler: (event: never) => void) => {
      listeners.set(name, handler);
    },
  };

  runInNewContext(source, { self, URL, Response, fetch, caches: {} });
  const handler = listeners.get('fetch');
  if (!handler) throw new Error('El Service Worker no registró el evento fetch');
  return handler as FetchHandler;
}

describe('Service Worker routing', () => {
  it('deja las respuestas RSC de Next en la red, no en Cache Storage', () => {
    const handleFetch = loadFetchHandler();
    let intercepted = false;

    handleFetch({
      request: new Request('http://localhost:3000/buscar?direction=desc&_rsc=abc', {
        headers: { RSC: '1', Accept: 'text/x-component' },
      }),
      respondWith: () => {
        intercepted = true;
        return Promise.resolve(new Response('cacheada'));
      },
    });

    expect(intercepted).toBe(false);
  });

  it('no cachea rutas dinámicas same-origin como si fueran assets', () => {
    const handleFetch = loadFetchHandler();
    let intercepted = false;

    handleFetch({
      request: new Request('http://localhost:3000/buscar?sort=price&direction=desc'),
      respondWith: () => {
        intercepted = true;
        return Promise.resolve(new Response('cacheada'));
      },
    });

    expect(intercepted).toBe(false);
  });
});
