import type { SuppressionCheckpoint, SuppressionSnapshot } from './suppression-journal.js';

/** Custodia vigente ajena al paquete PostgreSQL. */
export interface TrustedRestoreContext { originalCreatedAt: string; currentCheckpoint: SuppressionCheckpoint; now?: Date }
export function validateBackupOriginalCreation(originalCreatedAt: string, now = new Date()): void {
  const date = Date.parse(originalCreatedAt);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(date) || new Date(date).toISOString() !== originalCreatedAt || date > now.getTime() || now.getTime() - date >= 30 * 86400_000) {
    throw new Error('RESTORE_BACKUP_EXPIRED_OR_UNVERIFIED');
  }
}
export function validateRestoreSnapshot(snapshot: SuppressionSnapshot, context: TrustedRestoreContext): void {
  validateBackupOriginalCreation(context.originalCreatedAt, context.now);
  if (JSON.stringify(snapshot.checkpoint) !== JSON.stringify(context.currentCheckpoint) || Date.parse(snapshot.checkpoint.coverageStartsAt) > Date.parse(context.originalCreatedAt)) {
    throw new Error('RESTORE_CHECKPOINT_OR_COVERAGE_UNVERIFIED');
  }
}
export function suppressionUserIds(snapshot: SuppressionSnapshot): string[] {
  const ids = [...new Set(snapshot.entries.map((entry) => entry.userId))];
  if (ids.length > 100_000 || ids.some((id) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id))) throw new Error('RESTORE_SUPPRESSIONS_UNVERIFIED');
  return ids;
}
function idArray(ids: readonly string[]): string {
  if (ids.length > 100_000 || ids.some((id) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id))) throw new Error('RESTORE_SUPPRESSIONS_UNVERIFIED');
  return `ARRAY[${ids.map((id) => `'${id}'`).join(',')}]::text[]`;
}
/** Predicado cerrado común a Prisma y al ensayo Docker sin DSN de host. */
export function suppressionRemainingSql(ids: readonly string[]): string {
  const array = idArray(ids);
  return `(
    (SELECT count(*) FROM users WHERE id = ANY(${array})) +
    (SELECT count(*) FROM collections WHERE "userId" = ANY(${array})) +
    (SELECT count(*) FROM refresh_tokens WHERE "userId" = ANY(${array})) +
    (SELECT count(*) FROM password_recovery_tokens WHERE "userId" = ANY(${array})) +
    (SELECT count(*) FROM portfolio_snapshots WHERE "userId" = ANY(${array})) +
    (SELECT count(*) FROM collection_item_add_operations WHERE "userId" = ANY(${array})) +
    (SELECT count(*) FROM share_links WHERE "userId" = ANY(${array})) +
    (SELECT count(*) FROM scan_jobs WHERE "userId" = ANY(${array})) +
    (SELECT count(*) FROM friendships WHERE "requesterId" = ANY(${array}) OR "addresseeId" = ANY(${array}))
  )`;
}
export function suppressionReplaySql(snapshot: SuppressionSnapshot): string {
  const ids = suppressionUserIds(snapshot);
  // También valida el esquema cuando el registro todavía está vacío.
  return `BEGIN;
SET LOCAL statement_timeout = '30s';
DELETE FROM users WHERE id = ANY(${idArray(ids)});
DO $inf03$ BEGIN
  IF ${suppressionRemainingSql(ids)} <> 0 THEN
    RAISE EXCEPTION 'RESTORE_SUPPRESSIONS_NOT_APPLIED';
  END IF;
END; $inf03$;
COMMIT;`;
}
