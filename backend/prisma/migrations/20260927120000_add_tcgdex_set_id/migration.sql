-- Set equivalente en tcgdex (fuente de precios por (set, localId)).
-- Null = sin mapear; lo completa el mapper la primera vez que se pide un precio.
ALTER TABLE "card_sets" ADD COLUMN "tcgdexSetId" TEXT;
