-- Una suspensión puede desalinear temporalmente el reloj de PostgreSQL en Docker.
-- La telemetría conserva el inicio y duración de cada petición en el reloj de la API.
WITH finished AS (
  SELECT "groupId", MAX("requestedAt" + "durationMs" * INTERVAL '1 millisecond') AS at
  FROM "tcgcsv_http_requests" WHERE "groupId" IS NOT NULL AND file IN ('products','prices') GROUP BY "groupId"
)
UPDATE "tcgcsv_group_jobs" j SET
  "downloadStartedAt" = GREATEST(j."downloadStartedAt", f.at),
  "availableAt" = GREATEST(j."availableAt", f.at + INTERVAL '24 hours')
FROM finished f WHERE j."groupId" = f."groupId"
  AND (j."downloadStartedAt" < f.at OR j."availableAt" < f.at + INTERVAL '24 hours');
