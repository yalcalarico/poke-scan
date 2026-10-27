-- El backfill siguiente sólo fue acreditado para la tanda abierta del 26/10.
-- Otras instalaciones necesitan una conciliación explícita, sin reabrir historia.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "tcgcsv_daily_batches" WHERE "syncDate" <> DATE '2026-10-26') THEN
    RAISE EXCEPTION 'Hay tandas históricas fuera del backfill validado; conciliarlas antes de aplicar tcgcsv_batch_outcomes';
  END IF;
END $$;
