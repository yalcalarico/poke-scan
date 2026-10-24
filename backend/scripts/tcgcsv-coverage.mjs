import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';

export function mappingState(setId, mappings) {
  const groups = [...new Set(mappings.filter((row) => row.setId === setId).map((row) => row.externalId))];
  if (!groups.length) return 'unmapped';
  if (groups.length !== 1 || !/^[1-9]\d{0,8}$/.test(groups[0])) return 'ambiguous';
  const group = groups[0];
  const siblings = mappings.filter((row) => row.externalId === group).map((row) => row.setId);
  const compatible = [...new Set(siblings)].length <= 1
    || (group === '1543' && siblings.every((id) => ['tk1a', 'tk1b'].includes(id)))
    || (group === '1542' && siblings.every((id) => ['tk2a', 'tk2b'].includes(id)));
  if (!compatible || mappings.some((row) => siblings.includes(row.setId) && row.externalId !== group)) return 'ambiguous';
  return 'associated';
}

export async function readCoverage(prisma) {
  const [sets, traffic, pending, estimates, mappings] = await prisma.$transaction([
    prisma.$queryRaw`
      WITH latest AS (
        SELECT DISTINCT ON ("cardId", variant) "cardId", variant, market, "fetchedAt", "feedPublishedAt"
        FROM card_prices WHERE provider = 'tcgcsv' AND source = 'tcgplayer' AND currency = 'USD'
        ORDER BY "cardId", variant, "fetchedAt" DESC, id DESC
      ), coverage AS (
        SELECT c."setId", COUNT(DISTINCT c.id)::int AS cards,
          COUNT(DISTINCT c.id) FILTER (WHERE p.market IS NOT NULL)::int AS "quotedCards",
          COUNT(p.variant)::int AS "observedVariants",
          COUNT(p.variant) FILTER (WHERE p.market IS NOT NULL)::int AS "quotedVariants",
          COUNT(p.variant) FILTER (WHERE p.market IS NULL)::int AS "nullVariants",
          COUNT(DISTINCT c.id) FILTER (WHERE p.market IS NOT NULL AND p."feedPublishedAt" >= NOW() - INTERVAL '24 hours')::int AS "freshCards",
          MIN(p."feedPublishedAt") AS "oldestFeed", MAX(p."feedPublishedAt") AS "newestFeed", MAX(p."fetchedAt") AS "lastReceivedAt"
        FROM cards c LEFT JOIN latest p ON p."cardId" = c.id GROUP BY c."setId"
      )
      SELECT s.id AS "setId", s.name, r.enabled, r.priority, c.*,
        ARRAY(SELECT DISTINCT "externalId" FROM tcgcsv_set_mappings x WHERE x."setId" = s.id ORDER BY "externalId") AS groups,
        d.status AS "dailyStatus", CASE WHEN d."lastError" IS NULL THEN NULL ELSE 'Fallo registrado' END AS "dailyError"
      FROM card_sets s JOIN coverage c ON c."setId" = s.id LEFT JOIN price_sync_sets r ON r."setId" = s.id
      LEFT JOIN price_sync_set_days d ON d."setId" = s.id AND d.provider = 'tcgcsv' AND d."syncDate" = (NOW() AT TIME ZONE 'UTC')::date
      ORDER BY s.id`,
    prisma.$queryRaw`SELECT file, COUNT(*)::int AS requests, SUM("receivedBytes")::float8 AS bytes,
      COUNT(*) FILTER (WHERE status = 304)::int AS "notModified", COUNT(*) FILTER (WHERE status = 429)::int AS pauses,
      COUNT(*) FILTER (WHERE outcome = 'failed')::int AS failed, SUM("durationMs")::float8 AS "durationMs",
      MAX("retryAfterMs") AS "maxRetryAfterMs" FROM tcgcsv_http_requests
      WHERE "requestedAt" >= NOW() - INTERVAL '24 hours' GROUP BY file ORDER BY file`,
    prisma.$queryRaw`SELECT report->'missing' AS missing FROM tcgcsv_discovery_state WHERE id = 'global'`,
    prisma.$queryRaw`SELECT COUNT(DISTINCT x."externalId")::int AS groups,
      COUNT(DISTINCT x."setId")::int AS sets,
      (SELECT COALESCE(SUM(cache."contentBytes"),0)::float8 FROM tcgcsv_product_cache cache
        WHERE cache."groupId"::text IN (SELECT "externalId" FROM tcgcsv_set_mappings)) AS "cachedProductBytes"
      FROM (SELECT DISTINCT "externalId", "setId" FROM tcgcsv_set_mappings) x
      `,
    prisma.$queryRaw`SELECT "setId", "externalId" FROM tcgcsv_set_mappings`,
  ], { isolationLevel: 'RepeatableRead' });
  const missing = new Map((pending[0]?.missing ?? []).map((row) => [row.setId, row.reason]));
  return { evaluatedAt: new Date().toISOString(), sets: sets.map((row) => ({ ...row,
    mappingState: mappingState(row.setId, mappings),
    missingReason: mappingState(row.setId, mappings) === 'associated' ? null : missing.get(row.setId) ?? (row.groups.length ? 'asociación conflictiva' : 'sin asociación validada'),
    absentCards: row.cards - row.quotedCards,
  })), traffic, estimate: { ...estimates[0], contentRequestsPerNewBuild: estimates[0].groups * 2,
    minimumSerialSeconds: estimates[0].groups * 4 * 0.15,
    note: 'Piso de pausas con dos manifests por grupo; excluye latencia, reintentos y cooldown. 304 ahorra bytes, no peticiones. Variantes sin observación no se conocen.' } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma = new PrismaClient();
  try { console.log(JSON.stringify(await readCoverage(prisma), null, 2)); }
  catch { console.error('No se pudo leer cobertura TCGCSV; verificá conexión y migraciones'); process.exitCode = 1; }
  finally { await prisma.$disconnect(); }
}
