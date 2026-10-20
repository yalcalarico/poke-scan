import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fixture, backup } from './inf03-inventory-test-fixture.mjs';
import { initializeLocalSuppressionJournal } from '../backend/dist/modules/account-deletion/suppression-journal.js';
import { RETENTION_MS } from './inf03-inventory-common.mjs';

async function setup(t, originalCreatedAt, coverageStartsAt, clock) {
  const f = await fixture(t, { clock });
  const b = await backup(f, originalCreatedAt);
  await f.inventory.close();
  const journalDirectory = path.join(f.base, 'journal'), checkpointDirectory = path.join(f.base, 'suppression-custody');
  for (const dir of [journalDirectory, checkpointDirectory]) await mkdir(dir, { mode: 0o700 });
  const hmacKey = randomUUID();
  await initializeLocalSuppressionJournal({ journalDirectory, checkpointDirectory, hmacKey }, coverageStartsAt);
  const docker = path.join(f.base, 'docker'), calls = path.join(f.base, 'docker-called');
  // Tripwire sin Docker real: cualquier contacto hace fallar el ensayo.
  await writeFile(docker, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(calls)}, 'contacto');process.exit(91);\n`, { mode: 0o700 });
  const runId = 'inf03-123456abcdef';
  const args = ['scripts/inf03-restore.mjs', '--run', runId, '--container', `${runId}-destination-pg`, '--database', 'inf03_destination', '--db-user', 'inf03_destination', '--marker', `${runId}-destination-fresh`, '--identity', path.join(f.base, 'identity'), '--age', path.join(f.base, 'age'), '--input', b.output, '--receipt', b.output + '.receipt.json', '--repository', f.config.repository, '--inventory', f.config.inventory, '--inventory-checkpoint', f.config.checkpoint, '--suppression-journal', journalDirectory, '--suppression-checkpoint', checkpointDirectory];
  const invoke = ({ legacy = false } = {}) => spawnSync(process.execPath, legacy ? args.slice(0, args.indexOf('--repository')) : args, { encoding: 'utf8', timeout: 10000, env: { ...process.env, PATH: f.base + path.delimiter + process.env.PATH, INF03_INVENTORY_HMAC_KEY: f.config.key, INF03_SUPPRESSION_HMAC_KEY: hmacKey, INF03_DB_PASSWORD: randomUUID() } });
  return { f, b, invoke, calls, checkpointDirectory };
}
test('CLI niega vencimiento original antes de age, Docker/SQL y restored:true', async (t) => {
  const now = Date.now(); const original = new Date(now - RETENTION_MS - 1000).toISOString();
  const s = await setup(t, original, new Date(now - RETENTION_MS - 2000).toISOString(), () => now - RETENTION_MS + 1000);
  const result = s.invoke();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /INF03_INVENTORY_UNVERIFIED/);
  assert.doesNotMatch(result.stdout, /"restored":true/);
  await assert.rejects(stat(s.calls), { code: 'ENOENT' });
  assert.equal(await readFile(s.b.output, 'utf8') !== '', true);
});
test('CLI niega supresiones sin cobertura antes de age, Docker/SQL y reapertura', async (t) => {
  const now = Date.now(); const s = await setup(t, new Date(now - 20000).toISOString(), new Date(now - 10000).toISOString(), Date.now);
  const result = s.invoke();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /RESTORE_CHECKPOINT_OR_COVERAGE_UNVERIFIED/);
  assert.doesNotMatch(result.stdout, /"restored":true/);
  await assert.rejects(stat(s.calls), { code: 'ENOENT' });
});
test('CLI no permite legacy sin custodia ni checkpoint alterado', async (t) => {
  const now = Date.now(); const s = await setup(t, new Date(now - 10000).toISOString(), new Date(now - 20000).toISOString(), Date.now);
  const legacy = s.invoke({ legacy: true });
  assert.notEqual(legacy.status, 0); assert.match(legacy.stderr, /INF03_INVENTORY_UNVERIFIED/); assert.doesNotMatch(legacy.stdout, /"restored":true/);
  await writeFile(path.join(s.checkpointDirectory, 'checkpoint.json'), '{}\n');
  const result = s.invoke();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /SUPPRESSION_REGISTRY_UNVERIFIED/);
  assert.doesNotMatch(result.stdout, /"restored":true/); await assert.rejects(stat(s.calls), { code: 'ENOENT' });
});
