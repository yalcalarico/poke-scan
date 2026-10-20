ALTER TABLE "users" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "password_recovery_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "issuedAuthVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_recovery_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "password_recovery_tokens_tokenHash_key" ON "password_recovery_tokens"("tokenHash");
CREATE INDEX "password_recovery_tokens_userId_expiresAt_idx" ON "password_recovery_tokens"("userId", "expiresAt");
ALTER TABLE "password_recovery_tokens" ADD CONSTRAINT "password_recovery_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "recovery_rate_limit_hits" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recovery_rate_limit_hits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recovery_rate_limit_hits_scope_keyHash_occurredAt_idx"
  ON "recovery_rate_limit_hits"("scope", "keyHash", "occurredAt");
