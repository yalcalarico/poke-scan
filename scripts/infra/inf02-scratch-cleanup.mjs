#!/usr/bin/env node
import { chmod, lstat, readFile, readdir, rm, realpath } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
const path = process.argv[2] && resolve(process.argv[2]);
if (!path || !/^\/private\/tmp\/inf02-[a-z0-9-]+$/.test(path)) throw new Error('Solo se permite un scratch /private/tmp/inf02-* explícito.');
if (await realpath(path) !== path || await realpath(dirname(path)) !== '/private/tmp') throw new Error('Scratch con symlink o parent inesperado.');
const markerPath = `${path}.inf02-owner.json`;
const markerInfo = await lstat(markerPath);
const rootInfo = await lstat(path);
if (!markerInfo.isFile() || markerInfo.isSymbolicLink() || (markerInfo.mode & 0o077) !== 0 || markerInfo.uid !== process.getuid()) throw new Error('Falta marcador propio privado regular.');
const marker = JSON.parse(await readFile(markerPath, 'utf8'));
if (marker.schemaVersion !== 2 || marker.purpose !== 'inf02-scratch' || marker.outputPath !== path || typeof marker.artifactId !== 'string' || !marker.artifactId.startsWith('dinov2-small-int8-') || marker.rootDevice !== rootInfo.dev || marker.rootInode !== rootInfo.ino || !Array.isArray(marker.sourcePaths) || !marker.sourcePaths.length || marker.sourcePaths.some((source) => typeof source !== 'string' || !source.startsWith('/') || source === path || source.startsWith(`${path}${sep}`) || path.startsWith(`${source}${sep}`))) throw new Error('Marcador/identidad/fuentes de scratch no coinciden.');
const nodes = [];
async function inspect(target) {
  const info = await lstat(target);
  if (info.isSymbolicLink() || info.uid !== process.getuid() || (!info.isDirectory() && !info.isFile())) throw new Error('Scratch con symlink, tipo u ownership ajeno.');
  nodes.push({ target, directory: info.isDirectory() });
  if (info.isDirectory()) for (const name of await readdir(target)) await inspect(join(target, name));
}
// Validar el árbol completo antes de cambiar un solo permiso o eliminar contenido.
await inspect(path);
for (const { target, directory } of nodes) await chmod(target, directory ? 0o700 : 0o600);
await rm(path, { recursive: true, force: false });
await rm(markerPath, { force: false });
console.log(`Scratch propio ${path} eliminado tras validar identidad, fuentes y árbol.`);
