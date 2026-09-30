-- Keep existing card/set IDs stable while recording each provider's identifiers.
CREATE TABLE "card_external_ids" (
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_external_ids_pkey" PRIMARY KEY ("provider", "externalId")
);

CREATE TABLE "card_set_external_ids" (
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_set_external_ids_pkey" PRIMARY KEY ("provider", "externalId")
);

ALTER TABLE "card_prices" ADD COLUMN "provider" TEXT;

CREATE INDEX "card_external_ids_cardId_provider_idx"
    ON "card_external_ids"("cardId", "provider");
CREATE INDEX "card_set_external_ids_setId_provider_idx"
    ON "card_set_external_ids"("setId", "provider");
CREATE INDEX "card_prices_cardId_provider_source_variant_fetchedAt_idx"
    ON "card_prices"("cardId", "provider", "source", "variant", "fetchedAt");

ALTER TABLE "card_external_ids"
    ADD CONSTRAINT "card_external_ids_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "card_set_external_ids"
    ADD CONSTRAINT "card_set_external_ids_setId_fkey"
    FOREIGN KEY ("setId") REFERENCES "card_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing PKs remain the stable IDs used by collection items and public routes.
INSERT INTO "card_external_ids" ("provider", "externalId", "cardId")
SELECT 'pokemontcg.io', c."id", c."id"
FROM "cards" c;

INSERT INTO "card_set_external_ids" ("provider", "externalId", "setId")
SELECT 'pokemontcg.io', s."id", s."id"
FROM "card_sets" s;

-- Preserve current TCGdex mappings in the provider-neutral mapping table.
INSERT INTO "card_set_external_ids" ("provider", "externalId", "setId")
SELECT 'tcgdex', s."tcgdexSetId", s."id"
FROM "card_sets" s
WHERE s."tcgdexSetId" IS NOT NULL;
