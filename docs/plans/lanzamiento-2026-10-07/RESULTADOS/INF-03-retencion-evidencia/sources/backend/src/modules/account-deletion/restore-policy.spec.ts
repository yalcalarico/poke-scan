import { describe, expect, it } from 'vitest';
import { suppressionReplaySql, suppressionRemainingSql, validateRestoreSnapshot } from './restore-policy.js';
import type { SuppressionSnapshot } from './suppression-journal.js';

const checkpoint = { version: 1 as const, journalId: 'own', coverageStartsAt: '2026-10-01T00:00:00.000Z', sequence: 1, head: '1'.repeat(64), mac: '2'.repeat(64) };
const snapshot: SuppressionSnapshot = { checkpoint, entries: [{ sequence: 1, userId: 'own-user', acceptedAt: '2026-10-10T00:00:00.000Z', previous: '0'.repeat(64), mac: '1'.repeat(64) }] };
describe('política de restore común al helper y CLI INF-03', () => {
  it('fecha original y cabeza actual admiten restore sólo antes de30d', () => {
    const context = { originalCreatedAt: '2026-10-01T00:00:00.000Z', currentCheckpoint: checkpoint, now: new Date('2026-10-31T00:00:00.000Z') };
    expect(() => validateRestoreSnapshot(snapshot, context)).toThrow();
    expect(() => validateRestoreSnapshot(snapshot, { ...context, now: new Date('2026-10-30T23:59:59.999Z') })).not.toThrow();
    expect(() => validateRestoreSnapshot(snapshot, { ...context, originalCreatedAt: '2026-11-01T00:00:00.000Z' })).toThrow();
    expect(() => validateRestoreSnapshot(snapshot, { ...context, originalCreatedAt: '2026-02-30T00:00:00.000Z' })).toThrow();
  });
  it('rollback/cobertura ausente bloquean antes de cualquier SQL', () => {
    const context = { originalCreatedAt: '2026-10-09T00:00:00.000Z', currentCheckpoint: checkpoint, now: new Date('2026-10-11T00:00:00.000Z') };
    expect(() => validateRestoreSnapshot({ ...snapshot, checkpoint: { ...checkpoint, head: '3'.repeat(64) } }, context)).toThrow();
    expect(() => validateRestoreSnapshot(snapshot, { ...context, originalCreatedAt: '2026-09-30T00:00:00.000Z' })).toThrow();
  });
  it('SQL fijo borra y verifica todas las relaciones personales en una transacción', () => {
    const sql = suppressionReplaySql(snapshot);
    expect(sql).toMatch(/^BEGIN;/); expect(sql.trim()).toMatch(/COMMIT;$/);
    for (const table of ['users', 'collections', 'refresh_tokens', 'password_recovery_tokens', 'portfolio_snapshots', 'collection_item_add_operations', 'share_links', 'scan_jobs', 'friendships']) expect(sql).toContain(table);
    expect(sql).toContain('RESTORE_SUPPRESSIONS_NOT_APPLIED'); expect(sql).not.toContain('DELETE FROM cards');
    expect(suppressionReplaySql({ checkpoint: { ...checkpoint, sequence: 0 }, entries: [] })).toContain('ARRAY[]::text[]');
    expect(() => suppressionRemainingSql(["injection' ; DELETE FROM cards; --"])).toThrow();
  });
});
