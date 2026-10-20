/** Fallos de red y cierre forzado en CLIs reales, con CDN sustituido sólo en el harness. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  writeFile,
  access,
  unlink,
  copyFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { referenceUrl } from './scanner-reference-url.mjs';
import {
  indexFilename,
  expectedMetadata,
  loadIndex,
} from './scanner-visual-index.mjs';
import { setFolderName } from './scanner-set-name.mjs';

const [output, selectedNetworkCase] = process.argv.slice(2);
if (!output || output === '--help') {
  console.log(
    'Desde backend: node --env-file-if-exists=.env scripts/scanner-index-failures-smoke.mjs REPORTE [CASO_RED: 503|429|invalid|disconnect|oversize|hold]. Sin caso: todos los fallos de red y SIGKILL. Red loopback, modelo/CLI/DB reales, caché y vectores sintéticos en temporal. Incluye timeout real 30 s y SIGKILL a procesos propios. Nunca publicar estas fixtures como índice de reconocimiento.',
  );
  process.exit(output === '--help' ? 0 : 1);
}
if (selectedNetworkCase)
  assert(
    ['503', '429', 'invalid', 'disconnect', 'oversize', 'hold'].includes(
      selectedNetworkCase,
    ),
  );
const root = await mkdtemp(resolve(tmpdir(), 'scanner-index-failures-'));
const scripts = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
let set;
try {
  set = await prisma.cardSet.findUniqueOrThrow({
    where: { id: 'mcd19' },
    select: {
      id: true,
      name: true,
      cards: {
        select: { id: true, imageLarge: true, imageSmall: true },
        orderBy: { id: 'asc' },
      },
    },
  });
} finally {
  await prisma.$disconnect();
}
assert(set.cards.length >= 2 && set.cards.length <= 30);
const metadata = await expectedMetadata(
  resolve(
    process.env.SCANNER_MODEL ?? '.scanner-models/dinov2-small-int8.onnx',
  ),
);
const png = await sharp({
  create: {
    width: 320,
    height: 448,
    channels: 3,
    background: { r: 80, g: 120, b: 160 },
  },
})
  .png()
  .toBuffer();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
let mode = 'good',
  requests = 0;
const server = createServer((_request, response) => {
  requests++;
  if (mode === '503' || mode === '429') {
    response.writeHead(Number(mode), { 'Retry-After': '1' });
    response.end('fallo controlado');
    return;
  }
  if (mode === 'invalid') {
    response.writeHead(200);
    response.end('HTTP 200 sin imagen');
    return;
  }
  if (mode === 'oversize') {
    response.writeHead(200, { 'Content-Length': String(11 * 1024 * 1024) });
    response.write(png.subarray(0, 40));
    return;
  }
  response.writeHead(200, { 'Content-Length': png.length });
  if (mode === 'disconnect') {
    response.write(png.subarray(0, 40));
    setTimeout(() => response.destroy(), 30);
    return;
  }
  if (mode === 'hold') {
    response.write(png.subarray(0, 40));
    return;
  }
  response.end(png);
});
await new Promise((accept, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', accept);
});
const origin = `http://127.0.0.1:${server.address().port}`;
const preload = resolve(root, 'fault-preload.mjs');
await writeFile(
  preload,
  `
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
const allowed = new Set(JSON.parse(process.env.SCANNER_FIXTURE_URLS));
const nativeFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  if (!allowed.has(String(url))) throw new Error('Red fuera del fixture bloqueada.');
  console.log('FIXTURE_DOWNLOAD:' + process.pid);
  options.signal?.addEventListener('abort', () => console.log('FIXTURE_ABORT:' + process.pid), {once:true});
  return nativeFetch(process.env.SCANNER_FIXTURE_ORIGIN + '/image', options).then(response => {
    if (process.env.SCANNER_FIXTURE_TRACE === '1' && response.body) {
      console.log('FIXTURE_HEADERS');
      const getReader = response.body.getReader.bind(response.body);
      response.body.getReader = () => {
        const reader = getReader();
        return {
          read: () => reader.read().then(value => {console.log('FIXTURE_READ:' + value.done); return value;}, error => {console.log('FIXTURE_READ_ERROR:' + error.message); throw error;}),
          cancel: () => {console.log('FIXTURE_CANCEL'); return reader.cancel().then(value => {console.log('FIXTURE_CANCEL_DONE'); return value;}, error => {console.log('FIXTURE_CANCEL_ERROR'); throw error;});},
          releaseLock: () => {console.log('FIXTURE_RELEASE'); return reader.releaseLock();},
        };
      };
    }
    return response;
  });
};
const write = fs.writeFile, append = fs.appendFile;
fs.writeFile = async (path, bytes, ...args) => {
  await write(path, bytes, ...args);
  if (process.env.SCANNER_FIXTURE_PAUSE === 'temporary' && String(path).endsWith('.image.tmp')) {
    console.log('FIXTURE_TEMPORARY:' + process.pid); await new Promise(() => {});
  }
};
fs.appendFile = async (path, bytes, ...args) => {
  if (process.env.SCANNER_FIXTURE_PAUSE === 'jsonl' && String(path).endsWith('.jsonl')) {
    await append(path, bytes.slice(0, Math.floor(bytes.length / 2)), ...args);
    console.log('FIXTURE_JSONL:' + process.pid); await new Promise(() => {});
  }
  return append(path, bytes, ...args);
};
syncBuiltinESMExports();
`,
);
const active = new Set(),
  orphans = new Set(),
  results = [];
function launch(script, args, pause = '') {
  const child = spawn(
    process.execPath,
    ['--env-file-if-exists=.env', resolve(scripts, script), ...args],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(preload)}`,
        SCANNER_FIXTURE_ORIGIN: origin,
        SCANNER_FIXTURE_URLS: JSON.stringify(set.cards.map(referenceUrl)),
        SCANNER_FIXTURE_PAUSE: pause,
        SCANNER_FIXTURE_TRACE: selectedNetworkCase ? '1' : '0',
      },
    },
  );
  active.add(child);
  let stdout = '',
    stderr = '';
  const watchers = [];
  const done = new Promise((accept, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new Error(
          'CLI excedió 70 s. Fixture: ' +
            root +
            '\n' +
            stdout.slice(-2000) +
            '\n' +
            stderr.slice(-2000),
        ),
      );
    }, 70000);
    child.stdout.on('data', (bytes) => {
      stdout += bytes;
      if (selectedNetworkCase) process.stdout.write(bytes);
      for (const notify of watchers) notify(stdout);
    });
    child.stderr.on('data', (bytes) => {
      stderr += bytes;
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      active.delete(child);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      active.delete(child);
      accept({ code, signal, stdout, stderr });
    });
  });
  function waitFor(pattern) {
    return new Promise((accept, reject) => {
      let matched = false;
      const check = (text) => {
        const match = pattern.exec(text);
        if (match && !matched) {
          matched = true;
          accept(match);
        }
      };
      watchers.push(check);
      check(stdout);
      done.then((value) => {
        if (!matched)
          reject(
            new Error('CLI terminó antes del punto de fallo: ' + value.stderr),
          );
      }, reject);
    });
  }
  return { child, done, waitFor };
}
const args = (dir, cards = set.cards.slice(0, 1), delayMs = 0) => [
  'index',
  '--card-ids',
  cards.map((c) => c.id).join(','),
  '--limit',
  String(cards.length),
  '--directory',
  dir,
  '--delay-ms',
  String(delayMs),
];
const imagePath = (dir, card = set.cards[0]) =>
  resolve(dir, 'images', hash(card.id + referenceUrl(card)) + '.image');
async function absent(path) {
  await assert.rejects(access(path), { code: 'ENOENT' });
}
async function noRows(dir) {
  await absent(resolve(dir, indexFilename));
}
async function rows(dir) {
  const text = await readFile(resolve(dir, indexFilename), 'utf8');
  assert(text.endsWith('\n'));
  const data = text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(new Set(data.map((row) => row.id)).size, data.length);
  await loadIndex(dir, metadata);
  return data;
}
async function clearDeadLock(path, pid) {
  // Recuperación manual reproducida únicamente en carpetas propias de este
  // harness: jamás borrar automáticamente un lock de un índice real.
  assert.equal(JSON.parse(await readFile(path, 'utf8')).pid, pid);
  assert.throws(
    () => process.kill(pid, 0),
    (error) => error.code === 'ESRCH',
  );
  await unlink(path);
}
async function resume(dir, cards = set.cards.slice(0, 1)) {
  mode = 'good';
  requests = 0;
  const run = await launch('scanner-visual-spike.mjs', args(dir, cards)).done;
  assert.equal(run.code, 0, run.stderr);
  const entries = await rows(dir);
  assert.deepEqual(
    entries.map((row) => row.id).sort(),
    cards.map((c) => c.id).sort(),
  );
  for (const card of cards)
    assert.equal(hash(await readFile(imagePath(dir, card))), hash(png));
  await absent(resolve(dir, 'index.lock'));
  return {
    entries,
    requests,
    summary: JSON.parse(await readFile(resolve(dir, 'index-summary.json'))),
  };
}
function record(result) {
  results.push(result);
  console.log('PASS ' + result.case);
}
try {
  for (const failure of [
    '503',
    '429',
    'invalid',
    'disconnect',
    'oversize',
    'hold',
  ]) {
    if (selectedNetworkCase && failure !== selectedNetworkCase) continue;
    const dir = resolve(root, 'network-' + failure);
    mode = failure;
    requests = 0;
    const started = performance.now(),
      run = await launch('scanner-visual-spike.mjs', args(dir)).done;
    const elapsedMs = performance.now() - started;
    assert.equal(run.code, 1, run.stderr);
    assert.equal(requests, 1);
    await noRows(dir);
    await absent(imagePath(dir));
    await absent(imagePath(dir) + '.tmp');
    await absent(resolve(dir, 'index.lock'));
    const failed = JSON.parse(
      await readFile(resolve(dir, 'index-summary.json')),
    );
    assert.equal(failed.failed, 1);
    assert.equal(failed.completed, 0);
    if (failure === 'hold')
      assert(
        elapsedMs >= 29000 && elapsedMs < 45000,
        'Timeout de red real de 30 s.',
      );
    const recovered = await resume(dir);
    assert.equal(recovered.requests, 1);
    const reused = await resume(dir);
    assert.equal(reused.requests, 0);
    assert.equal(reused.summary.attempted, 0);
    record({
      case: 'network ' + failure,
      failedExit: run.code,
      failedElapsedMs: elapsedMs,
      recoveryExit: 0,
      complete: recovered.entries.length,
      repeatedDownloads: reused.requests,
    });
    server.closeAllConnections();
  }

  if (!selectedNetworkCase) {
    for (const phase of ['download', 'temporary']) {
      const dir = resolve(root, 'kill-' + phase);
      mode = phase === 'download' ? 'hold' : 'good';
      requests = 0;
      const run = launch(
        'scanner-visual-spike.mjs',
        args(dir),
        phase === 'temporary' ? phase : '',
      );
      await run.waitFor(
        phase === 'download' ? /FIXTURE_DOWNLOAD:/ : /FIXTURE_TEMPORARY:/,
      );
      if (phase === 'download') {
        while (!requests) await delay(10);
      }
      run.child.kill('SIGKILL');
      const stopped = await run.done;
      assert.equal(stopped.signal, 'SIGKILL');
      await noRows(dir);
      await absent(imagePath(dir));
      if (phase === 'temporary')
        assert.equal(hash(await readFile(imagePath(dir) + '.tmp')), hash(png));
      const competitor = await launch('scanner-visual-spike.mjs', args(dir))
        .done;
      assert.equal(competitor.code, 1);
      assert.match(competitor.stderr, /EEXIST/);
      await clearDeadLock(resolve(dir, 'index.lock'), run.child.pid);
      const recovered = await resume(dir);
      assert.equal(recovered.requests, 1);
      await absent(imagePath(dir) + '.tmp');
      record({
        case: 'SIGKILL during ' + phase,
        signal: stopped.signal,
        orphanLockBlocksResume: true,
        manualFixtureRecovery: true,
        total: recovered.entries.length,
      });
      server.closeAllConnections();
    }

    const completedDir = resolve(root, 'kill-after-complete');
    mode = 'good';
    const committed = launch(
      'scanner-visual-spike.mjs',
      args(completedDir, set.cards.slice(0, 2), 3000),
    );
    await committed.waitFor(/1\/2:/);
    committed.child.kill('SIGKILL');
    assert.equal((await committed.done).signal, 'SIGKILL');
    const original = await readFile(
      resolve(completedDir, indexFilename),
      'utf8',
    );
    await clearDeadLock(
      resolve(completedDir, 'index.lock'),
      committed.child.pid,
    );
    const completed = await resume(completedDir, set.cards.slice(0, 2));
    assert.equal(completed.requests, 1);
    assert.equal(JSON.stringify(completed.entries[0]) + '\n', original);
    record({
      case: 'SIGKILL after committed vector',
      conserved: 1,
      total: completed.entries.length,
      downloadsOnResume: completed.requests,
    });

    const partialDir = resolve(root, 'kill-partial-jsonl');
    mode = 'good';
    const partial = launch(
      'scanner-visual-spike.mjs',
      args(partialDir),
      'jsonl',
    );
    await partial.waitFor(/FIXTURE_JSONL:/);
    partial.child.kill('SIGKILL');
    await partial.done;
    await clearDeadLock(resolve(partialDir, 'index.lock'), partial.child.pid);
    const partialPath = resolve(partialDir, indexFilename),
      originalBytes = await readFile(partialPath);
    await copyFile(partialPath, partialPath + '.backup');
    const rejected = await launch('scanner-visual-spike.mjs', args(partialDir))
      .done;
    assert.equal(rejected.code, 1);
    assert.match(rejected.stderr, /línea incompleta/);
    assert.deepEqual(await readFile(partialPath), originalBytes);
    await absent(resolve(partialDir, 'index.lock'));
    await assert.rejects(loadIndex(partialDir, metadata), /incompleta/);
    record({
      case: 'SIGKILL during JSONL append',
      rejectsResume: true,
      runtimeRejects: true,
      originalPreserved: true,
      backup: partialPath + '.backup',
    });

    // SIGKILL del padre no puede reenviar señal: el hijo sigue siendo escritor.
    const batchDir = resolve(root, 'kill-batch-parent'),
      setDir = resolve(batchDir, setFolderName(set.name));
    mode = 'hold';
    const batch = launch('scanner-index-sets.mjs', [
      '--set',
      set.id,
      '--limit',
      '1',
      '--directory',
      batchDir,
    ]);
    const marker = await batch.waitFor(/FIXTURE_DOWNLOAD:(\d+)/),
      childPid = Number(marker[1]);
    orphans.add(childPid);
    assert.equal(
      JSON.parse(await readFile(resolve(setDir, 'index.lock'), 'utf8')).pid,
      childPid,
    );
    batch.child.kill('SIGKILL');
    assert.equal((await batch.done).signal, 'SIGKILL');
    process.kill(childPid, 0);
    const blocked = await launch('scanner-index-sets.mjs', [
      '--set',
      set.id,
      '--limit',
      '1',
      '--directory',
      batchDir,
    ]).done;
    assert.equal(blocked.code, 1);
    assert.match(blocked.stderr, /EEXIST/);
    process.kill(childPid, 'SIGKILL');
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        process.kill(childPid, 0);
        await delay(20);
      } catch {
        break;
      }
    }
    await clearDeadLock(resolve(setDir, 'index.lock'), childPid);
    orphans.delete(childPid);
    await clearDeadLock(resolve(batchDir, 'sets-index.lock'), batch.child.pid);
    mode = 'good';
    const batchResume = await launch('scanner-index-sets.mjs', [
      '--set',
      set.id,
      '--limit',
      '1',
      '--directory',
      batchDir,
    ]).done;
    assert.equal(batchResume.code, 0, batchResume.stderr);
    const all = await rows(setDir);
    assert.equal(all.length, set.cards.length);
    await absent(resolve(batchDir, 'sets-index.lock'));
    await absent(resolve(setDir, 'index.lock'));
    record({
      case: 'SIGKILL batch parent',
      childStayedAlive: true,
      blockedUntilBothWritersStopped: true,
      manualFixtureRecovery: true,
      total: all.length,
    });
  }

  await writeFile(
    resolve(output),
    JSON.stringify(
      {
        evaluatedAt: new Date().toISOString(),
        state: 'passed',
        productionReady: false,
        temporaryDirectory: root,
        scope:
          'CLIs/Prisma/modelo/ONNX reales. HTTP loopback mediante preload del harness: ninguna descarga al CDN real. Sólo referencias sintéticas y procesos propios. SIGKILL deja locks; recuperación manual sólo en fixtures después de verificar PID muerto. No certifica ausencia de pérdida ante todo crash o precisión.',
        results,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
} finally {
  for (const child of active) child.kill('SIGKILL');
  for (const pid of orphans) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* Ya terminó. */
    }
  }
  server.closeAllConnections();
  await new Promise((accept) => server.close(accept));
}
