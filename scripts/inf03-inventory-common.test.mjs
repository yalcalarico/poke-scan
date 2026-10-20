import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile, readFile, copyFile, unlink, symlink, link, chmod, stat, utimes } from 'node:fs/promises';
import path from 'node:path';
import { BackupInventory, initializeInventory, expired, RETENTION_MS } from './inf03-inventory-common.mjs';

import { fixture, backup } from './inf03-inventory-test-fixture.mjs';
const digest = (data) => createHash('sha256').update(data).digest('hex');
test('fecha original: límite exacto30d, imposible/futuro, copiar/mtime no renueva', async (t) => {
  const now = Date.now(); const date = new Date(now - RETENTION_MS).toISOString();
  assert.equal(expired(date, now), true); assert.equal(expired(new Date(now - RETENTION_MS + 1).toISOString(), now), false);
  for (const value of ['2026-02-30T00:00:00.000Z', '2026-10-10', new Date(now + 1).toISOString()]) assert.throws(() => expired(value, now));
  const f = await fixture(t); const b = await backup(f, new Date(now - RETENTION_MS + 5000).toISOString());
  const copied = path.join(f.base, 'copy.age'); await copyFile(b.output, copied); await chmod(copied, 0o600);
  await assert.rejects(f.inventory.admitRestore(copied, b.output + '.receipt.json', b.receipt));
  await utimes(b.output, new Date(), new Date());
  const admitted = await f.inventory.admitRestore(b.output, b.output + '.receipt.json', b.receipt, b.manifest);
  assert.equal(admitted.originalCreatedAt, b.manifest.createdAt);
});
test('lock exclusivo e init explícito no reemplazable', async (t) => {
  const f = await fixture(t);
  await assert.rejects(new BackupInventory(f.config).open()); await assert.rejects(initializeInventory(f.config));
  await assert.rejects(new BackupInventory({ ...f.config, checkpoint: f.config.repository }).open());
});
test('sin inventario/checkpoint/marker disponible se rechaza', async (t) => {
  for (const [dir, name] of [['inventory', 'inventory.json'], ['checkpoint', 'checkpoint.json'], ['repository', '.inf03-repository.json']]) {
    const f = await fixture(t); await f.inventory.close(); await unlink(path.join(f.config[dir], name));
    await assert.rejects(new BackupInventory(f.config).open());
  }
});
test('HMAC alterado y rollback parcial frente a custodia actual fallan cerrado', async (t) => {
  const f = await fixture(t); const old = await readFile(path.join(f.config.inventory, 'inventory.json'));
  await backup(f); await f.inventory.close();
  await writeFile(path.join(f.config.inventory, 'inventory.json'), old);
  await assert.rejects(new BackupInventory(f.config).open());
  await writeFile(path.join(f.config.inventory, 'inventory.json'), '{"body":{},"mac":"' + '0'.repeat(64) + '"}\n');
  await assert.rejects(new BackupInventory(f.config).open());
});
test('duplicados de UUID y ciphertext y metadata discordante son rechazados', async (t) => {
  const f = await fixture(t); const b = await backup(f, undefined, 'one.age', 'fixed-cipher');
  await assert.rejects(backup(f, undefined, 'two.age', 'fixed-cipher'));
  await assert.rejects(f.inventory.admitRestore(b.output, b.output + '.receipt.json', { ...b.receipt, ciphertextBytes: 1 }));
  await assert.rejects(f.inventory.admitRestore(b.output, b.output + '.receipt.json', b.receipt, { ...b.manifest, createdAt: new Date(Date.now() - 1).toISOString() }));
  const third = path.join(f.config.repository, 'three.age'); const receipt = { ...b.receipt, ciphertextSha256: digest('new'), ciphertextBytes: 3 };
  await writeFile(third, 'new', { mode: 0o600 }); await writeFile(third + '.receipt.json', JSON.stringify(receipt) + '\n', { mode: 0o600 });
  await assert.rejects(f.inventory.registerVerifiedBackup({ output: third, manifest: b.manifest, receipt }));
});
test('ciphertext/recibo ausente, alterado, symlink o hardlink bloquea prune y restore', async (t) => {
  for (const kind of ['missing', 'tampered', 'symlink', 'hardlink', 'receipt-hardlink', 'mode']) {
    const f = await fixture(t); const b = await backup(f);
    if (kind === 'missing') await unlink(b.output);
    if (kind === 'tampered') await writeFile(b.output, 'alterado');
    if (kind === 'symlink') { await unlink(b.output); await symlink(path.join(f.base, 'ajeno'), b.output); }
    if (kind === 'hardlink') await link(b.output, path.join(f.base, 'hardlink'));
    if (kind === 'receipt-hardlink') await link(b.output + '.receipt.json', path.join(f.base, 'hardlink'));
    if (kind === 'mode') await chmod(b.output, 0o644);
    await assert.rejects(f.inventory.prune({ apply: true }));
    await assert.rejects(f.inventory.admitRestore(b.output, b.output + '.receipt.json', b.receipt));
  }
});
test('directorio/inventario symlink, hardlink y permisos públicos no se admiten', async (t) => {
  const f = await fixture(t); await f.inventory.close();
  const alias = path.join(f.base, 'alias'); await symlink(f.config.inventory, alias);
  await assert.rejects(new BackupInventory({ ...f.config, inventory: alias }).open());
  await link(path.join(f.config.inventory, 'inventory.json'), path.join(f.base, 'link'));
  await assert.rejects(new BackupInventory(f.config).open()); await unlink(path.join(f.base, 'link'));
  await chmod(f.config.inventory, 0o755); await assert.rejects(new BackupInventory(f.config).open());
});
test('archivo ajeno no puede registrarse desde afuera ni por traversal', async (t) => {
  const f = await fixture(t); const b = await backup(f);
  await assert.rejects(f.inventory.registerVerifiedBackup({ ...b, output: path.join(f.base, '../ajeno.age') }));
  assert.equal((await stat(b.output)).isFile(), true);
});

