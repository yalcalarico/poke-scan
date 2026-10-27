ALTER TABLE "tcgcsv_daily_batches"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'planning',
  ADD COLUMN "feedPublishedAt" TIMESTAMP(3),
  ADD COLUMN "feedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "finishedAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT;

CREATE TABLE "tcgcsv_batch_groups" (
  "syncDate" DATE NOT NULL,
  "groupId" INTEGER NOT NULL,
  "setIds" TEXT[] NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "lastError" TEXT,
  CONSTRAINT "tcgcsv_batch_groups_pkey" PRIMARY KEY ("syncDate", "groupId"),
  CONSTRAINT "tcgcsv_batch_groups_syncDate_fkey" FOREIGN KEY ("syncDate") REFERENCES "tcgcsv_daily_batches"("syncDate") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "tcgcsv_batch_groups_syncDate_status_nextAttemptAt_idx"
  ON "tcgcsv_batch_groups"("syncDate", "status", "nextAttemptAt");

-- Reconstruye el lote abierto con evidencia real, sin volver a fechar precios.
UPDATE "tcgcsv_daily_batches" b SET "feedPublishedAt" = (
  SELECT MIN(r."feedPublishedAt") FROM "price_ingestion_runs" r
  WHERE r.provider = 'tcgcsv' AND r."publishedAt" >= b."openedAt"
    AND r."publishedAt" < b."syncDate"::timestamp + INTERVAL '1 day 21 hours'
    AND r."feedPublishedAt" >= b."syncDate"::timestamp + INTERVAL '20 hours'
);

INSERT INTO "tcgcsv_batch_groups" ("syncDate", "groupId", "setIds", status, "finishedAt", "lastError")
SELECT b."syncDate", m."externalId"::integer, array_agg(DISTINCT m."setId" ORDER BY m."setId"),
  CASE
    WHEN EXISTS (SELECT 1 FROM "price_ingestion_runs" r WHERE r.provider = 'tcgcsv'
      AND r."groupId" = m."externalId"::integer AND r."feedPublishedAt" = b."feedPublishedAt") THEN 'completed'
    WHEN b."syncDate" = DATE '2026-10-26' AND m."externalId" IN ('1407','1409','1450') THEN 'skipped'
    WHEN j."downloadStartedAt" >= b."openedAt" THEN 'failed'
    ELSE 'pending'
  END,
  CASE WHEN EXISTS (SELECT 1 FROM "price_ingestion_runs" r WHERE r.provider = 'tcgcsv'
      AND r."groupId" = m."externalId"::integer AND r."feedPublishedAt" = b."feedPublishedAt")
    OR (b."syncDate" = DATE '2026-10-26' AND m."externalId" IN ('1407','1409','1450'))
    OR j."downloadStartedAt" >= b."openedAt" THEN CURRENT_TIMESTAMP END,
  CASE
    WHEN EXISTS (SELECT 1 FROM "price_ingestion_runs" r WHERE r.provider = 'tcgcsv'
      AND r."groupId" = m."externalId"::integer AND r."feedPublishedAt" = b."feedPublishedAt") THEN NULL
    WHEN b."syncDate" = DATE '2026-10-26' AND m."externalId" IN ('1407','1409','1450')
      THEN 'Exceptuado por el usuario: importado antes de la apertura del lote del 26/10'
    WHEN j."downloadStartedAt" >= b."openedAt"
      THEN COALESCE(j."lastError", 'Descarga interrumpida en esta tanda; se conserva la reserva de 24 horas')
    ELSE NULL
  END
FROM "tcgcsv_daily_batches" b
JOIN "tcgcsv_set_mappings" m ON m."setId" = ANY(b."setIds") AND m.provider = 'tcgcsv'
LEFT JOIN "tcgcsv_group_jobs" j ON j."groupId" = m."externalId"::integer
WHERE m."externalId" ~ '^[1-9][0-9]{0,8}$'
GROUP BY b."syncDate", b."openedAt", b."feedPublishedAt", m."externalId", j."downloadStartedAt", j."lastError";

UPDATE "price_sync_card_days" d SET status = 'failed', "lastError" = g."lastError", "updatedAt" = CURRENT_TIMESTAMP
FROM "tcgcsv_batch_groups" g WHERE d.provider = 'tcgcsv' AND d."syncDate" = g."syncDate"
  AND d."setId" = ANY(g."setIds") AND g.status = 'failed' AND d.status IN ('pending','processing');
UPDATE "price_sync_set_days" d SET status = 'failed', "lastError" = g."lastError",
  "finishedAt" = CURRENT_TIMESTAMP, "nextAttemptAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
FROM "tcgcsv_batch_groups" g WHERE d.provider = 'tcgcsv' AND d."syncDate" = g."syncDate"
  AND d."setId" = ANY(g."setIds") AND g.status = 'failed';
UPDATE "tcgcsv_group_jobs" j SET status = 'failed', "lastError" = g."lastError", "updatedAt" = CURRENT_TIMESTAMP
FROM "tcgcsv_batch_groups" g WHERE j."groupId" = g."groupId" AND j."syncDate" = g."syncDate" AND g.status = 'failed';
UPDATE "tcgcsv_daily_batches" SET status = CASE WHEN "feedPublishedAt" IS NOT NULL THEN 'running' ELSE 'pending' END;
