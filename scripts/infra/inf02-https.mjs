import https from 'node:https';

// Deadline total: incluye DNS, conexión, headers y lectura del body.
export function httpsRequest(url, options = {}, body, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { ...options, rejectUnauthorized: true }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > 8_000_000) req.destroy(new Error('Respuesta de smoke excedió el límite.'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    const timer = setTimeout(() => req.destroy(new Error('Pedido HTTPS excedió el plazo.')), timeoutMs);
    req.on('error', reject);
    req.on('close', () => clearTimeout(timer));
    if (body) req.write(body);
    req.end();
  });
}
