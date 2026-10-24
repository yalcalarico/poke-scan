ALTER TYPE "PriceSyncSetOrigin" ADD VALUE 'validated';
CREATE TABLE "tcgcsv_set_groups" (
  "groupId" INTEGER NOT NULL, "setId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tcgcsv_set_groups_pkey" PRIMARY KEY ("groupId", "setId"),
  CONSTRAINT "tcgcsv_set_groups_setId_fkey" FOREIGN KEY ("setId") REFERENCES "card_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "tcgcsv_set_groups_setId_idx" ON "tcgcsv_set_groups"("setId");
CREATE VIEW "tcgcsv_set_mappings" AS
  SELECT 'tcgcsv'::text AS provider, "groupId"::text AS "externalId", "setId" FROM "tcgcsv_set_groups"
  UNION
  SELECT provider, "externalId", "setId" FROM "card_set_external_ids" WHERE provider = 'tcgcsv';
