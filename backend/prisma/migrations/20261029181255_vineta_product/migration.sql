-- Tablas aditivas: no modifica inventario, precios ni índices de catálogo.
CREATE TABLE "collection_goals" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "collection_goals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "collection_goals_collectionId_createdAt_id_idx" ON "collection_goals"("collectionId", "createdAt", "id");
ALTER TABLE "collection_goals" ADD CONSTRAINT "collection_goals_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collections" ADD COLUMN "nextGoalId" TEXT;
CREATE UNIQUE INDEX "collections_nextGoalId_key" ON "collections"("nextGoalId");
ALTER TABLE "collections" ADD CONSTRAINT "collections_nextGoalId_fkey" FOREIGN KEY ("nextGoalId") REFERENCES "collection_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "showcase_preferences" (
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'value',
    "cardIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "showcase_preferences_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "showcase_preferences_mode_check" CHECK ("mode" IN ('value', 'personal')),
    CONSTRAINT "showcase_preferences_no_null_cards_check" CHECK (array_position("cardIds", NULL) IS NULL)
);
ALTER TABLE "showcase_preferences" ADD CONSTRAINT "showcase_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
