-- Las tres tablas del job queue guardan el tiempo en columnas `TIMESTAMP(3)`
-- **sin** zona, que es lo que Prisma usa para `DateTime` en este schema (igual
-- que `card_prices."fetchedAt"`). El problema es el default: `CURRENT_TIMESTAMP`
-- devuelve `timestamptz` y al castear a una columna naive lo escribe en la hora
-- local de la sesión, mientras que la app escribe UTC.
--
-- Hoy la sesión está en UTC y las dos cosas coinciden, así que esto no cambia
-- ningún resultado: es para que no dependa de eso. Con el default en UTC y las
-- queries del worker comparando contra `now() AT TIME ZONE 'UTC'`, el reloj de
-- la cola es explícito y un `TZ` distinto en la base no la corre.
ALTER TABLE "price_refresh_jobs"
  ALTER COLUMN "availableAt" SET DEFAULT (now() AT TIME ZONE 'UTC');

ALTER TABLE "price_refresh_jobs"
  ALTER COLUMN "createdAt" SET DEFAULT (now() AT TIME ZONE 'UTC');

ALTER TABLE "provider_rate_limits"
  ALTER COLUMN "updatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC');

ALTER TABLE "sync_state"
  ALTER COLUMN "updatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC');
