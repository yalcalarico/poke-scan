CREATE TABLE "tcgcsv_product_cache" (
    "groupId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "contentBytes" INTEGER NOT NULL,
    "etag" TEXT,
    "lastModified" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "validatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tcgcsv_product_cache_pkey" PRIMARY KEY ("groupId")
);

CREATE TABLE "tcgcsv_http_requests" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "groupId" INTEGER,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" INTEGER,
    "receivedBytes" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "conditional" BOOLEAN NOT NULL,
    "reusedCache" BOOLEAN NOT NULL,
    "retryAfterMs" DOUBLE PRECISION,
    "outcome" TEXT NOT NULL,
    CONSTRAINT "tcgcsv_http_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tcgcsv_http_requests_requestedAt_file_idx" ON "tcgcsv_http_requests"("requestedAt", "file");
CREATE INDEX "tcgcsv_http_requests_groupId_requestedAt_idx" ON "tcgcsv_http_requests"("groupId", "requestedAt");
