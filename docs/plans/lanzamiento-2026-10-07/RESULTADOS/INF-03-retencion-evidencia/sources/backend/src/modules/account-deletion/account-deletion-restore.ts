import { Prisma, type PrismaClient } from '@prisma/client';
import type { SuppressionJournal, SuppressionSnapshot } from './suppression-journal.js';
import { suppressionRemainingSql, suppressionUserIds, validateBackupOriginalCreation, validateRestoreSnapshot, type TrustedRestoreContext } from './restore-policy.js';
export { validateBackupOriginalCreation, type TrustedRestoreContext } from './restore-policy.js';

/** Se recibe de custodia actual ajena al snapshot, nunca del paquete a restaurar. */
export async function applyAndVerifySuppressions(prisma: Pick<PrismaClient, '$transaction'>, snapshot: SuppressionSnapshot): Promise<number> {
  const ids = suppressionUserIds(snapshot);
  if (!ids.length) return 0;
  return prisma.$transaction(async (tx) => {
    // Un solo borrado, cascadas personales; no se toca catálogo ni colas globales.
    const deleted = await tx.user.deleteMany({ where: { id: { in: ids } } });
    const rows = await tx.$queryRaw<Array<{ remaining: bigint }>>(Prisma.sql`
      SELECT ${Prisma.raw(suppressionRemainingSql(ids))}::bigint AS remaining`);
    if (rows[0]?.remaining !== 0n) throw new Error('RESTORE_SUPPRESSIONS_NOT_APPLIED');
    return deleted.count;
  }, { timeout: 30_000 });
}
/** Ejecutar con destino confiado y tráfico cerrado. No habilita tráfico por sí mismo. */
export async function restoreWithSuppressions(prisma: Pick<PrismaClient, '$transaction'>, journal: SuppressionJournal, context: TrustedRestoreContext): Promise<number> {
  validateBackupOriginalCreation(context.originalCreatedAt, context.now);
  const snapshot = await journal.snapshot();
  validateRestoreSnapshot(snapshot, context);
  const deleted = await applyAndVerifySuppressions(prisma, snapshot);
  // Si el registro cambió durante replay, el operador debe repetir antes de abrir.
  const finalSnapshot = await journal.snapshot();
  if (JSON.stringify(finalSnapshot.checkpoint) !== JSON.stringify(context.currentCheckpoint)) throw new Error('RESTORE_CHECKPOINT_CHANGED');
  validateRestoreSnapshot(finalSnapshot, context);
  return deleted;
}
