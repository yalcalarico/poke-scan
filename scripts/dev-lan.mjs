#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const certDir = join(root, '.certificates');
const caKey = join(certDir, 'rootCA-key.pem');
const caCert = join(certDir, 'pokescan-rootCA.crt');
const tlsKey = join(certDir, 'server-key.pem');
const tlsCert = join(certDir, 'server.pem');

function openssl(args) {
  const result = spawnSync('openssl', args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`No pudimos generar el certificado. Revisá OpenSSL: ${result.error?.message ?? result.stderr}`);
  }
}

function privateAddress(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function lanAddress() {
  const addresses = Object.entries(networkInterfaces()).flatMap(([name, entries]) =>
    (entries ?? []).filter((entry) => entry.family === 'IPv4' && !entry.internal && privateAddress(entry.address))
      .map((entry) => ({ name, ip: entry.address })),
  );
  if (process.env.LAN_IP) {
    if (isIP(process.env.LAN_IP) !== 4 || !addresses.some(({ ip }) => ip === process.env.LAN_IP)) {
      throw new Error('LAN_IP debe ser una IPv4 privada asignada a esta computadora.');
    }
    return process.env.LAN_IP;
  }
  const candidates = addresses.filter(({ name }) => /^(en\d+|eth\d+|wlan\d+|wl\w+)$/.test(name));
  const choices = candidates.length ? candidates : addresses;
  if (choices.length !== 1) {
    throw new Error(`No pudimos elegir la red local. Usá LAN_IP=<IP> pnpm run dev:lan. Direcciones: ${addresses.map(({ name, ip }) => `${name}: ${ip}`).join(', ') || 'ninguna'}`);
  }
  return choices[0].ip;
}

function port(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(`${name} debe ser un puerto entre 1 y 65535.`);
  }
  return value;
}

function prepareCertificates(ip) {
  mkdirSync(certDir, { recursive: true, mode: 0o700 });
  chmodSync(certDir, 0o700);
  if (existsSync(caKey) !== existsSync(caCert)) {
    throw new Error('La CA local está incompleta. Restaurá sus archivos o borrá .certificates y volvé a instalar la nueva CA en el celu.');
  }
  if (!existsSync(caCert)) {
    const config = join(certDir, 'ca.cnf');
    writeFileSync(config, `[req]\nprompt = no\ndistinguished_name = dn\nx509_extensions = ca\n[dn]\nCN = PokeScan desarrollo local\n[ca]\nbasicConstraints = critical,CA:TRUE,pathlen:0\nkeyUsage = critical,keyCertSign,cRLSign\nsubjectKeyIdentifier = hash\n`, { mode: 0o600 });
    openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650', '-keyout', caKey, '-out', caCert, '-config', config]);
    chmodSync(caKey, 0o600);
  }
  const authority = new X509Certificate(readFileSync(caCert));
  if (Date.parse(authority.validTo) < Date.now() + 86400000 * 366) {
    throw new Error('La CA local está por vencer. Regenerá .certificates y volvé a instalar la nueva CA en el celu.');
  }

  // Conservamos la CA para que el celu siga confiando aunque cambie la IP del Wi-Fi.
  if (existsSync(tlsKey) && existsSync(tlsCert)) {
    const certificate = new X509Certificate(readFileSync(tlsCert));
    if (certificate.checkIP(ip) && certificate.verify(authority.publicKey) && Date.parse(certificate.validTo) > Date.now() + 86400000 * 7) return;
  }
  const config = join(certDir, 'server.cnf');
  const csr = join(certDir, 'server.csr');
  writeFileSync(config, `[req]\nprompt = no\ndistinguished_name = dn\n[dn]\nCN = ${ip}\n[server]\nbasicConstraints = critical,CA:FALSE\nkeyUsage = critical,digitalSignature,keyEncipherment\nextendedKeyUsage = serverAuth\nsubjectAltName = IP:${ip},IP:127.0.0.1,DNS:localhost\nauthorityKeyIdentifier = keyid,issuer\n`, { mode: 0o600 });
  openssl(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-keyout', tlsKey, '-out', csr, '-config', config]);
  chmodSync(tlsKey, 0o600);
  openssl(['x509', '-req', '-in', csr, '-CA', caCert, '-CAkey', caKey, '-CAcreateserial', '-out', tlsCert, '-days', '365', '-sha256', '-extfile', config, '-extensions', 'server']);
  openssl(['verify', '-CAfile', caCert, tlsCert]);
}

try {
  const ip = lanAddress();
  const apiPort = port('API_PORT', '3001');
  const webPort = port('WEB_PORT', '3000');
  prepareCertificates(ip);
  console.log(`\nCelu → https://${ip}:${webPort}/inicio`);
  console.log(`Instalá y confiá este certificado en el celu: ${caCert}`);
  console.log('Guía: docs/local-network.md\n');
  if (!process.argv.includes('--cert-only')) {
    const child = spawn('bash', [join(root, 'scripts/dev.sh')], {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        DEV_LAN_IP: ip,
        DEV_TLS_KEY: tlsKey,
        DEV_TLS_CERT: tlsCert,
        DEV_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}/api`,
        NEXT_PUBLIC_API_URL: '/api',
      },
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', (code) => { process.exitCode = code ?? 1; });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
