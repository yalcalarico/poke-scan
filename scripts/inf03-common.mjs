import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, realpath, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const IMAGE = 'postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4';
export const LIMIT = 128 * 1024 * 1024;
export const fail = (message) => { throw new Error(message); };
export const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024, ...options });
  // stderr puede contener SQL/credenciales: no se reenvía a logs.
  if (result.error || result.status !== 0) fail(`Proceso ${path.basename(command)} rechazado (${result.status ?? 'timeout'}); salida sanitizada.`);
  return result.stdout;
};
export const sha = (data) => createHash('sha256').update(data).digest('hex');
export const hash = async (file) => {
  const digest = createHash('sha256'); let bytes=0;
  for await (const chunk of createReadStream(file)) {bytes+=chunk.length;if(bytes>LIMIT) fail('Archivo excedió límite durante lectura.');digest.update(chunk);}
  return digest.digest('hex');
};
export async function safePath(file, { privateParent = false, mode, max = LIMIT } = {}) {
  const absolute = path.resolve(file);
  // /tmp y /var son aliases del sistema macOS; se resuelve sólo ese prefijo conocido.
  const canonical = process.platform === 'darwin' ? absolute.replace(/^\/tmp(?=\/|$)/, '/private/tmp').replace(/^\/var(?=\/|$)/, '/private/var') : absolute;
  let current = path.parse(canonical).root;
  for (const part of canonical.slice(current.length).split('/').filter(Boolean)) {
    current = path.join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) fail('Ruta con symlink rechazada.');
  }
  const info = await lstat(canonical);
  if (!info.isFile() || info.size > max || (mode !== undefined && (info.mode & 0o777) !== mode)) fail('Archivo/tamaño/permisos incompatibles.');
  if (privateParent && ((await lstat(path.dirname(canonical))).mode & 0o777) !== 0o700) fail('El directorio privado debe tener permisos 0700.');
  return await realpath(canonical);
}
export async function safeDirectory(directory, privateMode=false) {
  const resolved=path.resolve(directory);
  const canonical=process.platform==='darwin'?resolved.replace(/^\/tmp(?=\/|$)/,'/private/tmp').replace(/^\/var(?=\/|$)/,'/private/var'):resolved;
  let current=path.parse(canonical).root;
  for(const part of canonical.slice(current.length).split('/').filter(Boolean)){current=path.join(current,part);const info=await lstat(current);if(!info.isDirectory()||info.isSymbolicLink()) fail('Directorio/symlink incompatible.');}
  if(privateMode&&((await lstat(canonical)).mode&0o777)!==0o700) fail('Directorio privado debe ser 0700.');
  return canonical;
}
export const pgpassText = (database, user, password) => {
  if (!password || /[\r\n\0]/.test(password)) fail('Contraseña no representable en pgpass.');
  return `localhost:5432:${database}:${user}:${password.replaceAll('\\', '\\\\').replaceAll(':', '\\:')}\n`;
};
export const sql = (container, database, text, user = 'postgres') => run('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database, '-At'], { input: text });
export function assertResource(runId, container, role) {
  const info = JSON.parse(run('docker', ['inspect', '--format', '{{json .}}', container]));
  const labels = info.Config.Labels;
  if (labels?.['com.pokescan.inf03.run'] !== runId || labels?.['com.pokescan.inf03.role'] !== role || labels?.['com.pokescan.inf03.project'] !== 'pokemon-cards-scanner-app') fail('Propiedad de contenedor inválida.');
  if (info.Config.Image !== IMAGE || !info.State.Running || info.HostConfig.Privileged || info.HostConfig.NetworkMode === 'host') fail('Imagen/aislamiento de contenedor inválidos.');
  const image = JSON.parse(run('docker', ['image', 'inspect', IMAGE, '--format', '{{json .}}']));
  if (info.Image !== image.Id || !image.RepoDigests.includes(IMAGE)) fail('El runtime no corresponde al digest fijado.');
  if (info.Mounts.length !== 1) fail('Sólo se admite un volumen PostgreSQL propio.');
  const mount = info.Mounts[0];
  if (mount.Destination !== '/var/lib/postgresql/data' || mount.Type !== 'volume' || mount.Name !== `${runId}-${role}-pgdata` || !mount.RW) fail('Volumen PostgreSQL inválido.');
  const volume = JSON.parse(run('docker', ['volume', 'inspect', '--format', '{{json .}}', mount.Name]));
  if (volume.Labels?.['com.pokescan.inf03.run'] !== runId || volume.Labels?.['com.pokescan.inf03.role'] !== role) fail('Propiedad de volumen inválida.');
  const containerIds=run('docker',['ps','-aq']).trim();
  const allContainers=JSON.parse(containerIds?run('docker',['inspect',...containerIds.split('\n')]):'[]');
  if (allContainers.some((other) => other.Id !== info.Id && other.Mounts.some((item) => item.Name === mount.Name))) fail('Volumen compartido rechazado.');
  if (Object.values(info.NetworkSettings.Ports ?? {}).some((bindings) => bindings?.length)) fail('Puertos publicados rechazados.');
  const networks = Object.keys(info.NetworkSettings.Networks);
  if (networks.length !== 1 || networks[0] !== `${runId}-${role}-net`) fail('Red no exclusiva.');
  const network = JSON.parse(run('docker', ['network', 'inspect', '--format', '{{json .}}', networks[0]]));
  if (!network.Internal || network.Labels?.['com.pokescan.inf03.run'] !== runId || network.Labels?.['com.pokescan.inf03.role'] !== role || Object.keys(network.Containers ?? {}).length !== 1 || !network.Containers[info.Id]) fail('Red compartida/no interna rechazada.');
  return info.Id;
}
export function assertDatabase(container, database, user, marker, empty) {
  if (sql(container, database, `SELECT datname||'|'||pg_get_userbyid(datdba)||'|'||coalesce(shobj_description(oid,'pg_database'),'') FROM pg_database WHERE datname=current_database();`).trim() !== `${database}|${user}|${marker}`) fail('Propietario/marcador de base incorrecto.');
  if (sql(container, database, `SELECT rolsuper||'|'||rolcreatedb||'|'||rolcreaterole||'|'||rolcanlogin||'|'||rolreplication||'|'||rolbypassrls||'|'||rolinherit FROM pg_roles WHERE rolname='${user}';`).trim() !== 'false|false|false|true|false|false|false') fail('Rol limitado incompatible.');
  if (sql(container, database, `SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='${user}');`).trim() !== '0') fail('Membresías de rol rechazadas.');
  if (sql(container, database, "SELECT current_setting('server_version_num')::integer/10000;").trim() !== '16' || !/^pg_dump \(PostgreSQL\) 16\./.test(run('docker', ['exec', container, 'pg_dump', '--version']).trim()) || !/^pg_restore \(PostgreSQL\) 16\./.test(run('docker', ['exec', container, 'pg_restore', '--version']).trim())) fail('Major de PostgreSQL incompatible.');
  if (empty && sql(container, database, "SELECT (SELECT count(*) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema'))+(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')+(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')+(SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public');").trim() !== '0') fail('El target tiene objetos preexistentes.');
}
export async function streamToFile(command, args, output, limit = LIMIT) {
  return await new Promise((resolve, reject) => {
    const destination = createWriteStream(output, { flags: 'wx', mode: 0o600 });
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let bytes = 0;
    let childDone = false;
    let fileDone = false;
    let error;
    const timer = setTimeout(() => { error = new Error('Proceso excedió deadline.'); child.kill('SIGKILL'); }, 120_000);
    const finish = () => {
      if (!childDone || !fileDone) return;
      clearTimeout(timer);
      if (error) reject(error); else resolve(bytes);
    };
    child.stdout.on('data', (chunk) => { bytes += chunk.length; if (bytes > limit) { error = new Error('Output excede límite.'); child.kill('SIGKILL'); destination.destroy(); } });
    child.stdout.pipe(destination);
    child.on('error', () => { error = new Error('No se pudo iniciar el proceso.'); childDone = true; destination.destroy(); finish(); });
    child.on('close', (code) => { childDone = true; if (code !== 0) error ??= new Error('Proceso rechazó el input; salida sanitizada.'); finish(); });
    destination.on('error', () => { error ??= new Error('No se pudo guardar output.'); child.kill('SIGKILL'); });
    destination.on('close', () => { fileDone = true; finish(); });
  });
}
export const schemaQuery = `SELECT json_build_object('columns',(SELECT json_agg(row_to_json(x) ORDER BY x.table_name,x.ordinal_position) FROM (SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default,character_maximum_length,numeric_precision,numeric_scale,datetime_precision FROM information_schema.columns WHERE table_schema='public') x),'constraints',(SELECT json_agg(row_to_json(x) ORDER BY x.rel,x.conname) FROM (SELECT c.relname AS rel,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') x),'indexes',(SELECT json_agg(row_to_json(x) ORDER BY x.indexname) FROM (SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public') x));`;
export const schemaFingerprint = (container, database, user) => sha(sql(container, database, schemaQuery, user).trim());
export async function migrations(root = path.resolve('backend/prisma/migrations')) {
  const { readdir } = await import('node:fs/promises');
  return await Promise.all((await readdir(root)).filter((name) => /^\d{14}_[a-z0-9_]+$/.test(name)).sort().map(async (name) => ({ name, checksum: sha(await readFile(path.join(root, name, 'migration.sql'))) })));
}
export function migrationRecords(container, database, user) {
  return JSON.parse(sql(container, database, `SELECT coalesce(json_agg(json_build_object('name',migration_name,'checksum',checksum) ORDER BY migration_name),'[]') FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;`, user).trim());
}
function keys(object, expected) { if (!object || typeof object !== 'object' || Array.isArray(object) || JSON.stringify(Object.keys(object).sort()) !== JSON.stringify(expected.sort())) fail('Manifiesto/recibo: schema estricto inválido.'); }
export function validateReceipt(receipt) {
  keys(receipt, ['backupId', 'ciphertextBytes', 'ciphertextSha256', 'encryption', 'createdAt']);
  if (!/^[a-f0-9-]{36}$/.test(receipt.backupId) || !Number.isSafeInteger(receipt.ciphertextBytes) || receipt.ciphertextBytes < 1 || receipt.ciphertextBytes > LIMIT || !/^[a-f0-9]{64}$/.test(receipt.ciphertextSha256) || receipt.encryption !== 'age-v1.2.1' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(receipt.createdAt)) fail('Recibo incompatible.');
}
export function validateManifest(m) {
  keys(m, ['manifestVersion','backupId','createdAt','source','format','database','migrations','extensions','artifacts','payload','encryption','privacy','fixtureCommit']);
  keys(m.source, ['project','environment','postgresMajor']); keys(m.format, ['kind','compression']); keys(m.database, ['logicalName','schemaFingerprint']); keys(m.artifacts, ['model','index','policy']); keys(m.payload, ['file','bytes','sha256']); keys(m.encryption, ['format','recipientKeyIds']); keys(m.privacy, ['photos','scannerQueryImages','manifestContainsPii','dumpContainsPrivateData']);
  if (m.manifestVersion !== 1 || !/^[a-f0-9-]{36}$/.test(m.backupId) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(m.createdAt) || m.source.project !== 'pokemon-cards-scanner-app' || m.source.environment !== 'synthetic-local' || m.source.postgresMajor !== 16 || m.format.kind !== 'pg_dump-custom' || m.format.compression !== 'pg_dump' || m.database.logicalName !== 'inf03-synthetic' || !/^[a-f0-9]{64}$/.test(m.database.schemaFingerprint) || m.payload.file !== 'database.dump' || !Number.isSafeInteger(m.payload.bytes) || m.payload.bytes < 1 || m.payload.bytes > LIMIT || !/^[a-f0-9]{64}$/.test(m.payload.sha256) || m.encryption.format !== 'age' || !Array.isArray(m.encryption.recipientKeyIds) || m.encryption.recipientKeyIds.length !== 1 || !/^[a-f0-9]{16}$/.test(m.encryption.recipientKeyIds[0]) || m.artifacts.model !== null || m.artifacts.index !== null || m.artifacts.policy !== 'regenerables-o-versionados-aparte' || m.privacy.photos !== false || m.privacy.scannerQueryImages !== false || m.privacy.manifestContainsPii !== false || m.privacy.dumpContainsPrivateData !== true || m.fixtureCommit !== 'INF03-FIXTURE-2') fail('Manifiesto incompatible.');
  if (!Array.isArray(m.migrations) || !m.migrations.length || m.migrations.length > 1000) fail('Migraciones inválidas.');
  for (const item of m.migrations) { keys(item, ['name','checksum']); if (!/^\d{14}_[a-z0-9_]+$/.test(item.name) || !/^[a-f0-9]{64}$/.test(item.checksum)) fail('Migración inválida.'); }
  if (!Array.isArray(m.extensions) || m.extensions.length !== 1) fail('Extensiones inválidas.');
  keys(m.extensions[0], ['name','version']); if (m.extensions[0].name !== 'pg_trgm' || !/^\d+\.\d+$/.test(m.extensions[0].version)) fail('Extensión incompatible.');
}
export async function unpack(file, directory) {
  const data = await readFile(file);
  if (data.length > LIMIT || data.length % 512 !== 0) fail('Tar inseguro: tamaño inválido.');
  let offset = 0; const entries = new Map();
  const octal = (field) => { const text = field.toString('ascii').replaceAll('\0','').trim(); if (!/^[0-7]+$/.test(text)) fail('Tar inseguro: número inválido.'); return parseInt(text,8); };
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0,100).toString('utf8').replace(/\0.*$/s,'');
    const size = octal(header.subarray(124,136));
    const mode = octal(header.subarray(100,108));
    const checksum = octal(header.subarray(148,156));
    const sum = header.reduce((total,byte,i) => total + (i >=148 && i <156 ? 32 : byte),0);
    if (sum !== checksum || !['manifest.json','database.dump'].includes(name) || entries.has(name) || ![0,48].includes(header[156]) || header.subarray(157,257).some((b)=>b!==0) || header.subarray(345,500).some((b)=>b!==0) || mode > 0o777 || size < 1 || size > (name === 'manifest.json' ? 64*1024 : LIMIT) || offset+512+size > data.length) fail('Tar inseguro o allowlist incorrecta.');
    entries.set(name,data.subarray(offset+512,offset+512+size)); offset += 512+Math.ceil(size/512)*512;
  }
  if (entries.size !== 2 || data.length-offset <1024 || data.subarray(offset).some((byte)=>byte!==0)) fail('Tar inseguro: EOF/entradas inválidos.');
  for (const [name, bytes] of entries) await writeFile(path.join(directory,name),bytes,{flag:'wx',mode:0o600});
}
export async function containerStage(container, directory, pgpass, dump) {
  run('docker', ['exec', container, 'mkdir', '-m', '700', directory]);
  run('docker', ['cp', pgpass, `${container}:${directory}/pgpass`]);
  if (dump) run('docker', ['cp', dump, `${container}:${directory}/database.dump`]);
  run('docker', ['exec', container, 'chmod', '600', `${directory}/pgpass`, ...(dump ? [`${directory}/database.dump`] : [])]);
}
export function cleanupStage(container, id, directory) {
  if (run('docker',['inspect','--format','{{.Id}}',container]).trim() !== id) fail('Cleanup rechazado: identidad cambió.');
  run('docker', ['exec', container, 'rm', '-rf', '--', directory]);
}
