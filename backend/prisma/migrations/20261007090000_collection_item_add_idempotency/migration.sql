-- Registro durable de reintentos del alta aditiva de ítems.
CREATE TABLE "collection_item_add_operations" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "resultItemId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_item_add_operations_pkey" PRIMARY KEY ("userId", "key"),
    CONSTRAINT "collection_item_add_operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "collection_item_add_operations_expiresAt_idx" ON "collection_item_add_operations"("expiresAt");
