import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { matchProducts, parseProducts } from '../dist/jobs/tcgcsv/tcgcsv.adapter.js';

/** Diagnóstico local: no solicita feeds ni modifica la cola. */
export async function diagnose(prisma) {
  const [jobs, cards, content] = await prisma.$transaction(async (tx) => {
    const jobs = await tx.tcgcsvGroupJob.findMany({ where: { status: { not: 'completed' } }, orderBy: { groupId: 'asc' } });
    if (!jobs.length) return [[], [], []];
    const [cards, content] = await Promise.all([
      tx.$queryRaw`SELECT x."externalId" AS "groupId", c.id, c.name, c.number, c.language, c."setId", s."printedTotal", e."externalId"
      FROM tcgcsv_set_mappings x JOIN cards c ON c."setId" = x."setId"
      JOIN card_sets s ON s.id = c."setId"
      LEFT JOIN card_external_ids e ON e."cardId" = c.id AND e.provider = 'tcgcsv'
      WHERE x."externalId" = ANY(${jobs.map((j) => String(j.groupId))}::text[])`,
      tx.tcgcsvProductCache.findMany({ where: { groupId: { in: jobs.map((j) => j.groupId) } } }),
    ]);
    return [jobs, cards, content];
  }, { isolationLevel: 'RepeatableRead' });
  const at = new Date();
  return { evaluatedAt: at.toISOString(), groups: jobs.map((job) => {
    const local = cards.filter((c) => c.groupId === String(job.groupId)).map(({ groupId, ...c }) => ({ ...c, externalId: c.externalId ?? undefined }));
    const cache = content.find((c) => c.groupId === job.groupId);
    let mapped = new Map();
    let cacheState = 'missing';
    if (cache) {
      try {
        if (createHash('sha256').update(cache.content).digest('hex') !== cache.checksum
          || Buffer.byteLength(cache.content) !== cache.contentBytes) throw new Error('Caché inválida');
        const products = parseProducts(JSON.parse(cache.content), job.groupId);
        mapped = matchProducts(local, products, Object.fromEntries(local.map((c) => [c.setId, job.groupId])));
        cacheState = 'validated';
      } catch { cacheState = 'invalid'; }
    }
    const downloadAfter = job.downloadStartedAt ? job.downloadStartedAt.getTime() + 86400000 : 0;
    const nextAttempt = new Date(Math.max(job.availableAt.getTime(), downloadAfter));
    return { groupId: job.groupId, sets: [...new Set(local.map((c) => c.setId))], status: job.status,
      waitReason: downloadAfter > at.getTime() ? 'download_cooldown' : job.availableAt > at ? 'backoff' : job.status === 'failed' ? 'requires_retry' : 'ready_for_worker',
      availableAt: nextAttempt.toISOString(), downloadStartedAt: job.downloadStartedAt, publishedBuild: job.publishedBuild,
      origin: job.origin, syncDate: job.syncDate,
      lastFailure: job.lastError, verificationPending: job.lastError !== null || job.publishedBuild === null,
      cacheState, cards: local.length, matchedCards: mapped.size,
      unmatchedCards: local.length - mapped.size,
      note: 'El replay valida identidad de productos; no acredita precios ni una publicación nueva.' };
  }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const p = new PrismaClient();
  try { console.log(JSON.stringify(await diagnose(p), null, 2)); }
  catch { console.error('No se pudo diagnosticar TCGCSV; verificá conexión, build y migraciones'); process.exitCode = 1; }
  finally { await p.$disconnect(); }
}
