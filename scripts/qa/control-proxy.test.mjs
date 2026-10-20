import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createControlProxy } from './control-proxy.mjs';

async function listen(server, t) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  return server.address().port;
}

function request(port, path, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method }, async (res) => {
      const chunks = [];
      for await (const chunk of res) chunks.push(chunk);
      resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() });
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('conserva path/query, método y body hacia la API loopback fija', async (t) => {
  const calls = [];
  const apiPort = await listen(http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    calls.push({ url: req.url, method: req.method, host: req.headers.host, body: Buffer.concat(chunks).toString() });
    res.end('local-api');
  }), t);
  const port = await listen(createControlProxy(apiPort), t);
  assert.equal((await request(port, '/api/s/owned?q=a%20b', 'POST', 'payload')).body, 'local-api');
  assert.deepEqual(calls, [{ url: '/api/s/owned?q=a%20b', method: 'POST', host: `127.0.0.1:${apiPort}`, body: 'payload' }]);
});

test('rechaza request targets que intentan cambiar autoridad sin contactar otro servidor', async (t) => {
  let apiCalls = 0, otherCalls = 0;
  const otherPort = await listen(http.createServer((_req, res) => { otherCalls++; res.end('unexpected'); }), t);
  const apiPort = await listen(http.createServer((_req, res) => { apiCalls++; res.end('api'); }), t);
  const port = await listen(createControlProxy(apiPort), t);
  for (const path of [
    `@127.0.0.1:${otherPort}/attack`,
    `http://127.0.0.1:${otherPort}/attack`,
    `//127.0.0.1:${otherPort}/attack`,
    `/\\127.0.0.1:${otherPort}/attack`,
  ]) assert.equal((await request(port, path)).status, 400, path);
  assert.equal(apiCalls, 0);
  assert.equal(otherCalls, 0);
});

test('preserva el redirect sin seguirlo hacia otro origen', async (t) => {
  let otherCalls = 0;
  const otherPort = await listen(http.createServer((_req, res) => { otherCalls++; res.end('unexpected'); }), t);
  const target = `http://127.0.0.1:${otherPort}/private`;
  const apiPort = await listen(http.createServer((_req, res) => { res.writeHead(302, { Location: target }); res.end(); }), t);
  const port = await listen(createControlProxy(apiPort), t);
  const response = await request(port, '/redirect');
  assert.equal(response.status, 302);
  assert.equal(response.headers.location, target);
  assert.equal(otherCalls, 0);
});

test('la falla sintética sólo afecta el slug configurado y se puede limpiar', async (t) => {
  let apiCalls = 0;
  const apiPort = await listen(http.createServer((_req, res) => { apiCalls++; res.end('api'); }), t);
  const port = await listen(createControlProxy(apiPort), t);
  assert.equal((await request(port, '/__owner__/fail?slug=owned')).status, 204);
  const failed = await request(port, '/api/s/owned');
  assert.equal(failed.status, 503);
  assert.equal(failed.headers['cache-control'], 'no-store');
  assert.equal(JSON.parse(failed.body).statusCode, 503);
  assert.equal((await request(port, '/api/s/other')).status, 200);
  assert.equal((await request(port, '/__owner__/clear')).status, 204);
  assert.equal((await request(port, '/api/s/owned')).status, 200);
  assert.equal(apiCalls, 2);
});

test('un corte del upstream devuelve 502 sin colgar el consumidor', async (t) => {
  const apiPort = await listen(http.createServer((req) => req.socket.destroy()), t);
  const port = await listen(createControlProxy(apiPort), t);
  assert.equal((await request(port, '/api/health')).status, 502);
});
