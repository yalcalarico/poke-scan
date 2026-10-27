CREATE TABLE "tcgcsv_daily_batches" (
    "syncDate" DATE NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setIds" TEXT[] NOT NULL,
    CONSTRAINT "tcgcsv_daily_batches_pkey" PRIMARY KEY ("syncDate")
);
