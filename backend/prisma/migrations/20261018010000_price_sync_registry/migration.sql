CREATE TYPE "PriceSyncSetOrigin" AS ENUM ('curated', 'collection', 'manual');
CREATE TYPE "PriceSyncQueueOrigin" AS ENUM ('legacy', 'daily', 'interactive');
CREATE TYPE "PriceSyncSetDayStatus" AS ENUM (
  'pending', 'running', 'waiting_feed', 'waiting_cooldown', 'completed',
  'partial', 'blocked_mapping', 'no_new_feed', 'failed', 'missed'
);
CREATE TYPE "PriceSyncCardDayStatus" AS ENUM (
  'pending', 'processing', 'quoted', 'no_quote', 'unsupported', 'unmapped',
  'no_new_feed', 'failed', 'missed'
);

CREATE TABLE "price_sync_sets" (
  "setId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "origin" "PriceSyncSetOrigin" NOT NULL,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastDemandAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "price_sync_sets_pkey" PRIMARY KEY ("setId"),
  CONSTRAINT "price_sync_sets_priority_positive" CHECK ("priority" > 0)
);
CREATE INDEX "price_sync_sets_enabled_priority_setId_idx"
  ON "price_sync_sets" ("enabled", "priority", "setId");
ALTER TABLE "price_sync_sets" ADD CONSTRAINT "price_sync_sets_setId_fkey"
  FOREIGN KEY ("setId") REFERENCES "card_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "price_sync_set_days" (
  "provider" TEXT NOT NULL,
  "setId" TEXT NOT NULL,
  "syncDate" DATE NOT NULL,
  "status" "PriceSyncSetDayStatus" NOT NULL DEFAULT 'pending',
  "expectedCards" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "feedPublishedAt" TIMESTAMP(3),
  "sourceCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "price_sync_set_days_pkey" PRIMARY KEY ("provider", "setId", "syncDate")
);
CREATE INDEX "price_sync_set_days_provider_syncDate_status_nextAttemptAt_idx"
  ON "price_sync_set_days" ("provider", "syncDate", "status", "nextAttemptAt");
ALTER TABLE "price_sync_set_days" ADD CONSTRAINT "price_sync_set_days_setId_fkey"
  FOREIGN KEY ("setId") REFERENCES "card_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "price_sync_card_days" (
  "provider" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "setId" TEXT NOT NULL,
  "syncDate" DATE NOT NULL,
  "status" "PriceSyncCardDayStatus" NOT NULL DEFAULT 'pending',
  "checkedAt" TIMESTAMP(3),
  "quoteCount" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "price_sync_card_days_pkey" PRIMARY KEY ("provider", "cardId", "syncDate")
);
CREATE INDEX "price_sync_card_days_provider_setId_syncDate_status_idx"
  ON "price_sync_card_days" ("provider", "setId", "syncDate", "status");
ALTER TABLE "price_sync_card_days" ADD CONSTRAINT "price_sync_card_days_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_sync_card_days" ADD CONSTRAINT "price_sync_card_days_setId_fkey"
  FOREIGN KEY ("setId") REFERENCES "card_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "price_refresh_jobs"
  ADD COLUMN "origin" "PriceSyncQueueOrigin" NOT NULL DEFAULT 'legacy',
  ADD COLUMN "syncDate" DATE;
CREATE INDEX "price_refresh_jobs_origin_syncDate_status_availableAt_idx"
  ON "price_refresh_jobs" ("origin", "syncDate", "status", "availableAt");

ALTER TABLE "tcgcsv_group_jobs"
  ADD COLUMN "origin" "PriceSyncQueueOrigin" NOT NULL DEFAULT 'legacy',
  ADD COLUMN "syncDate" DATE;
CREATE INDEX "tcgcsv_group_jobs_origin_syncDate_status_availableAt_idx"
  ON "tcgcsv_group_jobs" ("origin", "syncDate", "status", "availableAt");

ALTER TABLE "provider_rate_limits" ADD COLUMN "blockedUntil" TIMESTAMP(3);
