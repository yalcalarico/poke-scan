import { cpSync, lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const frontend = fileURLToPath(new URL('../', import.meta.url));
export const app = join(frontend, '.playwright-app');
const output = join(frontend, '.playwright-output');
const sources = ['app', 'components', 'hooks', 'lib', 'types', 'public',
  'package.json', 'tsconfig.json', 'postcss.config.mjs', 'next.config.ts'];

export function excluded(name) {
  return name.startsWith('.env') || name.startsWith('.playwright-')
    || ['node_modules', '.next', '.git'].includes(name);
}

export function environment(parent = process.env) {
  return {
    PATH: parent.PATH ?? '',
    HOME: join(output, 'home'),
    TMPDIR: join(output, 'tmp'),
    CI: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_API_URL: '/api',
    PLAYWRIGHT_BROWSERS_PATH: join(frontend, '.playwright-browsers'),
    PLAYWRIGHT_NO_COPY_PROMPT: '1',
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: join(app, 'font-responses.cjs'),
  };
}

export function prepare() {
  mkdirSync(app); // Exclusivo: nunca reutiliza ni borra un directorio previo.
  const identity = lstatSync(app);
  const cleanup = () => {
    const current = lstatSync(app);
    if (current.isSymbolicLink() || current.ino !== identity.ino || current.dev !== identity.dev
      || realpathSync(app) !== app) throw new Error('Cambió el propietario de .playwright-app; no se borra.');
    rmSync(app, { recursive: true }); // fs.rm no sigue el enlace de node_modules.
  };
  try {
    for (const name of sources) {
      cpSync(join(frontend, name), join(app, name), {
        recursive: true,
        filter: (source) => {
          if (excluded(basename(source))) return false;
          if (lstatSync(source).isSymbolicLink()) throw new Error(`Fuente enlazada no permitida: ${source}`);
          return true;
        },
      });
    }
    symlinkSync(join(frontend, 'node_modules'), join(app, 'node_modules'), 'dir');
    const fonts = Object.fromEntries(['Geist', 'Geist Mono'].map((family) => [
      `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:wght@100..900&display=swap`,
      `@font-face { font-family: '${family}'; src: local('Arial'); font-weight: 100 900; }`,
    ]));
    writeFileSync(join(app, 'font-responses.cjs'), `module.exports = ${JSON.stringify(fonts)};\n`);
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function main(mode, args) {
  if (!['test', 'install', 'serve'].includes(mode)) throw new Error('Modo de navegador inválido.');
  if (mode === 'install' && args.length > 0) {
    process.stderr.write('El modo install no acepta argumentos adicionales.\n');
    process.exitCode = 2;
    return;
  }
  const env = environment();
  if (mode === 'serve') env.NODE_OPTIONS = `--import=${new URL('../e2e/browser-offline.mjs', import.meta.url).href}`;
  for (const path of [output, env.PLAYWRIGHT_BROWSERS_PATH, env.HOME, env.TMPDIR]) {
    try { mkdirSync(path); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (!lstatSync(path).isDirectory()) throw new Error(`Directorio local inválido: ${path}`);
  }
  let cleanup = () => {};
  let child;
  const interrupt = () => child?.kill('SIGINT');
  const terminate = () => child?.kill('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    cleanup = mode === 'serve' ? prepare() : cleanup;
    const command = mode === 'serve' ? process.execPath : 'pnpm';
    const commandArgs = mode === 'serve'
      ? [require.resolve('next/dist/bin/next'), 'dev', app, '--webpack', '--hostname', '127.0.0.1', '--port', '3100']
      : ['exec', 'playwright', ...(mode === 'install' ? ['install', 'chromium'] : ['test', ...args])];
    child = spawn(command, commandArgs, { cwd: mode === 'serve' ? app : frontend, env, stdio: 'inherit' });
    process.exitCode = await new Promise((done, fail) => {
      child.once('error', fail);
      child.once('close', (code, signal) => done(code ?? (signal ? 1 : 0)));
    });
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
    cleanup();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv[2], process.argv.slice(3));
}
