import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

export function docker(args, options = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', timeout: 240_000, ...options });
}

export function assertLegacyConfiguration(contents, containers = []) {
  if (/^(?:INF02_CUSTODY_PROFILE|CUSTODY_PACKAGE_DIR|CUSTODY_RUNTIME_ENV_FILE|CUSTODY_BACKEND_IMAGE)=.+$/m.test(contents)
    || containers.some(item => item.Config?.Env?.includes('ACCOUNT_DELETION_CUSTODY_MODE=local-simulated'))) {
    throw new Error('La variante custodia requiere su overlay y gate explícitos; el helper base no puede recrearla.');
  }
}

export function assertLegacyRuntime(project) {
  const ids = docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`, '--filter', 'label=com.docker.compose.service=backend']).trim().split('\n').filter(Boolean);
  if (ids.length) assertLegacyConfiguration('', JSON.parse(docker(['inspect', ...ids])));
}

export async function projectContext(project, envFile, { cleanupOnly = false } = {}) {
  if (!/^inf02-[a-z0-9-]{8,48}$/.test(project ?? '')) throw new Error('Identidad de proyecto INF02 inválida.');
  const path = resolve(envFile ?? '');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || await realpath(path) !== path || (info.mode & 0o077) !== 0 || info.uid !== process.getuid()) throw new Error('El env debe ser privado 0600, propio y sin symlinks.');
  const contents = await readFile(path, 'utf8');
  if (!cleanupOnly) assertLegacyConfiguration(contents);
  const identities = [...contents.matchAll(/^COMPOSE_PROJECT_NAME=(.*)$/gm)];
  if (identities.length !== 1 || identities[0][1] !== project) throw new Error('El env no pertenece al proyecto explícito.');
  return { path, compose: ['compose', '-p', project, '--env-file', path, '-f', 'infra/inf02/compose.yaml'] };
}

export function verifyProjectResources(project, requireContainers = false) {
  const ids = docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`]).trim().split('\n').filter(Boolean);
  if (requireContainers && !ids.length) throw new Error('No hay contenedores propios para recrear.');
  const services = new Set(['db', 'redis', 'migrate', 'fixture', 'backend', 'gate', 'frontend', 'gateway']);
  const anonymousVolumes = [];
  for (const id of ids) {
    const [container] = JSON.parse(docker(['inspect', id]));
    const labels = container.Config.Labels;
    if (labels?.['com.docker.compose.project'] !== project || !services.has(labels['com.docker.compose.service'])) throw new Error('Contenedor fuera de la reserva INF02.');
    for (const mount of container.Mounts.filter((mount) => mount.Type === 'volume')) {
      if ([`${project}_dbdata`, `${project}_caddydata`, `${project}_caddyconfig`].includes(mount.Name)) continue;
      // Redis anterior al tmpfs creó /data anónimo; sólo admitirlo si sigue siendo exclusivo.
      if (labels['com.docker.compose.service'] !== 'redis' || mount.Destination !== '/data' || !/^[a-f0-9]{64}$/.test(mount.Name)) throw new Error('El contenedor monta un volumen ajeno.');
      const [volume] = JSON.parse(docker(['volume', 'inspect', mount.Name]));
      const volumeLabels = volume.Labels ?? {};
      const consumers = docker(['ps', '-aq', '--filter', `volume=${mount.Name}`]).trim().split('\n').filter(Boolean);
      if (volume.Name !== mount.Name || !Object.hasOwn(volumeLabels, 'com.docker.volume.anonymous') || Object.keys(volumeLabels).some((key) => key !== 'com.docker.volume.anonymous') || consumers.length !== 1 || !container.Id.startsWith(consumers[0])) throw new Error('Volumen Redis anónimo no exclusivo o sin identidad Docker.');
      anonymousVolumes.push(mount.Name);
    }
  }
  for (const [kind, allowed] of [['volume', ['dbdata', 'caddydata', 'caddyconfig']], ['network', ['private', 'ingress']]]) {
    const names = docker([kind, 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`]).trim().split('\n').filter(Boolean);
    for (const name of names) {
      const [resource] = JSON.parse(docker([kind, 'inspect', name]));
      const label = resource.Labels?.[`com.docker.compose.${kind}`];
      if (resource.Labels?.['com.docker.compose.project'] !== project || !allowed.includes(label) || resource.Name !== `${project}_${label}`) throw new Error('Red/volumen fuera de la reserva INF02.');
      if (kind === 'network' && (Object.keys(resource.Containers ?? {}).some((id) => !ids.some((own) => id.startsWith(own))) || (label === 'private' && resource.Internal !== true))) throw new Error('La red tiene conexiones ajenas o perdió aislamiento.');
    }
  }
  return { containerIds: ids, anonymousVolumes };
}

export function removeVerifiedAnonymousVolumes(names) {
  for (const name of names) {
    if (!/^[a-f0-9]{64}$/.test(name)) throw new Error('Identidad anónima inválida.');
    const [volume] = JSON.parse(docker(['volume', 'inspect', name]));
    const labels = volume.Labels ?? {};
    if (volume.Name !== name || !Object.hasOwn(labels, 'com.docker.volume.anonymous') || Object.keys(labels).some((key) => key !== 'com.docker.volume.anonymous') || docker(['ps', '-aq', '--filter', `volume=${name}`]).trim()) throw new Error('Volumen anónimo ocupado o con etiquetas ajenas.');
    docker(['volume', 'rm', name]);
  }
}
