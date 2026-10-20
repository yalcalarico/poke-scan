import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { restoreWithSuppressions } from './account-deletion-restore.js';
import type { SuppressionJournal, SuppressionSnapshot } from './suppression-journal.js';

const checkpoint = { version: 1 as const, journalId: 'own', coverageStartsAt: '2026-10-01T00:00:00.000Z', sequence: 1, head: '1'.repeat(64), mac: '2'.repeat(64) };
const snapshot: SuppressionSnapshot = { checkpoint, entries: [{ sequence: 1, userId: 'own-user', acceptedAt: '2026-10-10T00:00:00.000Z', previous: '0'.repeat(64), mac: '1'.repeat(64) }] };
const context = { originalCreatedAt: '2026-10-09T00:00:00.000Z', currentCheckpoint: checkpoint, now: new Date('2026-10-11T00:00:00.000Z') };
function journal(snapshotFn = vi.fn().mockResolvedValue(snapshot)): SuppressionJournal {
  return { open: vi.fn(), close: vi.fn(), accept: vi.fn(), snapshot: snapshotFn };
}
function database(remaining: bigint) {
  const tx = { user: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) }, $queryRaw: vi.fn().mockResolvedValue([{ remaining }]) };
  const transaction = vi.fn(async (work: (value: typeof tx) => Promise<number>) => work(tx));
  return { prisma: { $transaction: transaction } as unknown as PrismaClient, tx, transaction };
}
describe('no reabrir después de replay incierto', () => {
  it('rechaza verificación de cascadas fallida dentro de la transacción', async () => {
    const db = database(1n);
    await expect(restoreWithSuppressions(db.prisma, journal(), context)).rejects.toThrow('RESTORE_SUPPRESSIONS_NOT_APPLIED');
    expect(db.tx.user.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['own-user'] } } });
  });
  it('cabeza que cambia después del replay impide devolver éxito', async () => {
    const db = database(0n);
    const snapshots = vi.fn().mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ ...snapshot, checkpoint: { ...checkpoint, sequence: 2, head: '3'.repeat(64) } });
    await expect(restoreWithSuppressions(db.prisma, journal(snapshots), context)).rejects.toThrow('RESTORE_CHECKPOINT_CHANGED');
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
  it('replay verificado con cabeza vigente puede repetirse', async () => {
    const db = database(0n); const registry = journal();
    await expect(restoreWithSuppressions(db.prisma, registry, context)).resolves.toBe(1);
    db.tx.user.deleteMany.mockResolvedValue({ count: 0 });
    await expect(restoreWithSuppressions(db.prisma, registry, context)).resolves.toBe(0);
  });
  it('no devuelve éxito si el backup vence durante el replay', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-31T00:00:00.000Z'));
      const db = database(0n);
      db.tx.$queryRaw.mockImplementation(async () => {
        vi.setSystemTime(new Date('2026-10-31T00:00:02.000Z'));
        return [{ remaining: 0n }];
      });
      await expect(restoreWithSuppressions(db.prisma, journal(), {
        originalCreatedAt: '2026-10-01T00:00:01.000Z', currentCheckpoint: checkpoint,
      })).rejects.toThrow('RESTORE_BACKUP_EXPIRED_OR_UNVERIFIED');
    } finally { vi.useRealTimers(); }
  });

});
