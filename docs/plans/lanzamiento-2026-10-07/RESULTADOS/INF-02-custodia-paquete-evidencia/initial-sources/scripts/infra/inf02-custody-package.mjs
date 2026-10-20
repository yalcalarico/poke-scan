#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, mkdir, open, lstat, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FILES = [
  'inf03-custody-common.mjs',
  'inf03-inventory-common.mjs',
  'inf03-transfer-common.mjs',
];
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', '..');
const SOURCE = path.join(ROOT, 'scripts');
const fail = (message = 'Paquete de custodia inválido.') => { throw new Error(message); };
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function readRegular(file, expectedUid = process.getuid?.()) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || (expectedUid !== undefined && before.uid !== expectedUid) || before.size < 1 || before.size > MAX_FILE_BYTES) fail('Archivo de custodia fuera de límites o con propietario/enlaces inesperados.');
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (bytes.length !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || after.nlink !== 1) fail('El archivo cambió durante la lectura.');
    return { bytes, stat: after };
  } finally { await handle.close(); }
}

async function safeDirectory(dir, expectedUid = process.getuid?.()) {
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink() || (expectedUid !== undefined && info.uid !== expectedUid) || await realpath(dir) !== dir) fail('Directorio no canónico o con propietario inesperado.');
  return info;
}

async function inspectSource(sourceDir) {
  const root = path.resolve(sourceDir);
  await safeDirectory(root);
  const records = [];
  for (const name of FILES) {
    const file = path.join(root, name);
    const { bytes } = await readRegular(file);
    records.push({ name, bytes: bytes.length, sha256: digest(bytes), layout: `/scripts/${name}` });
  }
  return records;
}

export async function verifyCustodyPackage(directory) {
  const root = path.resolve(directory);
  const rootStat = await safeDirectory(root);
  if ((rootStat.mode & 0o777) !== 0o555) fail('La raíz del paquete debe ser 0555.');
  const entries = (await readdir(root)).sort();
  if (entries.join(',') !== 'manifest.json,scripts') fail('El paquete contiene rutas fuera de la allowlist.');
  const scriptsDir = path.join(root, 'scripts');
  const scriptsStat = await safeDirectory(scriptsDir);
  if ((scriptsStat.mode & 0o777) !== 0o555 || (await readdir(scriptsDir)).sort().join(',') !== FILES.slice().sort().join(',')) fail('El árbol scripts no coincide con la allowlist.');
  const manifestFile = await readRegular(path.join(root, 'manifest.json'));
  const manifestStat = manifestFile.stat;
  if ((manifestStat.mode & 0o777) !== 0o444) fail('El manifiesto debe ser 0444.');
  let manifest;
  try { manifest = JSON.parse(manifestFile.bytes.toString('utf8')); } catch { fail('Manifiesto JSON inválido.'); }
  if (!manifest || Object.keys(manifest).sort().join(',') !== 'files,layout,schemaVersion') fail('El manifiesto contiene campos no permitidos.');
  if (manifest.schemaVersion !== 1 || manifest.layout !== 'absolute-root-scripts' || !Array.isArray(manifest.files) || manifest.files.length !== FILES.length) fail('Forma de manifiesto inesperada.');
  for (let index = 0; index < FILES.length; index += 1) {
    const expectedName = FILES[index];
    const record = manifest.files.find((item) => item?.name === expectedName);
    if (!record || Object.keys(record).sort().join(',') !== 'bytes,layout,name,sha256') fail('Registro con campos no permitidos.');
    if (!record || record.layout !== `/scripts/${expectedName}` || !Number.isSafeInteger(record.bytes) || record.bytes < 1 || record.bytes > MAX_FILE_BYTES || !/^[a-f0-9]{64}$/.test(record.sha256)) fail('Registro de manifiesto fuera de límites.');
    const file = await readRegular(path.join(scriptsDir, expectedName));
    if ((file.stat.mode & 0o777) !== 0o444 || file.bytes.length !== record.bytes || digest(file.bytes) !== record.sha256) fail(`Hash o permisos incorrectos para ${expectedName}.`);
  }
  if (manifest.files.some((item) => !FILES.includes(item.name))) fail('El manifiesto contiene archivos no permitidos.');
  return manifest;
}

export async function packageCustody(sourceDirectory, outputDirectory) {
  const source = path.resolve(sourceDirectory);
  const output = path.resolve(outputDirectory);
  const parent = path.dirname(output);
  if (await realpath(parent) !== parent || output === source || output.startsWith(`${source}${path.sep}`) || source.startsWith(`${output}${path.sep}`)) fail('Origen y destino deben ser canónicos e independientes.');
  const files = await inspectSource(source);
  let rootStat;
  try { await mkdir(output, { mode: 0o700 }); rootStat = await lstat(output); }
  catch (error) { if (error.code === 'EEXIST') fail('El destino ya existe; elegí una ruta nueva.'); throw error; }
  const ownedRoot = { dev: rootStat.dev, ino: rootStat.ino };
  try {
    const scriptsDir = path.join(output, 'scripts');
    await mkdir(scriptsDir, { mode: 0o700 });
    for (const record of files) {
      const { bytes } = await readRegular(path.join(source, record.name));
      if (bytes.length !== record.bytes || digest(bytes) !== record.sha256) fail('Una fuente cambió durante el empaquetado.');
      const handle = await open(path.join(scriptsDir, record.name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      await chmod(path.join(scriptsDir, record.name), 0o444);
    }
    await chmod(scriptsDir, 0o555);
    const manifest = { schemaVersion: 1, layout: 'absolute-root-scripts', files };
    const manifestHandle = await open(path.join(output, 'manifest.json'), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await manifestHandle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`); await manifestHandle.sync(); } finally { await manifestHandle.close(); }
    await chmod(path.join(output, 'manifest.json'), 0o444);
    await chmod(output, 0o555);
    await verifyCustodyPackage(output);
    return manifest;
  } catch (error) {
    try {
      const current = await lstat(output);
      if (current.dev === ownedRoot.dev && current.ino === ownedRoot.ino) {
        await chmod(output, 0o700);
        const scriptsDir = path.join(output, 'scripts');
        try {
          for (const name of await readdir(scriptsDir)) await chmod(path.join(scriptsDir, name), 0o600);
          await chmod(scriptsDir, 0o700);
        } catch {}
        await rm(output, { recursive: true, force: true });
      }
    } catch {}
    throw error;
  }
}

async function main(args) {
  if (args[0] === '--verify' && args.length === 2) {
    const manifest = await verifyCustodyPackage(args[1]);
    console.log(JSON.stringify({ verified: true, files: manifest.files.length, layout: manifest.layout }));
    return;
  }
  if (args.length !== 1) fail('Uso: node scripts/infra/inf02-custody-package.mjs <destino-nuevo> | --verify <paquete>');
  const manifest = await packageCustody(SOURCE, args[0]);
  console.log(JSON.stringify({ package: path.resolve(args[0]), files: manifest.files.length, hashes: manifest.files.map(({ name, sha256 }) => ({ name, sha256 })) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
