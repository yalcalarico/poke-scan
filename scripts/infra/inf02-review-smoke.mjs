#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { docker, projectContext, verifyProjectResources } from './inf02-project.mjs';
import { httpsRequest } from './inf02-https.mjs';

const [resumeFlag, resumeSuffix] = process.argv.slice(2);
if (resumeFlag && (resumeFlag !== '--resume' || !/^[a-f0-9]{16}$/.test(resumeSuffix ?? ''))) throw new Error('Uso: inf02-review-smoke.mjs [--resume <id-16hex>].');
const resume = resumeFlag === '--resume';
const suffix = resume ? resumeSuffix : randomBytes(8).toString('hex');
const project = `inf02-review-${suffix}`;
const full = `/private/tmp/inf02-review-full-${suffix}`;
const single = `/private/tmp/inf02-review-one-${suffix}`;
const privateDir = `/private/tmp/inf02-review-private-${suffix}`;
const envFile = join(privateDir, 'runtime.env');
const caFile = join(privateDir, 'ca.pem');
const evidencePath = resolve('docs/plans/lanzamiento-2026-10-07/RESULTADOS/INF-02-review-evidencia.json');
const report = { ticket: 'INF-02', reviewer: 'GPT-6.1 Sol HIGH', gate: 'OPERACION_PENDIENTE', project, observations: {} };
let envCreated = false;
let completed = false;
function node(name, args = [], env = {}) {
  return execFileSync(process.execPath, [resolve('scripts/infra', name), ...args], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 240_000 });
}
function compose(args) { return docker(['compose', '-p', project, '--env-file', envFile, '-f', 'infra/inf02/compose.yaml', ...args]); }
function snapshot() { return docker(['ps', '--format', '{{.Names}}']).trim().split('\n').filter(Boolean).filter((name) => !name.startsWith(`${project}-`)).sort(); }
async function waitHttpsReady(origin, ca) {
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    try {
      const response = await httpsRequest(new URL('/api/ready', origin), { ca }, undefined, Math.min(5_000, Math.max(1, deadline - performance.now())));
      if (response.status === 200 && JSON.parse(response.body).detail?.scanner?.state === 'ready') return response;
    } catch { /* Caddy todavía puede estar abriendo el listener después de compose up. */ }
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, Math.max(0, deadline - performance.now()))));
  }
  throw new Error('Gateway HTTPS no estuvo ready en 15 s.');
}
const before = snapshot();
try { report.previousAttempt = JSON.parse(await readFile(evidencePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (resume) {
  await projectContext(project, envFile);
  verifyProjectResources(project, true);
  envCreated = true;
} else await mkdir(privateDir, { mode: 0o700 });
try {
  const source = resolve('backend/.scanner-index');
  const model = resolve('backend/.scanner-models/dinov2-small-int8.onnx');
  if (!resume) node('inf02-bundle.mjs', [source, model, full]);
  report.observations.fullBundle = JSON.parse(node('inf02-bundle-verify.mjs', [full]));
  if (!resume) node('inf02-bundle.mjs', [source, model, single, '--single-reference']);
  report.observations.singleBundle = JSON.parse(node('inf02-bundle-verify.mjs', [single]));
  const manifest = JSON.parse(await readFile(join(single, 'manifest.json'), 'utf8'));
  report.observations.model = manifest.model;
  report.observations.platform = { buildHost: manifest.buildHost, target: manifest.target };
  report.observations.imageIds = JSON.parse(docker(['image', 'inspect', 'inf02-backend:local', 'inf02-frontend:local'])).map(({ Id, Architecture, Config }) => ({ id: Id, arch: Architecture, user: Config.User }));
  const warmupStarted = performance.now();
  report.observations.fullWarmup = JSON.parse(docker(['run', '--rm', '--network', 'none', '--label', `com.docker.compose.project=${project}`, '--label', 'com.docker.compose.service=gate', '--mount', `type=bind,source=${full},target=/opt/pokescan,readonly`, '--mount', `type=bind,source=${resolve('scripts/infra/inf02-worker-warmup-smoke.mjs')},target=/app/warmup.mjs,readonly`, '-e', 'SCANNER_MODEL=/opt/pokescan/model/dinov2-small-int8.onnx', '-e', 'SCANNER_VISUAL_INDEX_DIR=/opt/pokescan/index', 'inf02-backend:local', 'node', '/app/warmup.mjs']));
  report.observations.fullWarmup.elapsedMs = Math.round(performance.now() - warmupStarted);
  if (!resume) { node('inf02-env.mjs', [project, single, '35444', envFile]); envCreated = true; }
  const values = Object.fromEntries((await readFile(envFile, 'utf8')).trim().split('\n').map((line) => { const pos = line.indexOf('='); return [line.slice(0, pos), line.slice(pos + 1)]; }));
  const started = performance.now();
  if (!resume) node('inf02-start.mjs', [project, envFile]);
  if (resume) report.observations.resumedOwnedStack = true;
  else report.observations.coldStartMs = Math.round(performance.now() - started);
  const services = compose(['ps', '--format', 'json']).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  report.observations.services = services.map(({ Service, State, Health }) => ({ service: Service, state: State, health: Health }));
  const gateway = compose(['ps', '-q', 'gateway']).trim();
  docker(['cp', `${gateway}:/data/caddy/pki/authorities/local/root.crt`, caFile]);
  const ca = await readFile(caFile);
  const ready = await waitHttpsReady(values.PUBLIC_ORIGIN, ca);
  report.observations.readiness = { status: ready.status, body: JSON.parse(ready.body), noStore: ready.headers['cache-control'] === 'no-store' };
  if (ready.status !== 200 || JSON.parse(ready.body).detail.scanner.state !== 'ready') throw new Error('Readiness de fixture no pasó.');
  const env = { ...values, INF02_CA_FILE: caFile, EXPECTED_CARD_ID: manifest.index.fixtureCardId };
  report.observations.auth = JSON.parse(node('inf02-auth-smoke.mjs', [], env));
  report.observations.ssr = JSON.parse(node('inf02-ssr-smoke.mjs', [], env));
  const backend = compose(['ps', '-q', 'backend']).trim();
  const frontend = compose(['ps', '-q', 'frontend']).trim();
  const nativeCode = "const sharp=(await import('sharp')).default;const argon2=(await import('argon2')).default;const {PrismaClient}=await import('@prisma/client');await import('onnxruntime-node');const png=await sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}}).png().toBuffer();if(!await argon2.verify(await argon2.hash('fixture'),'fixture'))throw Error('argon2');const db=new PrismaClient();await db.$queryRawUnsafe('SELECT 1');await db.$disconnect();console.log(JSON.stringify({uid:process.getuid(),node:process.version,onnxImport:true,sharpPng:png.length>0,argon2:true,prismaSelect1:true}));";
  report.observations.native = JSON.parse(docker(['exec', backend, 'node', '--input-type=module', '-e', nativeCode]));
  const egress = docker(['exec', backend, 'node', '-e', "const net=require('node:net');const s=net.connect({host:'192.0.2.1',port:443});const t=setTimeout(()=>s.destroy(new Error('timeout')),500);s.once('connect',()=>{console.log('egress-open');process.exit(1)});s.once('error',()=>{clearTimeout(t);console.log('egress-blocked')});"]);
  report.observations.egress = egress.trim();
  if (report.observations.egress !== 'egress-blocked') throw new Error('Runtime egress abierto.');
  const leakCode = "const fs=require('node:fs'),path=require('node:path');let count=0;function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory())walk(p);else {const s=fs.readFileSync(p).toString();if(/backend:3001|127\\.0\\.0\\.1:1\\/api/.test(s))throw Error('private-host');count++}}}walk('/app/.next/static');if(!fs.existsSync('/app/public/icons/icon-192.png'))throw Error('missing-public');console.log(JSON.stringify({files:count,privateHostFound:false,publicPng:true}));";
  report.observations.browserStatic = JSON.parse(docker(['exec', frontend, 'node', '-e', leakCode]));
  const mountInfo = JSON.parse(docker(['inspect', backend]))[0];
  report.observations.readOnlyArtifact = mountInfo.Mounts.some((mount) => mount.Destination === '/opt/pokescan' && mount.RW === false);
  report.observations.privateNetwork = JSON.parse(docker(['network', 'inspect', `${project}_private`]))[0].Internal;
  const oldBackend = backend;
  node('inf02-recreate.mjs', [project, envFile]);
  const newBackend = compose(['ps', '-q', 'backend']).trim();
  const readyAgain = await waitHttpsReady(values.PUBLIC_ORIGIN, ca);
  report.observations.recreate = { changedGeneration: oldBackend !== newBackend, status: readyAgain.status, gateExit: JSON.parse(docker(['inspect', compose(['ps', '-aq', 'gate']).trim()]))[0].State.ExitCode };
  if (oldBackend === newBackend || readyAgain.status !== 200) throw new Error('Recreate no pasó.');
  completed = true;
} catch (error) {
  report.failure = error instanceof Error ? error.message.split('\n')[0].slice(0, 180) : 'Smoke falló.';
} finally {
  const cleanupErrors = [];
  if (envCreated) {
    try { node('inf02-cleanup.mjs', [project, envFile]); report.observations.cleanup = { resources: 'absent-after-label-verification', operatorBundlePreserved: Boolean(await lstat(single)), unrelatedRunningContainersPreserved: JSON.stringify(before) === JSON.stringify(snapshot()) }; }
    catch { cleanupErrors.push('project'); }
  }
  // Si el stack no se pudo retirar, conservar sus mounts/env/CA para recuperarlo.
  if (!cleanupErrors.length) {
  for (const artifact of [full, single]) {
    try { await lstat(`${artifact}.inf02-owner.json`); node('inf02-scratch-cleanup.mjs', [artifact]); } catch (error) { if (error.code !== 'ENOENT') cleanupErrors.push('scratch'); }
  }
  try { await unlink(caFile); } catch (error) { if (error.code !== 'ENOENT') cleanupErrors.push('CA'); }
  try { if (!(await readdir(privateDir)).length) await rmdir(privateDir); } catch (error) { if (error.code !== 'ENOENT') cleanupErrors.push('private-dir'); }
  }
  report.cleanupErrors = cleanupErrors;
  report.completed = completed && !cleanupErrors.length;
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ completed: report.completed, evidencePath, cleanup: report.observations.cleanup, cleanupErrors }));
  if (!report.completed) process.exitCode = 1;
}
