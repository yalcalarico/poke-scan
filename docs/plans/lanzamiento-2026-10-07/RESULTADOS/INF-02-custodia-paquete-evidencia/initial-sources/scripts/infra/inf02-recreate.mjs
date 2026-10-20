#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyBundle } from './inf02-artifacts.mjs';
import { docker, projectContext, verifyProjectResources } from './inf02-project.mjs';
const [project, envFile] = process.argv.slice(2);
const { compose } = await projectContext(project, envFile);
verifyProjectResources(project, true);
const contents = await readFile(envFile, 'utf8');
const artifact = contents.match(/^ARTIFACT_DIR=(.+)$/m)?.[1];
if (!artifact) throw new Error('Falta bundle para recrear.');
await verifyBundle(artifact);
const manifest = JSON.parse(await readFile(join(artifact, 'manifest.json'), 'utf8'));
const imageArch = docker(['image', 'inspect', 'inf02-backend:local', '--format', '{{.Architecture}}']).trim();
if (manifest.target.arch !== imageArch) throw new Error('Bundle e imagen tienen arquitecturas distintas.');
function run(args) { docker([...compose, ...args], { stdio: 'inherit' }); }
run(['stop', 'gateway', 'frontend']);
run(['rm', '-sf', 'gate']);
run(['up', '-d', '--force-recreate', 'backend']);
// up sin -d espera el exit real; no reutiliza un gate de la generación anterior.
run(['up', '--no-deps', '--abort-on-container-exit', '--exit-code-from', 'gate', 'gate']);
run(['up', '-d', 'frontend', 'gateway']);
console.log(`Generación de backend ${project} admitida por gate frío antes de publicar gateway.`);
