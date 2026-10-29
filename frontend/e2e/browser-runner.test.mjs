import assert from 'node:assert/strict';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { app, environment, excluded, frontend, prepare } from '../scripts/browser-runner.mjs';

// La copia aísla las rutas relativas del CLI; el pnpm sintético nunca instala ni usa red.
function withCliFixture(check) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'browser-runner-cli-')));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'bin'));
    const runner = join(root, 'scripts/browser-runner.mjs');
    cpSync(join(frontend, 'scripts/browser-runner.mjs'), runner);
    writeFileSync(join(root, 'bin/pnpm'),
      `#!${process.execPath}\nconsole.log(JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o755 });
    check((...args) => spawnSync(process.execPath, [runner, ...args], {
      cwd: root, env: { PATH: join(root, 'bin') }, encoding: 'utf8',
    }), root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

for (const flag of ['--dry-run', '--with-deps']) {
  test(`CLI install rechaza ${flag} sin efectos locales`, () => {
    withCliFixture((run, root) => {
      const before = readdirSync(root).sort();
      const result = run('install', flag);
      assert.deepEqual({
        status: result.status, stdout: result.stdout, stderr: result.stderr,
        entries: readdirSync(root).sort(),
      }, {
        status: 2, stdout: '', stderr: 'El modo install no acepta argumentos adicionales.\n',
        entries: before,
      });
    });
  });
}

test('CLI conserva install sin argumentos y test con argv reenviado', () => {
  withCliFixture((run) => {
    for (const [args, forwarded] of [
      [['install'], ['exec', 'playwright', 'install', 'chromium']],
      [['test', '--grep', 'subida anónima'], ['exec', 'playwright', 'test', '--grep', 'subida anónima']],
    ]) {
      const result = run(...args);
      assert.deepEqual({ status: result.status, stdout: result.stdout, stderr: result.stderr }, {
        status: 0, stdout: `${JSON.stringify(forwarded)}\n`, stderr: '',
      });
    }
  });
});

test('excluye secretos y estado generado; no hereda opciones ni endpoints', () => {
  for (const name of ['.env', '.env.local', '.next', '.git', 'node_modules',
    '.playwright-app', '.playwright-output', '.playwright-browsers']) assert.ok(excluded(name));
  assert.equal(excluded('layout.tsx'), false);
  const env = environment({ PATH: '/synthetic', NODE_OPTIONS: '--inspect', NEXT_PUBLIC_API_URL: 'https://example.invalid' });
  assert.equal(env.PATH, '/synthetic');
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.NEXT_PUBLIC_API_URL, '/api');
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, join(frontend, '.playwright-browsers'));
});

test('preload responde sin red y rechaza sockets externos antes de conectar', () => {
  const preload = new URL('./browser-offline.mjs', import.meta.url).href;
  const run = (code) => spawnSync(process.execPath, ['--import', preload, '--input-type=module', '-e', code],
    { env: environment({ PATH: '' }), encoding: 'utf8' });
  const registry = run("console.log((await fetch('https://registry.npmjs.org/-/package/next/dist-tags')).status)");
  assert.equal(registry.status, 0);
  assert.equal(registry.stdout.trim(), '503');
  const denied = run("import { Socket } from 'node:net'; new Socket().connect(443, 'example.invalid')");
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /Conexión saliente no permitida/);
});

test('copia exclusiva, deps enlazadas, fuentes locales y limpieza sin alterar originales', () => {
  const original = readFileSync(join(frontend, 'app/layout.tsx'), 'utf8');
  const cleanup = prepare();
  try {
    assert.throws(() => prepare(), { code: 'EEXIST' });
    assert.equal(readFileSync(join(app, 'app/layout.tsx'), 'utf8'), original);
    assert.ok(lstatSync(join(app, 'node_modules')).isSymbolicLink());
    assert.equal(readlinkSync(join(app, 'node_modules')), join(frontend, 'node_modules'));
    assert.match(readFileSync(join(app, 'font-responses.cjs'), 'utf8'), /src: local\('Arial'\)/);
    assert.equal(existsSync(join(app, '.next')), false);
  } finally { cleanup(); }
  assert.equal(existsSync(app), false);
  assert.equal(readFileSync(join(frontend, 'app/layout.tsx'), 'utf8'), original);
});
