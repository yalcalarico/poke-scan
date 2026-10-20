ALTER TABLE "card_prices"
  ADD COLUMN "feedPublishedAt" TIMESTAMP(3),
  ADD COLUMN "upstreamUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "externalGroupId" INTEGER,
  ADD COLUMN "externalProductId" INTEGER,
  ADD COLUMN "externalSubtype" TEXT,
  ADD COLUMN "ingestionRunId" TEXT,
  ADD COLUMN "ingestionChecksum" TEXT;
CREATE TABLE "tcgcsv_group_jobs" (
  "groupId" INTEGER PRIMARY KEY, "status" TEXT NOT NULL DEFAULT 'pending',
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedBy" TEXT, "leaseUntil" TIMESTAMP(3), "downloadStartedAt" TIMESTAMP(3),
  "publishedBuild" TIMESTAMP(3), "lastError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "tcgcsv_group_jobs_status_availableAt_idx" ON "tcgcsv_group_jobs"("status", "availableAt");
CREATE TABLE "price_ingestion_runs" (
  "id" TEXT PRIMARY KEY, "provider" TEXT NOT NULL, "groupId" INTEGER NOT NULL,
  "feedPublishedAt" TIMESTAMP(3) NOT NULL, "checksum" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL, "mappedCards" INTEGER NOT NULL,
  "unmappedCards" INTEGER NOT NULL, "observations" INTEGER NOT NULL
);
CREATE UNIQUE INDEX "price_ingestion_runs_provider_groupId_feedPublishedAt_key"
  ON "price_ingestion_runs"("provider", "groupId", "feedPublishedAt");
CREATE TABLE "collection_comparison_snapshots" (
  "collectionId" TEXT NOT NULL REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "provider" TEXT NOT NULL, "policy" TEXT NOT NULL, "day" DATE NOT NULL,
  "valueUsd" DECIMAL(20,2), "totalCopies" INTEGER NOT NULL, "pricedCopies" INTEGER NOT NULL,
  "freshCopies" INTEGER NOT NULL, "staleCopies" INTEGER NOT NULL, "unknownFreshnessCopies" INTEGER NOT NULL,
  "oldestFetchedAt" TIMESTAMP(3), "newestFetchedAt" TIMESTAMP(3), "feedPublishedAt" TIMESTAMP(3),
  "compositionFingerprint" TEXT NOT NULL, "compositionChanged" BOOLEAN NOT NULL,
  "scopeCount" INTEGER NOT NULL, "snapshotCut" TEXT NOT NULL, "evaluatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("collectionId", "provider", "policy", "day")
);
CREATE INDEX "collection_comparison_snapshots_day_provider_policy_idx"
  ON "collection_comparison_snapshots"("day", "provider", "policy");
-- Aditiva: no toca pg_trgm, snapshots legacy ni proveedores ya existentes.
