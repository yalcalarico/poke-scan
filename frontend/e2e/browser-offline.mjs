import { Socket } from 'node:net';
import card from './catalog.json' with { type: 'json' };

// Next dev consulta dist-tags aun con telemetría apagada: simulamos indisponibilidad.
const fetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  if (url === 'https://registry.npmjs.org/-/package/next/dist-tags') {
    return Promise.resolve(new Response(null, { status: 503 }));
  }
  const target = new URL(url);
  const method = (options?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
  if (target.pathname.startsWith('/api/')) {
    if (target.origin === 'http://127.0.0.1:3100' && method === 'GET') {
      if (target.pathname === '/api/cards/browser-card' && !target.search) {
        return Promise.resolve(Response.json(card));
      }
      if (target.pathname === '/api/cards/search' && target.search === '?setId=browser-set&pageSize=15') {
        return Promise.resolve(Response.json({ data: [], total: 0, page: 1, pageSize: 15, totalPages: 0 }));
      }
    }
    console.error('Solicitud de catálogo no permitida en Next aislado.');
    process.exit(1);
  }
  return fetch(input, options);
};

// También cubre clientes HTTP que no usan fetch. Fallar el proceso evita que
// un catch de Next convierta una salida externa inesperada en un test verde.
const connect = Socket.prototype.connect;
Socket.prototype.connect = function (...args) {
  const [options, host] = Array.isArray(args[0]) ? args[0] : args;
  const port = typeof options === 'object' ? options.port : options;
  const hostname = typeof options === 'object' ? options.host : host;
  if (Number(port) !== 3100 || !['localhost', '127.0.0.1', '::1'].includes(hostname ?? 'localhost')) {
    console.error('Conexión saliente no permitida en Next aislado.');
    process.exit(1);
  }
  return connect.apply(this, args);
};
