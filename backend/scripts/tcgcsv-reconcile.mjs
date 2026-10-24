import { PrismaClient } from '@prisma/client';
import { discoverSetMappings, parseGroups } from '../dist/jobs/tcgcsv/tcgcsv.discovery.js';
import { PriceSyncRegistryService } from '../dist/jobs/price-sync-registry.service.js';

// Usa sólo el catálogo ya recibido: no descarga ni altera reservas de archivos.
export async function reconcile(prisma) {
  if (process.env.ENABLE_TCGCSV_INGESTION !== 'true') throw new Error('La ingesta TCGCSV está deshabilitada');
  const report = await prisma.$transaction(async (tx) => {
    const state = await tx.tcgcsvDiscoveryState.findUnique({ where: { id: 'global' } });
    if (!state?.groupsJson || !state.groupsBuild) throw new Error('Falta un catálogo de grupos validado');
    const sets = await tx.$queryRaw`SELECT s.id, s.name, s.series, BOOL_AND(COALESCE(c.language = 'en', false)) AS "englishOnly"
      FROM card_sets s JOIN cards c ON c."setId" = s.id GROUP BY s.id`;
    const existing = await tx.$queryRaw`SELECT "setId", "externalId"::int AS "groupId" FROM tcgcsv_set_mappings
      WHERE "externalId" ~ '^[1-9][0-9]{0,8}$'`;
    const result = discoverSetMappings(sets, parseGroups(state.groupsJson), existing);
    if (result.mappings.length) await tx.tcgcsvSetGroup.createMany({ data: result.mappings, skipDuplicates: true });
    await tx.tcgcsvDiscoveryState.update({ where: { id: 'global' }, data: { report: result } });
    return result;
  }, { isolationLevel: 'Serializable' });
  const inserted = await new PriceSyncRegistryService(prisma).reconcileValidatedSets();
  return { associatedSets: report.mappings.length, missing: report.missing, insertedDailySets: inserted,
    note: 'Registro ampliado; sólo el worker existente descarga y publica. Reservas y bajas manuales intactas.' };
}

const p = new PrismaClient();
try {
  if (process.argv.slice(2).filter((a) => a !== '--').join(' ') !== '--apply') throw new Error('Usá --apply para reconciliar el catálogo almacenado');
  console.log(JSON.stringify(await reconcile(p), null, 2));
} catch (error) { console.error(error instanceof Error ? error.message : 'No se pudo reconciliar TCGCSV'); process.exitCode = 1; }
finally { await p.$disconnect(); }
