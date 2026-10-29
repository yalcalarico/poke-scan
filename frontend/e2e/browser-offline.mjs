import { Socket } from 'node:net';

// Next dev consulta dist-tags aun con telemetría apagada: simulamos indisponibilidad.
const fetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  if (url === 'https://registry.npmjs.org/-/package/next/dist-tags') {
    return Promise.resolve(new Response(null, { status: 503 }));
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
