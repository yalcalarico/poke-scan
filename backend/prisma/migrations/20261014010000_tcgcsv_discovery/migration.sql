CREATE TABLE "tcgcsv_discovery_state" (
  "id" TEXT PRIMARY KEY,
  "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedBy" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "groupsBuild" TIMESTAMP(3),
  "groupsJson" JSONB,
  "report" JSONB,
  "lastError" TEXT,
  "requestWindowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "downloadWindowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "downloadCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tcgcsv_discovery_request_nonnegative" CHECK ("requestCount" >= 0),
  CONSTRAINT "tcgcsv_discovery_download_nonnegative" CHECK ("downloadCount" >= 0)
);
INSERT INTO "tcgcsv_discovery_state" (id) VALUES ('global');

CREATE TABLE "price_sync_controls" (
  "provider" TEXT PRIMARY KEY,
  "requestedGeneration" INTEGER NOT NULL DEFAULT 0,
  "handledGeneration" INTEGER NOT NULL DEFAULT 0,
  "lastHandledAt" TIMESTAMP(3),
  "heartbeatAt" TIMESTAMP(3),
  "schedulerEnabled" BOOLEAN NOT NULL DEFAULT false,
  "workerConfiguredEnabled" BOOLEAN NOT NULL DEFAULT false,
  "lockedBy" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "nextCycleAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  CONSTRAINT "price_sync_generation_order" CHECK ("requestedGeneration" >= "handledGeneration" AND "handledGeneration" >= 0)
);
INSERT INTO "price_sync_controls" (provider) VALUES ('tcgdex'), ('tcgcsv');
