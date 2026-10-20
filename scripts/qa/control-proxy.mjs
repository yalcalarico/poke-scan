import http from 'node:http';

/** Proxy de fallas sintéticas: el destino siempre es la API local indicada por el dueño. */
export function createControlProxy(apiPort = 3001) {
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new RangeError('Puerto de API inválido');
  }
  let failedSlug = null;
  return http.createServer((req, res) => {
    const path = req.url ?? '/';
    // No aceptar formas absolutas, authority-form ni separadores ambiguos.
    if (!path.startsWith('/') || path.startsWith('//') || /[\\\r\n]/.test(path)) {
      res.writeHead(400);
      res.end();
      return;
    }
    const url = new URL(path, 'http://127.0.0.1');
    if (url.pathname === '/__owner__/fail') {
      failedSlug = url.searchParams.get('slug');
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === '/__owner__/clear') {
      failedSlug = null;
      res.writeHead(204);
      res.end();
      return;
    }
    const slug = url.pathname.startsWith('/api/s/') ? url.pathname.slice('/api/s/'.length) : null;
    if (req.method === 'GET' && slug && slug === failedSlug) {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ statusCode: 503, message: 'Synthetic harness upstream failure' }));
      return;
    }
    // hostname/puerto son opciones separadas del path: el request no puede cambiar
    // el origen mediante userinfo, esquema, URL absoluta o redirección upstream.
    const upstream = http.request({
      hostname: '127.0.0.1',
      port: apiPort,
      path: url.pathname + url.search,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${apiPort}` },
    }, (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
}
