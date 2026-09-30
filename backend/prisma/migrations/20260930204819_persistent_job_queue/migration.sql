-- FASE 4 de docs/plans/02-backend-production.md: la cola de precios, el reloj
-- global del proveedor y los cursores de sync pasan a Postgres.
--
-- Esta migración fue generada con `prisma migrate dev --create-only` y
-- editada a mano: el generador agregaba cinco `DROP INDEX` de los índices
-- trigram que Prisma no modela (`pg_trgm`). Aplicados, la búsqueda difusa
-- pasaba de índice GIN a un seq scan sobre 20.670 cartas. Ver
-- `backend/docs/gotchas.md` §2 y `AGENTS.md` §3.5.
--
-- No hay `DROP INDEX` acá a propósito. Si una migración futura trae uno,
-- revisá que no sea uno de estos: `cards_name_trgm_idx`,
-- `cards_artist_trgm_idx`, `card_sets_name_trgm_idx`,
-- `users_username_trgm_idx`, `users_display_name_trgm_idx`.

-- CreateTable
CREATE TABLE "price_refresh_jobs" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_refresh_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_rate_limits" (
    "providerId" TEXT NOT NULL,
    "lastCalledAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_rate_limits_pkey" PRIMARY KEY ("providerId")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "id" TEXT NOT NULL,
    "lastPage" INTEGER NOT NULL DEFAULT 0,
    "totalPages" INTEGER,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_refresh_jobs_cardId_key" ON "price_refresh_jobs"("cardId");

-- El claim del worker: `WHERE status = 'pending' AND availableAt <= now()
-- ORDER BY availableAt LIMIT 1`. Sin este índice es un seq scan ordenado.
CREATE INDEX "price_refresh_jobs_status_availableAt_idx" ON "price_refresh_jobs"("status", "availableAt");

-- La recuperación de `processing` colgados en el arranque, que filtra por edad.
CREATE INDEX "price_refresh_jobs_status_lockedAt_idx" ON "price_refresh_jobs"("status", "lockedAt");
