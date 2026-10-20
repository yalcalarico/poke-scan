import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { writeFile, readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { BackupInventory, RETENTION_MS } from './inf03-inventory-common.mjs';
import { fixture, backup } from './inf03-inventory-test-fixture.mjs';

test('dry-run por defecto, apply elimina sólo copias propias vencidas y conserva tombstones', async (t) => {
  let now = Date.now(); const clock = () => now;
  const f = await fixture(t, { clock });
  const original = new Date(now - RETENTION_MS + 10000).toISOString();
  const old = await backup(f, original, 'expired.age'); const live = await backup(f, undefined, 'live.age');
  const unrelated = path.join(f.config.repository, 'ajeno.age'); await writeFile(unrelated, 'ajeno', { mode: 0o600 });
  // El clock inyectado pertenece sólo al fixture; el CLI no admite override.
  now += 10000;
  const planned = await f.inventory.prune(); assert.equal(planned.dryRun, true); assert.equal(planned.expired.length, 1);
  await stat(old.output);
  const applied = await f.inventory.prune({ apply: true }); assert.deepEqual(applied.retired, [old.manifest.backupId]);
  await assert.rejects(stat(old.output), { code: 'ENOENT' }); await assert.rejects(stat(old.output + '.receipt.json'), { code: 'ENOENT' });
  await stat(live.output); assert.equal(await readFile(unrelated, 'utf8'), 'ajeno');
  assert.equal(f.inventory.state.records.find((r) => r.backupId === old.manifest.backupId).status, 'retired');
  assert.deepEqual((await f.inventory.prune({ apply: true })).retired, []);
});
test('crash después de cada unlink retoma sólo intención firmada; replay idempotente', async (t) => {
  for (const crashReceipt of [false, true]) {
    let now = Date.now(); const clock = () => now;
    const f = await fixture(t, { clock }); const b = await backup(f, new Date(now - RETENTION_MS + 10000).toISOString());
    now += 20000;
    {
      await assert.rejects(f.inventory.prune({ apply: true, afterUnlink: ({ receipt }) => { if (receipt === crashReceipt) throw new Error('corte simulado'); } }), /corte simulado/);
      assert.equal(f.inventory.state.records[0].status, 'deleting');
      await f.inventory.close();
      const recovered = await new BackupInventory(f.config, { clock }).open();
      try {
        assert.deepEqual((await recovered.prune({ apply: true })).retired, [b.manifest.backupId]);
        assert.deepEqual((await recovered.prune({ apply: true })).retired, []);
        await assert.rejects(recovered.admitRestore(b.output, b.output + '.receipt.json', b.receipt));
      } finally { await recovered.close(); }
    }
  }
});
test('faltante sin intención no se interpreta como retirement; intento manipulado no toca ajenos', async (t) => {
  const f = await fixture(t); const b = await backup(f);
  await unlink(b.output);
  await assert.rejects(f.inventory.prune({ apply: true }));
  assert.equal(f.inventory.state.records[0].status, 'active');
});
test('fallo antes unlink deja ciphertext y recibo disponibles', async (t) => {
  const f = await fixture(t); const b = await backup(f, new Date(Date.now() - RETENTION_MS + 10000).toISOString());
  const checkpoint = path.join(f.config.checkpoint, 'checkpoint.json');
  await writeFile(checkpoint, 'incompleto');
  await assert.rejects(f.inventory.prune({ apply: true })); await stat(b.output); await stat(b.output + '.receipt.json');
});

test('CLI no anuncia una retención exitosa si falla el cierre de custodia', async (t) => {
  const f = await fixture(t); await f.inventory.close();
  const injection = path.join(f.base, 'close-failure.mjs');
  await writeFile(injection, `import { BackupInventory } from ${JSON.stringify(pathToFileURL(path.resolve('scripts/inf03-inventory-common.mjs')).href)};BackupInventory.prototype.close=async function(){throw new Error('cierre simulado');};`, { mode: 0o600 });
  const result = spawnSync(process.execPath, ['--import', injection, 'scripts/inf03-retention.mjs', '--repository', f.config.repository, '--inventory', f.config.inventory, '--inventory-checkpoint', f.config.checkpoint], { encoding: 'utf8', timeout: 10000, env: { ...process.env, INF03_INVENTORY_HMAC_KEY: f.config.key } });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /cierre simulado/);
  assert.equal(result.stdout, '');
});
