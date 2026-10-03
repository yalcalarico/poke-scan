import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';

const db = new URL(process.env.DATABASE_URL ?? '');
if (process.env.CI !== 'true' || db.pathname !== '/pokemon_security_test' ||
    !['localhost', '127.0.0.1'].includes(db.hostname)) {
  throw new Error('El smoke de seguridad solo admite la base descartable de CI');
}
const origin = 'https://app.example.test';
const runtime = {
  ...process.env, NODE_ENV: 'production', FRONTEND_URL: origin,
  CORS_ORIGINS: origin, PRICE_QUEUE_ENABLED: 'false',
  REDIS_URL: 'redis://localhost:6379',
  ENABLE_CATALOG_SYNC_CRON: 'false', ENABLE_PRICE_BACKFILL_CRON: 'false',
  ENABLE_RETENTION_CRON: 'false',
};
const processes = [];
const start = (command, args, cwd, env) => {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk.toString(); });
  child.stderr.on('data', (chunk) => { log += chunk.toString(); });
  processes.push(child);
  return { child, log: () => log };
};
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const waitFor = async (url, server) => {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (server.child.exitCode !== null) throw new Error(server.log());
    try { if ((await fetch(url)).ok) return; } catch { /* Arrancando. */ }
    await delay(500);
  }
  throw new Error(`No arrancó ${url}: ${server.log()}`);
};
const api = async (path, body, cookie) => {
  const response = await fetch(`http://localhost:3001/api${path}`, {
    method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Session-Request': '1', Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    }, body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
};
const prisma = new PrismaClient();
const email = 'security-smoke@test.local';
try {
  const insecure = start(process.execPath, ['dist/main.js'], 'backend', {
    ...runtime, JWT_SECRET: 'change-me-in-production',
  });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El backend aceptó el secreto inseguro')), 15000);
    insecure.child.once('exit', (exitCode) => { clearTimeout(timer); resolve(exitCode); });
    insecure.child.once('error', reject);
  });
  assert(code !== 0 && insecure.log().includes('JWT_SECRET'), 'No se rechazó el secreto inseguro');

  const backend = start(process.execPath, ['dist/main.js'], 'backend', runtime);
  const frontend = start('pnpm', ['--dir', 'frontend', 'exec', 'next', 'start', '--port', '3000'], '.', runtime);
  await waitFor('http://localhost:3001/api/health', backend);
  await waitFor('http://localhost:3000/login', frontend);
  const registered = await api('/auth/register', {
    email, username: 'securitysmoke', password: 'SmokePassword123', displayName: 'Smoke',
  });
  assert(registered.response.status === 201, 'Falló el registro real');
  assert(!('refreshToken' in registered.body), 'Se filtró el refresh en JSON');
  const first = registered.response.headers.get('set-cookie');
  assert(first?.includes('HttpOnly') && first.includes('Secure') && first.includes('SameSite=Lax'),
    'Cookie de producción insegura');
  const me = await fetch('http://localhost:3001/api/users/me', {
    headers: { Authorization: `Bearer ${registered.body.accessToken}` },
  });
  assert(me.status === 200, 'Falló el acceso autenticado real');
  const refreshed = await api('/auth/refresh', {}, first.split(';')[0]);
  assert(refreshed.response.status === 200 && !('refreshToken' in refreshed.body), 'Falló la rotación real');
  const second = refreshed.response.headers.get('set-cookie');
  assert(second && first.split(';')[0] !== second.split(';')[0], 'No rotó la cookie');
  const logout = await api('/auth/logout', {}, second.split(';')[0]);
  assert(logout.response.status === 200, 'Falló el logout real');
  assert(logout.response.headers.get('set-cookie')?.includes('pcs.refreshToken=;'), 'No borró la cookie');
  const rejected = await api('/auth/refresh', {}, second.split(';')[0]);
  assert(rejected.response.status === 401, 'El token cerrado sigue renovando');
  const withoutHeader = await fetch('http://localhost:3001/api/auth/logout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert(withoutHeader.status === 403, 'No bloqueó el pedido CSRF');
  console.log('Smoke real OK: secreto inseguro rechazado, frontend disponible, registro, acceso, rotación, logout y CSRF');
} finally {
  for (const child of processes) if (child.exitCode === null) child.kill('SIGTERM');
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
}
