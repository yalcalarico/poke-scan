import { Prisma, type PrismaClient } from '@prisma/client';
import type { SuppressionCheckpoint, SuppressionJournal, SuppressionSnapshot } from './suppression-journal.js';

/** Se recibe de custodia actual ajena al snapshot, nunca del paquete a restaurar. */
export interface TrustedRestoreContext { originalCreatedAt: string; currentCheckpoint: SuppressionCheckpoint; now?: Date }
export function validateBackupOriginalCreation(originalCreatedAt: string, now = new Date()): void {
  const date = Date.parse(originalCreatedAt);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(date) || new Date(date).toISOString() !== originalCreatedAt || date > now.getTime() || now.getTime() - date >= 30 * 86400_000) {
    throw new Error('RESTORE_BACKUP_EXPIRED_OR_UNVERIFIED');
  }
}
export async function applyAndVerifySuppressions(prisma: Pick<PrismaClient, '$transaction'>, snapshot: SuppressionSnapshot): Promise<number> {
  const ids = [...new Set(snapshot.entries.map((entry) => entry.userId))];
  if (!ids.length) return 0;
  return prisma.$transaction(async (tx) => {
    // Un solo borrado, cascadas personales; no se toca catálogo ni colas globales.
    const deleted = await tx.user.deleteMany({ where: { id: { in: ids } } });
    const rows = await tx.$queryRaw<Array<{ remaining: bigint }>>(Prisma.sql`
      SELECT (
        (SELECT count(*) FROM users WHERE id = ANY(${ids}::text[])) +
        (SELECT count(*) FROM collections WHERE "userId" = ANY(${ids}::text[])) +
        (SELECT count(*) FROM refresh_tokens WHERE "userId" = ANY(${ids}::text[])) +
        (SELECT count(*) FROM password_recovery_tokens WHERE "userId" = ANY(${ids}::text[])) +
        (SELECT count(*) FROM portfolio_snapshots WHERE "userId" = ANY(${ids}::text[])) +
        (SELECT count(*) FROM collection_item_add_operations WHERE "userId" = ANY(${ids}::text[])) +
        (SELECT count(*) FROM share_links WHERE "userId" = ANY(${ids}::text[])) +
        (SELECT count(*) FROM scan_jobs WHERE "userId" = ANY(${ids}::text[])) +
        (SELECT count(*) FROM friendships WHERE "requesterId" = ANY(${ids}::text[]) OR "addresseeId" = ANY(${ids}::text[]))
      )::bigint AS remaining`);
    if (rows[0]?.remaining !== 0n) throw new Error('RESTORE_SUPPRESSIONS_NOT_APPLIED');
    return deleted.count;
  }, { timeout: 30_000 });
}
/** Ejecutar con destino confiado y tráfico cerrado. No habilita tráfico por sí mismo. */
export async function restoreWithSuppressions(prisma: Pick<PrismaClient, '$transaction'>, journal: SuppressionJournal, context: TrustedRestoreContext): Promise<number> {
  validateBackupOriginalCreation(context.originalCreatedAt, context.now);
  const snapshot = await journal.snapshot();
  if (JSON.stringify(snapshot.checkpoint) !== JSON.stringify(context.currentCheckpoint) || Date.parse(snapshot.checkpoint.coverageStartsAt) > Date.parse(context.originalCreatedAt)) {
    throw new Error('RESTORE_CHECKPOINT_OR_COVERAGE_UNVERIFIED');
  }
  const deleted = await applyAndVerifySuppressions(prisma, snapshot);
  // Si el registro cambió durante replay, el operador debe repetir antes de abrir.
  if (JSON.stringify((await journal.snapshot()).checkpoint) !== JSON.stringify(context.currentCheckpoint)) throw new Error('RESTORE_CHECKPOINT_CHANGED');
  return deleted;
}
