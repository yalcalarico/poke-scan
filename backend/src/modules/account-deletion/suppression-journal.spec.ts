import { mkdtemp, realpath, mkdir, readFile, writeFile, chmod, symlink, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalSuppressionJournal, initializeLocalSuppressionJournal, type LocalJournalConfig } from './suppression-journal.js';
import { restoreWithSuppressions, validateBackupOriginalCreation } from './account-deletion-restore.js';
import type { PrismaClient } from '@prisma/client';

const key = 'synthetic-journal-key-for-private-tests-only';
const coverage = '2026-09-01T00:00:00.000Z';
describe('registro privado de supresiones', () => {
  let root: string; let config: LocalJournalConfig; let journal: LocalSuppressionJournal;
  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'pcs-suppression-spec-')));
    await mkdir(join(root, 'journal'), { mode: 0o700 }); await mkdir(join(root, 'custody'), { mode: 0o700 });
    config = { journalDirectory: join(root, 'journal'), checkpointDirectory: join(root, 'custody'), hmacKey: key };
    journal = new LocalSuppressionJournal(config);
  });
  afterEach(async () => { await journal.close(); await rm(root, { recursive: true }); });
  it('no crea génesis al arrancar y no permite reinicializar', async () => {
    await expect(journal.open()).rejects.toThrow();
    await initializeLocalSuppressionJournal(config, coverage);
    await expect(initializeLocalSuppressionJournal(config, coverage)).rejects.toThrow();
  });
  it('serializa duplicados, firma cadena y conserva la supresión al reiniciar', async () => {
    await initializeLocalSuppressionJournal(config, coverage); await journal.open();
    await Promise.all([journal.accept('synthetic-user'), journal.accept('synthetic-user'), journal.accept('other-synthetic-user')]);
    expect((await journal.snapshot()).entries).toHaveLength(2);
    await journal.close(); journal = new LocalSuppressionJournal(config); await journal.open();
    expect((await journal.snapshot()).entries.map((e) => e.userId)).toEqual(['synthetic-user', 'other-synthetic-user']);
    expect(await readFile(join(root, 'journal', 'entries.jsonl'), 'utf8')).not.toMatch(/email|password|token|slug/);
  });
  it('rechaza segundo escritor, incluso con checkpoint compartido por otra carpeta', async () => {
    await initializeLocalSuppressionJournal(config, coverage); await journal.open();
    const second = new LocalSuppressionJournal(config);
    await expect(second.open()).rejects.toThrow(); await second.close();
    await journal.accept('synthetic-user');
  });
  it('lock de crash bloquea, sin borrar archivo ajeno ni adivinar PID', async () => {
    await initializeLocalSuppressionJournal(config, coverage);
    const lock = join(root, 'journal', 'writer.lock'); await writeFile(lock, 'crashed-synthetic-owner', { mode: 0o600 });
    await expect(journal.open()).rejects.toThrow();
    expect(await readFile(lock, 'utf8')).toBe('crashed-synthetic-owner');
  });
  it('rechaza carpeta pública y symlink', async () => {
    await chmod(config.journalDirectory, 0o755); await expect(journal.open()).rejects.toThrow();
    await chmod(config.journalDirectory, 0o700); await symlink(config.journalDirectory, join(root, 'link'));
    const linked = new LocalSuppressionJournal({ ...config, journalDirectory: join(root, 'link') });
    await expect(linked.open()).rejects.toThrow();
  });
  it('detecta parcial/crash entre append durable y checkpoint', async () => {
    await initializeLocalSuppressionJournal(config, coverage); await journal.open();
    await writeFile(join(root, 'journal', 'entries.jsonl'), '{"sequence":1', { mode: 0o600 });
    await expect(journal.snapshot()).rejects.toThrow(); await expect(journal.accept('synthetic-user')).rejects.toThrow();
  });
  it('detecta corrupción y rollback de entradas aunque el HMAC del checkpoint sea válido', async () => {
    await initializeLocalSuppressionJournal(config, coverage); await journal.open(); await journal.accept('synthetic-user');
    await writeFile(join(root, 'journal', 'entries.jsonl'), '', { mode: 0o600 });
    await expect(journal.snapshot()).rejects.toThrow();
  });
  it('checkpoint faltante impide leer o aceptar', async () => {
    await initializeLocalSuppressionJournal(config, coverage); await journal.open(); await unlink(join(root, 'custody', 'checkpoint.json'));
    await expect(journal.snapshot()).rejects.toThrow();
  });
  it('restore rechaza rollback conjunto ante checkpoint vigente de custodia externa', async () => {
    await initializeLocalSuppressionJournal(config, coverage); await journal.open();
    const old = await readFile(join(root, 'custody', 'checkpoint.json'), 'utf8');
    await journal.accept('synthetic-user'); const currentCheckpoint = (await journal.snapshot()).checkpoint;
    await writeFile(join(root, 'custody', 'checkpoint.json'), old, { mode: 0o600 });
    await writeFile(join(root, 'journal', 'entries.jsonl'), '', { mode: 0o600 });
    const tx = vi.fn();
    await expect(restoreWithSuppressions({ $transaction: tx } as unknown as PrismaClient, journal,
      { originalCreatedAt: '2026-10-01T00:00:00.000Z', currentCheckpoint, now: new Date('2026-10-11T00:00:00.000Z') })).rejects.toThrow('RESTORE_CHECKPOINT_OR_COVERAGE_UNVERIFIED');
    expect(tx).not.toHaveBeenCalled();
  });
  it('copia no renueva fecha original: rechaza 30d, futuro, fecha imposible y formato no UTC', () => {
    const now = new Date('2026-10-11T00:00:00.000Z');
    for (const date of ['2026-09-11T00:00:00.000Z', '2026-10-12T00:00:00.000Z', '2026-02-30T00:00:00.000Z', '2026-10-10']) expect(() => validateBackupOriginalCreation(date, now)).toThrow();
    expect(() => validateBackupOriginalCreation('2026-09-11T00:00:00.001Z', now)).not.toThrow();
  });
  it('restore sin cobertura no toca SQL', async () => {
    await initializeLocalSuppressionJournal(config, '2026-10-10T00:00:00.000Z'); await journal.open();
    const checkpoint = (await journal.snapshot()).checkpoint; const tx = vi.fn();
    await expect(restoreWithSuppressions({ $transaction: tx } as unknown as PrismaClient, journal, { originalCreatedAt: '2026-10-09T00:00:00.000Z', currentCheckpoint: checkpoint, now: new Date('2026-10-11T00:00:00.000Z') })).rejects.toThrow();
    expect(tx).not.toHaveBeenCalled();
  });
});
