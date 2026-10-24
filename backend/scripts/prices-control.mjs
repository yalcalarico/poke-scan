/** Sólo SQL local: pedir un ciclo no crea un segundo consumidor ni llama a feeds. */
export async function requestCycles(prisma) {
  const tcgcsvEnabled = process.env.ENABLE_TCGCSV_INGESTION === 'true';
  const providers = [tcgcsvEnabled ? 'tcgcsv' : null].filter(Boolean);
  if (providers.length === 0) return providers;
  await prisma.$executeRaw`
    UPDATE price_sync_controls SET "requestedGeneration" = CASE
      WHEN "requestedGeneration" = "handledGeneration" THEN "requestedGeneration" + 1 ELSE "requestedGeneration" END
    WHERE provider = ANY(${providers}::text[])
  `;
  return providers;
}

export function isDisabled(value) {
  return value !== undefined && ['false', '0', 'no'].includes(String(value).trim().toLowerCase());
}

export async function readPriceStatus(prisma) {
  const [controls, queues, coverage, discovery, pending, registry, daily, pauses, legacy, interactive, activity] = await Promise.all([
    prisma.$queryRaw`
      SELECT provider, "requestedGeneration" > "handledGeneration" AS "cyclePending", "lastHandledAt", "heartbeatAt",
        "schedulerEnabled", "workerConfiguredEnabled", "nextCycleAt",
        CASE WHEN "lastError" IS NULL THEN NULL ELSE 'Error registrado; detalle omitido' END AS "lastError",
        ("heartbeatAt" > NOW() - INTERVAL '30 seconds') AS "heartbeatRecent"
      FROM price_sync_controls ORDER BY provider
    `,
    prisma.$queryRaw`
      SELECT 'tcgdex' AS provider, status, COUNT(*)::int AS jobs FROM price_refresh_jobs GROUP BY status
      UNION ALL SELECT 'tcgcsv' AS provider, CASE WHEN status = 'pending' AND GREATEST("availableAt", COALESCE("downloadStartedAt" + INTERVAL '24 hours', NOW())) > NOW() THEN 'waiting' ELSE status END AS status, COUNT(*)::int AS jobs FROM tcgcsv_group_jobs GROUP BY 2
      ORDER BY provider, status
    `,
    prisma.$queryRaw`
      SELECT provider, COUNT(DISTINCT "cardId")::int AS "quotedCards", COUNT(*)::int AS observations,
        MAX("fetchedAt") AS "lastFetchedAt", MAX("feedPublishedAt") AS "lastBuild"
      FROM card_prices WHERE provider IN ('tcgdex', 'tcgcsv') AND source = 'tcgplayer' AND currency = 'USD' AND market IS NOT NULL GROUP BY provider
    `,
    prisma.$queryRaw`
      SELECT "groupsBuild", "nextCheckAt", CASE WHEN "lastError" IS NULL THEN NULL ELSE 'Error registrado; detalle omitido' END AS "lastError", COALESCE(jsonb_array_length(report->'mappings'), 0)::int AS "mappedSets",
        COALESCE(jsonb_array_length(report->'missing'), 0)::int AS "missingSets", report->'missing' AS "missingSetDetails",
        "requestCount", "requestWindowStartedAt" + INTERVAL '24 hours' AS "requestWindowEndsAt",
        "downloadCount", "downloadWindowStartedAt" + INTERVAL '24 hours' AS "downloadWindowEndsAt",
        (SELECT MIN(GREATEST(j."availableAt", COALESCE(j."downloadStartedAt" + INTERVAL '24 hours', NOW()), NOW(),
          CASE WHEN j.status = 'failed' THEN d."nextCheckAt" ELSE NOW() END))
          FROM tcgcsv_group_jobs j CROSS JOIN tcgcsv_discovery_state d WHERE d.id = 'global' AND j.status IN ('pending', 'failed')) AS "nextGroupAt"
      FROM tcgcsv_discovery_state WHERE id = 'global'
    `,
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS "catalogCards", COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM card_prices p WHERE p."cardId" = c.id AND p.provider = 'tcgcsv' AND p.source = 'tcgplayer'
          AND p.currency = 'USD' AND p."fetchedAt" >= NOW() - INTERVAL '24 hours'
      ))::int AS "tcgcsvCardsWithoutFreshObservation" FROM cards c
    `,
    prisma.$queryRaw`SELECT s."setId", s.enabled, s.priority, s.origin, s."activatedAt", s."lastDemandAt",
      COUNT(c.id)::int AS "targetCards" FROM price_sync_sets s LEFT JOIN cards c ON c."setId" = s."setId"
      WHERE s.enabled GROUP BY s."setId", s.enabled, s.priority, s.origin, s."activatedAt", s."lastDemandAt"
      ORDER BY s.priority, s."setId"`,
    prisma.$queryRaw`SELECT d.provider, d."setId", d."syncDate", d.status, d."expectedCards", d."nextAttemptAt", d."startedAt", d."finishedAt",
      CASE WHEN d."lastError" IS NULL THEN NULL ELSE 'Error registrado; detalle omitido' END AS "lastError",
      d."feedPublishedAt", d."sourceCheckedAt", d."updatedAt",
      COUNT(c."cardId") FILTER (WHERE c.status = 'quoted')::int AS quoted,
      COUNT(c."cardId") FILTER (WHERE c.status = 'no_quote')::int AS no_quote,
      COUNT(c."cardId") FILTER (WHERE c.status = 'unmapped')::int AS unmapped,
      COUNT(c."cardId") FILTER (WHERE c.status = 'unsupported')::int AS unsupported,
      COUNT(c."cardId") FILTER (WHERE c.status = 'pending')::int AS pending,
      COUNT(c."cardId") FILTER (WHERE c.status = 'processing')::int AS processing,
      COUNT(c."cardId") FILTER (WHERE c.status = 'failed')::int AS failed,
      COUNT(c."cardId") FILTER (WHERE c.status = 'no_new_feed')::int AS no_new_feed,
      COALESCE(SUM(c.attempts), 0)::int AS attempts,
      prices."lastQuoteAt", prices.observations
      FROM price_sync_set_days d LEFT JOIN price_sync_card_days c
        ON c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate"
      LEFT JOIN LATERAL (SELECT MAX(p."fetchedAt") AS "lastQuoteAt", COUNT(*)::int AS observations
        FROM card_prices p JOIN cards card ON card.id = p."cardId"
        WHERE p.provider = d.provider AND card."setId" = d."setId" AND p.source = 'tcgplayer' AND p.currency = 'USD' AND p.market IS NOT NULL
          AND p."fetchedAt" >= (d."syncDate"::timestamp AT TIME ZONE 'UTC')
          AND p."fetchedAt" < ((d."syncDate" + 1)::timestamp AT TIME ZONE 'UTC')) prices ON TRUE
      WHERE d."syncDate" = (NOW() AT TIME ZONE 'UTC')::date GROUP BY d.provider, d."setId", d."syncDate", d.status,
        d."expectedCards", d."nextAttemptAt", d."startedAt", d."finishedAt", d."lastError", d."feedPublishedAt", d."sourceCheckedAt", d."updatedAt", prices."lastQuoteAt", prices.observations
      ORDER BY d.provider, d."setId"`,
    prisma.$queryRaw`SELECT "providerId" AS provider, "blockedUntil" FROM provider_rate_limits WHERE "blockedUntil" > NOW() ORDER BY "providerId"`,
    prisma.$queryRaw`SELECT 'tcgdex' AS provider, q.status, COUNT(*)::int AS jobs FROM price_refresh_jobs q WHERE q.origin = 'legacy' AND q.status IN ('pending','processing') GROUP BY q.status
      UNION ALL SELECT 'tcgcsv' AS provider, q.status, COUNT(*)::int AS jobs FROM tcgcsv_group_jobs q WHERE q.origin = 'legacy' AND q.status IN ('pending','processing') GROUP BY q.status`,
    prisma.$queryRaw`SELECT provider, COUNT(*)::int AS jobs FROM (
      SELECT 'tcgdex' AS provider FROM price_refresh_jobs WHERE origin = 'interactive' AND status IN ('pending','processing')
      UNION ALL SELECT 'tcgcsv' AS provider FROM tcgcsv_group_jobs WHERE origin = 'interactive' AND status IN ('pending','processing')
    ) q GROUP BY provider`,
    prisma.$queryRaw`SELECT 'tcgdex' AS provider, GREATEST(
        (SELECT MAX("checkedAt") FROM price_sync_card_days WHERE provider = 'tcgdex'),
        (SELECT MAX("fetchedAt") FROM card_prices WHERE provider = 'tcgdex' AND source = 'tcgplayer' AND currency = 'USD' AND market IS NOT NULL)
      ) AS "lastActivityAt"
      UNION ALL SELECT 'tcgcsv', GREATEST(
        (SELECT MAX("sourceCheckedAt") FROM price_sync_set_days WHERE provider = 'tcgcsv'),
        (SELECT MAX("fetchedAt") FROM card_prices WHERE provider = 'tcgcsv' AND source = 'tcgplayer' AND currency = 'USD' AND market IS NOT NULL)
      )`,
  ]);
  const dailyWithEstimate = daily.filter((run) => run.provider === 'tcgcsv').map((run) => ({ ...run, estimatedTcgdexMinutes: run.provider === 'tcgdex' ? Math.ceil(run.pending * 2300 / 60_000) : null }));
  return { evaluatedAt: new Date().toISOString(), controls: controls.filter((row) => row.provider === 'tcgcsv'), queues: queues.filter((row) => row.provider === 'tcgcsv'), coverage: coverage.filter((row) => row.provider === 'tcgcsv'), discovery: discovery[0] ?? null, catalog: pending[0] ?? null,
    registry, daily: dailyWithEstimate, pauses: pauses.filter((row) => row.provider === 'tcgcsv'), legacy: legacy.filter((row) => row.provider === 'tcgcsv'), interactive: interactive.filter((row) => row.provider === 'tcgcsv'), activity: activity.filter((row) => row.provider === 'tcgcsv'), flags: { tcgdexScheduler: false,
      tcgcsvScheduler: process.env.ENABLE_TCGCSV_INGESTION === 'true', worker: process.env.ENABLE_TCGCSV_INGESTION === 'true' } };
}

export function formatStatus(status) {
  const lines = [`Precios · ${status.evaluatedAt}`];
  for (const control of status.controls) {
    const scheduler = !control.heartbeatRecent ? 'sin heartbeat reciente del planificador'
      : !control.schedulerEnabled ? 'planificador desactivado' : 'heartbeat del planificador reciente';
    const worker = control.workerConfiguredEnabled ? 'worker configurado habilitado' : 'worker configurado apagado';
    lines.push(`${control.provider}: ${scheduler}; ${worker}; ciclo ${control.cyclePending ? 'pendiente' : 'sin señal pendiente'}`);
    const counts = status.queues.filter((row) => row.provider === control.provider).map((row) => `${row.status === 'waiting' ? 'en espera' : row.status}: ${row.jobs}`).join(', ');
    lines.push(`  ${control.provider === 'tcgcsv' ? 'Sets' : 'Cartas'}: ${counts || 'sin jobs'}`);
    const coverage = status.coverage.find((row) => row.provider === control.provider);
    lines.push(`  Cartas con cotización: ${coverage?.quotedCards ?? 0}; observaciones con precio: ${coverage?.observations ?? 0}`);
    if (control.lastError) lines.push(`  ${control.lastError}`);
  }
  if (status.flags) lines.push(`Programación: TCGCSV ${status.flags.tcgcsvScheduler ? 'habilitada' : 'apagada'}; worker ${status.flags.worker ? 'habilitado' : 'apagado'}`);
  if (status.registry) lines.push(`Registro diario habilitado: ${status.registry.length} sets / ${status.registry.reduce((n, row) => n + row.targetCards, 0)} cartas`);
  for (const run of status.daily ?? []) lines.push(`  ${run.provider} ${run.setId} (${run.syncDate.toISOString().slice(0, 10)} UTC): ${run.status}; cotizadas ${run.quoted}, sin cotización ${run.no_quote}, unmapped ${run.unmapped}, unsupported ${run.unsupported}, sin build ${run.no_new_feed}, pendientes ${run.pending}, en proceso ${run.processing}, fallidas ${run.failed} / ${run.expectedCards}; observaciones ${run.observations}; última cotización ${run.lastQuoteAt?.toISOString?.() ?? 'ninguna'}; intentos ${run.attempts}; inicio ${run.startedAt?.toISOString?.() ?? 'sin iniciar'}; fin ${run.finishedAt?.toISOString?.() ?? 'sin finalizar'}; próximo intento ${run.nextAttemptAt?.toISOString?.() ?? 'sin espera'}; build ${run.feedPublishedAt?.toISOString?.() ?? 'sin build'}${run.estimatedTcgdexMinutes === null ? '' : `; estimado ${run.estimatedTcgdexMinutes} min a 2,3 s por carta, sin fallos ni pausas`}${run.lastError ? `; ${run.lastError}` : ''}`);
  for (const pause of status.pauses ?? []) lines.push(`Pausa ${pause.provider}: hasta ${pause.blockedUntil.toISOString()}`);
  if (status.activity) for (const row of status.activity) lines.push(`Última comprobación o cotización ${row.provider}: ${row.lastActivityAt?.toISOString?.() ?? 'sin actividad'}`);
  if (status.legacy) for (const row of status.legacy) lines.push(`Legacy diferido ${row.provider} ${row.status}: ${row.jobs}`);
  if (status.catalog) lines.push(`Catálogo completo (referencia global, fuera del alcance diario): ${status.catalog.tcgcsvCardsWithoutFreshObservation}/${status.catalog.catalogCards} cartas sin observación TCGCSV vigente`);
  if (status.discovery) {
    const state = status.discovery;
    lines.push(`TCGCSV: ${state.mappedSets} sets asociados; ${state.missingSets} sin identidad segura`);
    lines.push(`  Actividad en ventana de 24 h: ${state.requestCount} requests; ${state.downloadCount} grupos (sin tope global)`);
    lines.push(`  Próximo descubrimiento: ${state.nextCheckAt?.toISOString() ?? 'pendiente'}; próxima disponibilidad de cola: ${state.nextGroupAt?.toISOString() ?? 'sin cola'}`);
    if (state.lastError) lines.push(`  ${state.lastError}`);
  }
  return lines.join('\n');
}

export function parseOptions(args) {
  const mode = args[0];
  if (mode !== 'sync' && mode !== 'status') throw new Error('Usá sync o status');
  let watch = mode === 'sync';
  let seconds = 600;
  let json = false;
  for (const arg of args.slice(1)) {
    if (arg === '--') continue;
    if (arg === '--watch') watch = true;
    else if (arg === '--no-watch') watch = false;
    else if (arg === '--json') json = true;
    else if (/^--seconds=\d+$/.test(arg)) seconds = Number(arg.slice(10));
    else throw new Error('Opción inválida: --watch, --no-watch, --json o --seconds=N');
  }
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) throw new Error('La duración debe estar entre 1 y 86400 segundos');
  return { mode, watch, seconds, json };
}
