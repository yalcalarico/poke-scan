ALTER TABLE "tcgcsv_discovery_state"
  ADD COLUMN "workerLockedBy" TEXT,
  ADD COLUMN "workerLeaseUntil" TIMESTAMP(3);
