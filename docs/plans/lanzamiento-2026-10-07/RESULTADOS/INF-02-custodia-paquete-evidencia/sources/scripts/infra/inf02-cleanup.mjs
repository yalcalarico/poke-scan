#!/usr/bin/env node
import { unlink } from 'node:fs/promises';
import { docker, projectContext, removeVerifiedAnonymousVolumes, verifyProjectResources } from './inf02-project.mjs';
const [project, envFile] = process.argv.slice(2);
const { compose, path } = await projectContext(project, envFile, { cleanupOnly: true });
const { anonymousVolumes } = verifyProjectResources(project);
docker([...compose, 'down', '--volumes', '--remove-orphans'], { stdio: 'inherit' });
const containers = docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`]).trim();
const volumes = docker(['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`]).trim();
const networks = docker(['network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`]).trim();
const existingVolumes = docker(['volume', 'ls', '-q']).trim().split('\n');
removeVerifiedAnonymousVolumes(anonymousVolumes.filter((name) => existingVolumes.includes(name)));
const remainingVolumes = docker(['volume', 'ls', '-q']).trim().split('\n');
if (containers || volumes || networks || anonymousVolumes.some((name) => remainingVolumes.includes(name))) throw new Error('Cleanup incompleto; env privado conservado para diagnóstico.');
await unlink(path);
console.log(`Proyecto ${project}: recursos propios eliminados y ausencia verificada; env eliminado. ARTIFACT_DIR se conserva.`);
