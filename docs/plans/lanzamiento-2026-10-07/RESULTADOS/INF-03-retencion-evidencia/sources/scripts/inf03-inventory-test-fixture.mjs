import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, chmod, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BackupInventory, initializeInventory } from './inf03-inventory-common.mjs';
const digest = (data) => createHash('sha256').update(data).digest('hex');
export async function fixture(t, options) {
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), 'inf03-inventory-test-')));
  await chmod(base, 0o700);
  const dirs = ['repository', 'inventory', 'checkpoint'];
  for (const dir of dirs) await mkdir(path.join(base, dir), { mode: 0o700 });
  const config = { key: randomUUID(), ...Object.fromEntries(dirs.map((dir) => [dir, path.join(base, dir)])) };
  await initializeInventory(config);
  const inventory = await new BackupInventory(config, options).open();
  t.after(async () => { await inventory.close(); await rm(base, { recursive: true, force: true }); });
  return { base, config, inventory };
}
export async function backup(f, createdAt = new Date(f.inventory.now()).toISOString(), filename = 'own.age', data = randomUUID()) {
  const output = path.join(f.config.repository, filename);
  const manifest = { backupId: randomUUID(), createdAt };
  const receipt = { backupId: manifest.backupId, ciphertextBytes: Buffer.byteLength(data), ciphertextSha256: digest(data), encryption: 'age-v1.2.1', createdAt: new Date().toISOString() };
  await writeFile(output, data, { mode: 0o600, flag: 'wx' });
  await writeFile(output + '.receipt.json', JSON.stringify(receipt) + '\n', { mode: 0o600, flag: 'wx' });
  const record = await f.inventory.registerVerifiedBackup({ manifest, receipt, output });
  return { manifest, receipt, output, record };
}
