CREATE TABLE "portfolio_snapshots" (
  "userId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "valueUsd" DOUBLE PRECISION,
  "totalCards" INTEGER NOT NULL,
  "unpricedCards" INTEGER NOT NULL,
  CONSTRAINT "portfolio_snapshots_pkey" PRIMARY KEY ("userId", "day"),
  CONSTRAINT "portfolio_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
