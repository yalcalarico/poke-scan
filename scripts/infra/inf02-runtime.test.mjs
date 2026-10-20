import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes } from 'node:crypto';
import { chmod, cp, lstat, mkdir, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { httpsRequest } from './inf02-https.mjs';

const exec = promisify(execFile);
const root = `/private/tmp/inf02-review-tests-${randomBytes(8).toString('hex')}`;
await mkdir(root, { mode: 0o700 });
const scripts = resolve('scripts/infra');
const revision = '8b1f705a3a7f6f062f6bdd21986c1583d3ef105d';
const jsonl = `dinov2-${revision}-int8.jsonl`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const run = (name, args = [], env = {}) => exec(process.execPath, [join(scripts, name), ...args], { env: { ...process.env, ...env }, timeout: 8_000 });
let sequence = 0;
async function unlocked(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) return;
  await chmod(path, info.isDirectory() ? 0o700 : 0o600);
  if (info.isDirectory()) for (const name of await readdir(path)) await unlocked(join(path, name));
}
after(async () => { await unlocked(root); await rm(root, { recursive: true }); });
async function fixture() {
  const dir = join(root, `case-${sequence++}`);
  const source = join(dir, 'source');
  const model = join(dir, 'model.onnx');
  const bundle = join(dir, 'bundle');
  await mkdir(join(source, 'fixture'), { recursive: true });
  const bytes = Buffer.alloc(1_000_000, 7);
  await writeFile(model, bytes);
  const metadata = { revision, precision: 'int8', dimensions: 384, modelHash: hash(bytes), preprocessingHash: '8170121eafd1c4dd3122475255b0c6bb811cc598d38abcaf34ac9dd5ca483708' };
  await writeFile(join(source, 'fixture', 'meta.json'), JSON.stringify(metadata));
  const vector = [1, ...Array(383).fill(0)];
  await writeFile(join(source, 'fixture', jsonl), [1, 2].map((id) => JSON.stringify({ id: `fixture-${id}`, vector })).join('\n') + '\n');
  await run('inf02-bundle.mjs', [source, model, bundle]);
  return { dir, source, model, bundle };
}
async function resign(bundle, modify) {
  const manifestPath = join(bundle, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await modify(manifest);
  for (const file of manifest.index.files) file.sha256 = hash(await readFile(join(bundle, file.path)));
  const sorted = [...manifest.index.files].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  manifest.index.treeSha256 = hash(sorted.map((file) => `${file.path}\0${file.sha256}`).join('\n'));
  manifest.artifactId = `dinov2-small-int8-${revision}-${manifest.index.treeSha256.slice(0, 12)}`;
  delete manifest.manifestSha256;
  manifest.manifestSha256 = hash(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

test('bundle completo y single-reference publican payload/conteo físico coherentes para Linux', async () => {
  const { bundle, source, model, dir } = await fixture();
  assert.equal(JSON.parse((await run('inf02-bundle-verify.mjs', [bundle])).stdout).entries, 2);
  const single = join(dir, 'single');
  await run('inf02-bundle.mjs', [source, model, single, '--single-reference']);
  assert.equal((await readFile(join(single, 'index', 'fixture', jsonl), 'utf8')).trim().split('\n').length, 1);
  assert.equal(JSON.parse((await run('inf02-bundle-verify.mjs', [single])).stdout).entries, 1);
  const manifest = JSON.parse(await readFile(join(single, 'manifest.json'), 'utf8'));
  assert.equal(manifest.target.os, 'linux');
  assert.equal(manifest.buildHost.os, process.platform);
  assert.equal((await lstat(join(single, 'manifest.json'))).mode & 0o777, 0o444);
  assert.equal((await lstat(single)).mode & 0o777, 0o555);
});

for (const kind of ['empty', 'existing', 'symlink']) test(`publicación preserva destino ${kind} y no deja staging`, async () => {
  const { dir, source, model } = await fixture();
  const output = join(dir, `collision-${kind}`);
  const foreign = join(dir, 'foreign');
  await mkdir(foreign); await writeFile(join(foreign, 'keep.txt'), 'preservar');
  if (kind === 'symlink') await symlink(foreign, output);
  else { await mkdir(output); if (kind === 'existing') await writeFile(join(output, 'keep.txt'), 'preservar'); }
  await assert.rejects(run('inf02-bundle.mjs', [source, model, output]));
  if (kind === 'existing') assert.equal(await readFile(join(output, 'keep.txt'), 'utf8'), 'preservar');
  assert.equal(await readFile(join(foreign, 'keep.txt'), 'utf8'), 'preservar');
  assert.equal((await readdir(dir)).filter((name) => name.includes('.tmp-')).length, 0);
});

for (const kind of ['vector-length', 'vector-norm', 'vector-null', 'metadata', 'trailing', 'duplicate', 'manifest-count', 'platform']) test(`verificador rechaza ${kind} con hashes recalculados`, async () => {
  const { bundle } = await fixture(); await unlocked(bundle);
  const path = join(bundle, 'index', 'fixture', jsonl);
  const records = (await readFile(path, 'utf8')).trim().split('\n').map(JSON.parse);
  if (kind === 'vector-length') records[0].vector.pop();
  if (kind === 'vector-norm') records[0].vector[0] = 0.5;
  if (kind === 'vector-null') records[0].vector[0] = null;
  if (kind === 'duplicate') records[1].id = records[0].id;
  await writeFile(path, records.map(JSON.stringify).join('\n') + (kind === 'trailing' ? '' : '\n'));
  if (kind === 'metadata') {
    const metadataPath = join(bundle, 'index', 'fixture', 'meta.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    metadata.modelHash = '0'.repeat(64); await writeFile(metadataPath, JSON.stringify(metadata));
  }
  await resign(bundle, async (manifest) => {
    if (kind === 'manifest-count') manifest.index.expectedEntries = 3;
    if (kind === 'platform') manifest.target.os = 'darwin';
  });
  await assert.rejects(run('inf02-bundle-verify.mjs', [bundle]));
});

for (const kind of ['digest', 'model-bytes', 'extra-photo', 'extra-directory', 'symlink-file', 'symlink-directory', 'traversal', 'duplicate-path']) test(`allowlist rechaza ${kind}`, async () => {
  const { bundle, model } = await fixture(); await unlocked(bundle);
  if (kind === 'digest') await writeFile(join(bundle, 'model', 'dinov2-small-int8.onnx'), Buffer.alloc(1_000_000));
  if (kind === 'extra-photo') await writeFile(join(bundle, 'photo.png'), 'foto');
  if (kind === 'extra-directory') await mkdir(join(bundle, 'references'));
  if (kind === 'symlink-file') { const path = join(bundle, 'model', 'dinov2-small-int8.onnx'); await unlink(path); await symlink(model, path); }
  if (kind === 'symlink-directory') { await rm(join(bundle, 'index', 'fixture'), { recursive: true }); await symlink(resolve(bundle, '..', 'source', 'fixture'), join(bundle, 'index', 'fixture')); }
  if (['model-bytes', 'traversal', 'duplicate-path'].includes(kind)) await resign(bundle, async (manifest) => {
    if (kind === 'model-bytes') manifest.model.bytes++;
    if (kind === 'duplicate-path') manifest.index.files.push({ ...manifest.index.files[0] });
    if (kind === 'traversal') manifest.model.path = '../model.onnx';
  });
  await assert.rejects(run('inf02-bundle-verify.mjs', [bundle]));
});

test('builder rechaza metadata incompatible, no publica y retira staging propio', async () => {
  const { dir, source, model } = await fixture();
  const metadataPath = join(source, 'fixture', 'meta.json');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8')); metadata.dimensions = 1;
  await writeFile(metadataPath, JSON.stringify(metadata));
  const output = join(dir, 'rejected');
  await assert.rejects(run('inf02-bundle.mjs', [source, model, output]));
  await assert.rejects(lstat(output), { code: 'ENOENT' });
  assert.equal((await readdir(dir)).filter((name) => name.includes('.tmp-')).length, 0);
});

for (const state of ['ready', 'disabled', 'unavailable', 'http503', 'hang', 'slow-body']) test(`gate ${state}: deadline finito y scanner ready obligatorio`, async () => {
  const server = http.createServer((request, response) => {
    if (state === 'hang') return;
    response.writeHead(state === 'http503' ? 503 : 200, { 'Content-Type': 'application/json' });
    if (state === 'slow-body') { response.write('{'); return; }
    response.end(JSON.stringify({ status: 'ready', detail: { database: { state: 'ready' }, scanner: { state: state === 'http503' ? 'ready' : state } } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const started = performance.now();
  try {
    const result = run('inf02-gate.mjs', [], { READY_URL: `http://127.0.0.1:${server.address().port}/api/ready`, GATE_TIMEOUT_MS: '250', GATE_INTERVAL_MS: '5000' });
    if (state === 'ready') await result; else await assert.rejects(result);
    assert.ok(performance.now() - started < 1_500, 'request/interval no pueden extender el deadline 5 s');
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

for (const timeout of ['NaN', 'Infinity', '0', '-1', '1.5', '1000000']) test(`gate rechaza plazo inválido ${timeout}`, async () => {
  await assert.rejects(run('inf02-gate.mjs', [], { GATE_TIMEOUT_MS: timeout }));
});

test('scratch sin marker se preserva; scratch propio se elimina sin tocar sus fuentes', async () => {
  const { source, model } = await fixture();
  const scratch = `${root}-owned`;
  const unowned = `${root}-unowned`;
  await mkdir(unowned); await writeFile(join(unowned, 'keep.txt'), 'preservar');
  try {
    await assert.rejects(run('inf02-scratch-cleanup.mjs', [unowned]));
    assert.equal(await readFile(join(unowned, 'keep.txt'), 'utf8'), 'preservar');
    await run('inf02-bundle.mjs', [source, model, scratch]);
    await run('inf02-scratch-cleanup.mjs', [scratch]);
    await assert.rejects(lstat(scratch), { code: 'ENOENT' });
    assert.equal((await lstat(model)).size, 1_000_000);
    assert.ok((await readFile(join(source, 'fixture', jsonl))).length > 0);
  } finally { await rm(unowned, { recursive: true }); }
});

test('scratch con symlink se rechaza antes de chmod y preserva fuente', async () => {
  const { source, model } = await fixture();
  const scratch = `${root}-symlink`;
  await run('inf02-bundle.mjs', [source, model, scratch]);
  await chmod(scratch, 0o700); await symlink(model, join(scratch, 'foreign')); await chmod(scratch, 0o555);
  try {
    await assert.rejects(run('inf02-scratch-cleanup.mjs', [scratch]));
    assert.equal((await lstat(scratch)).mode & 0o777, 0o555);
    assert.equal((await lstat(model)).mode & 0o777, 0o644);
  } finally { await chmod(scratch, 0o700); await unlink(join(scratch, 'foreign')); await run('inf02-scratch-cleanup.mjs', [scratch]); }
});

test('cleanup y recreate rechazan env de otro proyecto antes de invocar Docker', async () => {
  const path = join(root, 'private.env');
  await writeFile(path, 'COMPOSE_PROJECT_NAME=inf02-another123\n', { mode: 0o600 });
  await assert.rejects(run('inf02-cleanup.mjs', ['inf02-review1234', path]));
  await assert.rejects(run('inf02-recreate.mjs', ['inf02-review1234', path]));
  assert.ok(await readFile(path, 'utf8'));
});

for (const state of ['headers', 'stream']) test(`HTTPS deadline incluye ${state} colgado`, async () => {
  const keyPath = join(root, `tls-${state}.key`);
  const certPath = join(root, `tls-${state}.pem`);
  await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { timeout: 5_000 });
  const cert = await readFile(certPath);
  const server = https.createServer({ key: await readFile(keyPath), cert }, (request, response) => {
    if (state === 'stream') { response.writeHead(200); response.write('respuesta parcial'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const started = performance.now();
  try {
    await assert.rejects(httpsRequest(new URL(`https://127.0.0.1:${server.address().port}`), { ca: cert }, undefined, 150), /excedió el plazo/);
    assert.ok(performance.now() - started < 1_000);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

test('bundle preserva nombres reales Unicode y espacios sin abrir traversal', async () => {
  const { dir, source, model } = await fixture();
  const { rename } = await import('node:fs/promises');
  await rename(join(source, 'fixture'), join(source, "HS—Triumphant & Champion's Path"));
  const output = join(dir, 'named');
  await run('inf02-bundle.mjs', [source, model, output]);
  assert.equal(JSON.parse((await run('inf02-bundle-verify.mjs', [output])).stdout).entries, 2);
});

for (const scenario of ['exclusive', 'shared', 'foreign-label', 'wrong-service']) test(`ownership Redis anónimo ${scenario}`, async () => {
  const bin = join(root, `docker-${scenario}`);
  await mkdir(bin);
  const fake = join(bin, 'docker');
  await writeFile(fake, `#!${process.execPath}
const a=process.argv.slice(2), name='a'.repeat(64), id='b'.repeat(64), project='inf02-fixture1234';
if(a[0]==='ps') console.log(a.some(v=>v.startsWith('volume='))&&process.env.CASE==='shared'?id+'\\n'+'c'.repeat(64):id);
else if(a[0]==='inspect') console.log(JSON.stringify([{Id:id,Config:{Labels:{'com.docker.compose.project':project,'com.docker.compose.service':process.env.CASE==='wrong-service'?'backend':'redis'}},Mounts:[{Type:'volume',Name:name,Destination:'/data'}]}]));
else if(a[0]==='volume'&&a[1]==='inspect') console.log(JSON.stringify([{Name:name,Labels:process.env.CASE==='foreign-label'?{'com.docker.volume.anonymous':'','owner':'foreign'}:{'com.docker.volume.anonymous':''}}]));
else if((a[0]==='volume'||a[0]==='network')&&a[1]==='ls') console.log('');
else process.exit(2);
`, { mode: 0o700 });
  const check = exec(process.execPath, ['--input-type=module', '-e', `import {verifyProjectResources} from ${JSON.stringify(join(scripts, 'inf02-project.mjs'))};console.log(JSON.stringify(verifyProjectResources('inf02-fixture1234',true)));`], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CASE: scenario }, timeout: 8_000 });
  if (scenario === 'exclusive') assert.deepEqual(JSON.parse((await check).stdout).anonymousVolumes, ['a'.repeat(64)]);
  else await assert.rejects(check);
});

for (const variant of ['missing', 'incompatible']) test(`artefacto negativo ${variant} conserva marker y permite cleanup propio`, async () => {
  const { bundle } = await fixture();
  const output = `/private/tmp/inf02-negative-${variant}`;
  let created = false;
  try {
    await run('inf02-negative-artifact.mjs', [bundle, variant]);
    created = true;
    const marker = JSON.parse(await readFile(`${output}.inf02-owner.json`, 'utf8'));
    assert.deepEqual(marker.sourcePaths, [bundle]);
    await assert.rejects(run('inf02-bundle-verify.mjs', [output]));
    await run('inf02-scratch-cleanup.mjs', [output]);
    created = false;
    await assert.rejects(lstat(output), { code: 'ENOENT' });
    assert.equal(JSON.parse((await run('inf02-bundle-verify.mjs', [bundle])).stdout).entries, 2);
  } finally { if (created) await run('inf02-scratch-cleanup.mjs', [output]); }
});
