#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { safePath } from './inf03-common.mjs';
import { initializeSchedule, LocalSimulatedSchedule } from './inf03-schedule-common.mjs';

const fail = () => { throw new Error('INF03_SCHEDULE_UNVERIFIED'); };
const flags = ['--mode', '--schedule', '--starts-at', '--cadence-ms', '--repository', '--inventory', '--inventory-checkpoint', '--objects', '--store', '--anchor', '--suppression-journal', '--suppression-checkpoint', '--run', '--container', '--database', '--db-user', '--recipient', '--age'];

// El grupo contiene también los subprocess locales del backup. Se espera close después de matar;
// no se devuelve timeout dejando promesas o procesos locales escribiendo en segundo plano.
async function runBackup(args, deadlineMs) {
  if (process.platform === 'win32') fail();
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./inf03-backup.mjs', import.meta.url)), ...args], { detached: true, stdio: ['ignore', 'ignore', 'ignore'], env: process.env });
    let failed = false;
    const kill = () => {
      failed = true;
      if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') failed = true; } }
    };
    const timer = setTimeout(kill, Math.min(deadlineMs, 600_000));
    child.on('error', () => { failed = true; });
    child.on('close', async code => {
      clearTimeout(timer);
      // close acredita el hijo directo. También exigimos que desaparezca su grupo local.
      const until = Date.now() + 5000;
      let alive = false;
      do {
        alive = false;
        if (child.pid) {
          try { process.kill(-child.pid, 0); alive = true; } catch (error) { if (error.code !== 'ESRCH') alive = true; }
        }
        if (alive) { kill(); await new Promise(done => setTimeout(done, 25)); }
      } while (alive && Date.now() < until);
      if (alive || failed || code !== 0) {
        const error = new Error('INF03_SCHEDULE_UNVERIFIED');
        // Un grupo que no se pudo drenar conserva el lock del calendario para intervención.
        error.unsettledProcessGroup = alive;
        reject(error);
      } else resolve();
    });
  });
}

try {
  const args = process.argv.slice(2), command = args[0];
  if (!['init', 'plan', 'cycle'].includes(command)) fail();
  const values = new Map(); let apply = false;
  for (let i = 1; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--apply') { if (apply || command !== 'cycle') fail(); apply = true; continue; }
    if (!flags.includes(flag) || values.has(flag) || !args[i + 1] || args[i + 1].startsWith('--') || args[i + 1].includes('://') || args[i + 1].includes('\0')) fail();
    values.set(flag, args[++i]);
  }
  if (flags.some(flag => !values.has(flag)) || !/^[1-9][0-9]{0,9}$/.test(values.get('--cadence-ms'))) fail();
  const get = key => values.get(key), env = process.env;
  const journalFactory = async config => {
    const { LocalSuppressionJournal } = await import('../backend/dist/modules/account-deletion/suppression-journal.js');
    return new LocalSuppressionJournal(config);
  };
  const config = {
    mode: get('--mode'), directory: get('--schedule'), key: env.INF03_SCHEDULE_HMAC_KEY, startsAt: get('--starts-at'), cadenceMs: Number(get('--cadence-ms')),
    inventoryConfig: { repository: get('--repository'), inventory: get('--inventory'), checkpoint: get('--inventory-checkpoint'), key: env.INF03_INVENTORY_HMAC_KEY },
    objects: get('--objects'), transferKey: env.INF03_TRANSFER_HMAC_KEY, store: get('--store'), anchor: get('--anchor'), custodyKey: env.INF03_CUSTODY_HMAC_KEY,
    journalConfig: { journalDirectory: get('--suppression-journal'), checkpointDirectory: get('--suppression-checkpoint'), hmacKey: env.INF03_SUPPRESSION_HMAC_KEY }, journalFactory,
    source: { runId: get('--run'), container: get('--container'), database: get('--database'), user: get('--db-user'), recipient: get('--recipient'), age: get('--age') },
  };
  await safePath(config.source.age);
  let result;
  if (command === 'init') result = await initializeSchedule(config);
  else {
    const schedule = new LocalSimulatedSchedule(config);
    try {
      await schedule.open();
      const backupArgs = ['--run', config.source.runId, '--container', config.source.container, '--database', config.source.database, '--db-user', config.source.user, '--recipient', config.source.recipient, '--age', config.source.age, '--repository', config.inventoryConfig.repository, '--inventory', config.inventoryConfig.inventory, '--inventory-checkpoint', config.inventoryConfig.checkpoint];
      result = command === 'plan' ? await schedule.plan() : await schedule.cycle({ apply, backup: ({ output, deadlineMs }) => runBackup([...backupArgs, '--output', output], deadlineMs) });
    } finally { await schedule.close(); }
  }
  process.stdout.write(JSON.stringify(result) + '\n');
} catch {
  process.stderr.write('INF03_SCHEDULE_UNVERIFIED\n'); process.exitCode = 1;
}
