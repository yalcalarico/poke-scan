import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from '../../prisma/index.js';
import { CollectionComparisonService } from '../collection-comparison.service.js';
import { COMPARISON_CLOCK, type ComparisonClock } from '../comparison-clock.js';
import { TCGCSV_GROUPS, matchProducts, parseBuild, parsePrices, parseProducts, type LocalTcgcsvCard } from './tcgcsv.adapter.js';
import { compatibleGroupSets } from './tcgcsv.identities.js';
import { TcgcsvClient } from './tcgcsv.client.js';
import { buildIsNew, discoverSetMappings, parseGroups, type TcgcsvLocalSet, type TcgcsvSetMapping } from './tcgcsv.discovery.js';
import { ProviderRateLimitError } from '../../common/errors/provider-rate-limit.error.js';
import { PriceSyncRegistryService } from '../price-sync-registry.service.js';
import { TcgcsvBatchCoordinator, type ActiveTcgcsvBatch } from './tcgcsv-batch.coordinator.js';

interface GroupJob { groupId: number; lockedBy: string | null; publishedBuild: Date | null; downloadStartedAt: Date | null; availableAt: Date; status: string; syncDate: Date | null }
interface DiscoveryState { groupsBuild: Date | null; groupsJson: unknown }
interface EnabledSet { setId: string }
interface RatePause { blockedUntil: Date | null }

function failureReason(error: unknown): string {
  if (error instanceof ProviderRateLimitError) return 'Pausa HTTP 429 solicitada por TCGCSV';
  if (!(error instanceof Error)) return 'Error sin diagnóstico de transporte';
  if (['AbortError', 'TimeoutError'].includes(error.name)) return 'Tiempo de espera HTTP agotado';
  if (error instanceof SyntaxError) return 'Respuesta JSON inválida';
  const cause = error.cause;
  const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code
    : 'code' in error ? error.code : null;
  if (typeof code === 'string' && /^[A-Z0-9_]{2,40}$/.test(code)) return `Fallo de conexión o persistencia (${code})`;
  if (/^(Lease TCGCSV|Grupo sin registro|Mapeo TCGCSV|Lote TCGCSV|Build TCGCSV|TCGCSV cambió|TCGCSV respondió HTTP|La tanda ya)/.test(error.message)) return error.message.slice(0, 180);
  return error instanceof TypeError ? 'Conexión HTTP interrumpida' : 'Error de validación o ejecución';
}

@Injectable()
export class TcgcsvService implements OnModuleInit {
  private readonly logger = new Logger(TcgcsvService.name);
  private busy = false;
  private readonly batches: TcgcsvBatchCoordinator;
  constructor(private readonly prisma: PrismaService, private readonly client: TcgcsvClient,
    private readonly snapshots: CollectionComparisonService,
    @Optional() @Inject(COMPARISON_CLOCK) private readonly clock: ComparisonClock = () => new Date(),
    @Optional() private readonly registry?: PriceSyncRegistryService) {
    this.batches = new TcgcsvBatchCoordinator(prisma, clock);
  }

  enabled(): boolean { return process.env.ENABLE_TCGCSV_INGESTION === 'true'; }

  /** Las 18 ARG abren una tanda; no son un límite para terminar la que ya está abierta. */
  dailyWindowOpen(): boolean { return this.clock().getUTCHours() >= 21; }

  async onModuleInit(): Promise<void> {
    await this.discover();
    await this.planDaily(false);
  }

  /** Objetivos TCGCSV del día: catálogo de identidades global, contenido sólo habilitado. */
  @Cron('0 21 * * *', { timeZone: 'UTC' })
  async runDaily(): Promise<number> {
    if (!this.enabled()) return 0;
    await this.discover();
    return this.planDaily(true);
  }

  async signalDaily(): Promise<number> {
    if (!this.enabled()) return 0;
    return this.planDaily(true);
  }

  /** Entrada interna para setup y pruebas de integración; nunca sale a la red. */
  async planDailyTargets(explicit = false): Promise<number> {
    if (!this.enabled()) return 0;
    return this.planDaily(explicit);
  }

  @Cron('*/15 * * * *', { timeZone: 'UTC' })
  async resumeDaily(): Promise<number> {
    if (!this.enabled()) return 0;
    return this.planDaily(false);
  }

  private async planDaily(_explicit: boolean, now = this.clock()): Promise<number> {
    if (!this.enabled()) return 0;
    const planning = await this.prisma.$queryRaw<{ syncDate: Date }[]>`
      SELECT "syncDate" FROM tcgcsv_daily_batches WHERE status = 'planning' ORDER BY "syncDate" LIMIT 1`;
    if (!this.dailyWindowOpen() && !planning.length) return 0;
    await this.registry?.ensureCuratedSeed();
    await this.registry?.reconcileCollectionSets();
    await this.registry?.reconcileValidatedSets();
    const day = planning[0]?.syncDate ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    // Una apertura durable fija el alcance aunque todos los objetivos ya existan o se deshabiliten luego.
    const [batch] = await this.prisma.$queryRaw<{ setIds: string[]; status: string }[]>`
      INSERT INTO tcgcsv_daily_batches ("syncDate", "openedAt", "setIds")
      SELECT ${day}::date, ${now}, COALESCE(ARRAY_AGG("setId" ORDER BY priority, "setId"), ARRAY[]::text[])
      FROM price_sync_sets WHERE enabled
      ON CONFLICT ("syncDate") DO UPDATE SET "syncDate" = EXCLUDED."syncDate" RETURNING "setIds", status
    `;
    if (!batch || ['completed','failed'].includes(batch.status)) return 0;
    if (!batch.setIds.length) { await this.batches.seal(day); return 0; }
    const [sets, pause] = await Promise.all([
      this.prisma.$queryRaw<EnabledSet[]>`SELECT "setId" FROM price_sync_sets WHERE enabled = TRUE AND "setId" = ANY(${batch.setIds}::text[]) ORDER BY priority, "setId"`,
      this.prisma.$queryRaw<RatePause[]>`SELECT "blockedUntil" FROM provider_rate_limits WHERE "providerId" = 'tcgcsv'`,
    ]);
    if (!sets.length) { await this.batches.seal(day); return 0; }
    const setIds = sets.map(({ setId }) => setId);
    const [dayRows, mappingRows, cardRows, cardDays] = await Promise.all([
      this.prisma.$queryRaw<{ setId: string; status: string; nextAttemptAt: Date | null }[]>(Prisma.sql`
        SELECT "setId", status, "nextAttemptAt" FROM price_sync_set_days
        WHERE provider = 'tcgcsv' AND "syncDate" = ${day}::date AND "setId" = ANY(${setIds}::text[])
      `),
      this.prisma.$queryRaw<{ setId: string; externalId: string }[]>(Prisma.sql`
        SELECT "setId", "externalId" FROM tcgcsv_set_mappings WHERE provider = 'tcgcsv'
      `),
      this.prisma.$queryRaw<{ cardId: string; setId: string }[]>(Prisma.sql`SELECT id AS "cardId", "setId" FROM cards WHERE "setId" = ANY(${setIds}::text[])`),
      this.prisma.$queryRaw<{ setId: string; pending: number }[]>(Prisma.sql`
        SELECT "setId", COUNT(*)::int AS pending FROM price_sync_card_days
        WHERE provider = 'tcgcsv' AND "syncDate" = ${day}::date AND status = 'pending'::"PriceSyncCardDayStatus"
          AND "setId" = ANY(${setIds}::text[]) GROUP BY "setId"
      `),
    ]);
    const groupScope = new Map<number, string[]>();
    const dailyTargets: Array<{ setId: string; groupId: number | null; expectedCards: number; pendingCards: number }> = [];
    for (const { setId } of sets) {
      const previous = dayRows.find((row) => row.setId === setId);
      const pin = TCGCSV_GROUPS[setId as keyof typeof TCGCSV_GROUPS];
      const mappings = mappingRows.filter((row) => row.setId === setId || (pin !== undefined && row.externalId === String(pin)));
      const invalidPin = pin !== undefined && !compatibleGroupSets(pin, mappings.map((row) => row.setId));
      const groupIds = [...new Set([...(pin === undefined ? [] : [pin]), ...mappings.map((row) => /^[1-9]\d{0,8}$/.test(row.externalId) ? Number(row.externalId) : NaN)])];
      const groupId = !invalidPin && groupIds.length === 1 && Number.isSafeInteger(groupIds[0])
        && compatibleGroupSets(groupIds[0], [setId, ...mappingRows.filter((row) => row.externalId === String(groupIds[0])).map((row) => row.setId)])
        && !mappingRows.some((sibling) => sibling.externalId === String(groupIds[0])
          && mappingRows.some((other) => other.setId === sibling.setId && other.externalId !== sibling.externalId)) ? groupIds[0] : null;
      if (groupId !== null) groupScope.set(groupId, [...(groupScope.get(groupId) ?? []), setId]);
      if (previous && !['pending', 'running', 'waiting_feed', 'waiting_cooldown'].includes(previous.status) && !(previous.status === 'blocked_mapping' && groupId !== null)) continue;
      if (previous?.nextAttemptAt && previous.nextAttemptAt > now) continue;
      const expectedCards = cardRows.filter((row) => row.setId === setId).length;
      const pendingCards = previous?.status === 'blocked_mapping' && groupId !== null
        ? expectedCards : previous ? cardDays.find((row) => row.setId === setId)?.pending ?? 0 : expectedCards;
      dailyTargets.push({ setId, groupId, expectedCards, pendingCards });
    }
    await this.batches.register(day, groupScope);
    if (!dailyTargets.length) { await this.batches.seal(day); return 0; }
    let enqueued = 0;
    await this.prisma.$transaction(async (tx) => {
      const setValues = dailyTargets.map((target) => Prisma.sql`('tcgcsv', ${target.setId}, ${day}::date,
        ${target.groupId === null ? 'blocked_mapping' : 'waiting_feed'}::"PriceSyncSetDayStatus", ${target.expectedCards}, NOW(), NOW())`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO price_sync_set_days (provider, "setId", "syncDate", status, "expectedCards", "createdAt", "updatedAt")
        VALUES ${Prisma.join(setValues)} ON CONFLICT (provider, "setId", "syncDate") DO NOTHING`);
      const cardTargets = dailyTargets.map((target) => Prisma.sql`(${target.setId}, ${target.groupId !== null})`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO price_sync_card_days (provider, "cardId", "setId", "syncDate", status, "createdAt", "updatedAt")
        SELECT 'tcgcsv', c.id, c."setId", ${day}::date,
          CASE WHEN t.mapped THEN 'pending'::"PriceSyncCardDayStatus" ELSE 'unmapped'::"PriceSyncCardDayStatus" END, NOW(), NOW()
        FROM cards c JOIN (VALUES ${Prisma.join(cardTargets)}) AS t("setId", mapped) ON t."setId" = c."setId"
        ON CONFLICT (provider, "cardId", "syncDate") DO NOTHING`);
      const unmappedIds = dailyTargets.filter((target) => target.groupId === null).map((target) => target.setId);
      if (unmappedIds.length) await tx.$executeRaw(Prisma.sql`UPDATE price_sync_set_days SET status = 'blocked_mapping'::"PriceSyncSetDayStatus",
        "finishedAt" = NOW(), "lastError" = 'El set no tiene una asociación TCGCSV segura', "updatedAt" = NOW()
        WHERE provider = 'tcgcsv' AND "setId" = ANY(${unmappedIds}::text[]) AND "syncDate" = ${day}::date
          AND status IN ('pending'::"PriceSyncSetDayStatus", 'waiting_feed'::"PriceSyncSetDayStatus", 'waiting_cooldown'::"PriceSyncSetDayStatus")`);
      const mappedIds = dailyTargets.filter((target) => target.groupId !== null).map((target) => target.setId);
      if (mappedIds.length) {
        await tx.$executeRaw(Prisma.sql`UPDATE price_sync_card_days SET status = 'pending'::"PriceSyncCardDayStatus",
          "lastError" = NULL, "updatedAt" = NOW() WHERE provider = 'tcgcsv' AND "syncDate" = ${day}::date
          AND "setId" = ANY(${mappedIds}::text[]) AND status = 'unmapped'::"PriceSyncCardDayStatus"`);
        await tx.$executeRaw(Prisma.sql`UPDATE price_sync_set_days SET status = 'waiting_feed'::"PriceSyncSetDayStatus",
          "finishedAt" = NULL, "lastError" = NULL, "updatedAt" = NOW() WHERE provider = 'tcgcsv'
          AND "setId" = ANY(${mappedIds}::text[]) AND "syncDate" = ${day}::date AND status = 'blocked_mapping'::"PriceSyncSetDayStatus"`);
      }
      if (mappedIds.length && pause[0]?.blockedUntil && pause[0].blockedUntil > now) await tx.$executeRaw(Prisma.sql`UPDATE price_sync_set_days SET status = 'waiting_cooldown'::"PriceSyncSetDayStatus",
        "nextAttemptAt" = ${pause[0].blockedUntil}, "updatedAt" = NOW()
        WHERE provider = 'tcgcsv' AND "setId" = ANY(${mappedIds}::text[]) AND "syncDate" = ${day}::date
          AND status IN ('pending'::"PriceSyncSetDayStatus", 'waiting_feed'::"PriceSyncSetDayStatus")`);
      if (mappedIds.length && (!pause[0]?.blockedUntil || pause[0].blockedUntil <= now)) await tx.$executeRaw(Prisma.sql`UPDATE price_sync_set_days SET status = 'waiting_feed'::"PriceSyncSetDayStatus",
        "nextAttemptAt" = NULL, "updatedAt" = NOW()
        WHERE provider = 'tcgcsv' AND "setId" = ANY(${mappedIds}::text[]) AND "syncDate" = ${day}::date
          AND status = 'waiting_cooldown'::"PriceSyncSetDayStatus"`);
      // Recupera importaciones genuinas de hoy anteriores al arranque del ciclo.
      await tx.$executeRaw(Prisma.sql`WITH q AS MATERIALIZED (SELECT p."cardId", MAX(p."fetchedAt") AS "checkedAt", COUNT(*)::int AS count
          FROM card_prices p JOIN cards c ON c.id = p."cardId"
          WHERE p.provider = 'tcgcsv' AND p.source = 'tcgplayer' AND p.currency = 'USD' AND p.market IS NOT NULL
            AND p."fetchedAt" >= (${day}::date::timestamp AT TIME ZONE 'UTC')
            AND p."fetchedAt" < ((${day}::date + 1)::timestamp AT TIME ZONE 'UTC')
            AND p."feedPublishedAt" >= (${day}::date::timestamp AT TIME ZONE 'UTC') + INTERVAL '20 hours'
            AND p."feedPublishedAt" < (${day}::date::timestamp AT TIME ZONE 'UTC') + INTERVAL '44 hours'
            AND c."setId" = ANY(${setIds}::text[]) GROUP BY p."cardId")
      UPDATE price_sync_card_days d SET status = 'quoted'::"PriceSyncCardDayStatus",
        "checkedAt" = q."checkedAt", "quoteCount" = q.count, "lastError" = NULL, "updatedAt" = NOW()
        FROM q
        WHERE d.provider = 'tcgcsv' AND d."syncDate" = ${day}::date AND d."cardId" = q."cardId"
          AND d.status = 'pending'::"PriceSyncCardDayStatus"`);
      await tx.$executeRaw(Prisma.sql`UPDATE price_sync_set_days d SET status = 'completed'::"PriceSyncSetDayStatus",
        "sourceCheckedAt" = (SELECT MAX(c."checkedAt") FROM price_sync_card_days c WHERE c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate"),
        "finishedAt" = NOW(), "nextAttemptAt" = NULL, "updatedAt" = NOW()
        WHERE d.provider = 'tcgcsv' AND d."syncDate" = ${day}::date AND d."setId" = ANY(${setIds}::text[])
          AND NOT EXISTS (SELECT 1 FROM price_sync_card_days c WHERE c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate" AND c.status <> 'quoted'::"PriceSyncCardDayStatus")`);
      const outstanding = await tx.$queryRaw<{ setId: string }[]>(Prisma.sql`SELECT DISTINCT "setId" FROM price_sync_card_days
        WHERE provider = 'tcgcsv' AND "syncDate" = ${day}::date AND "setId" = ANY(${setIds}::text[])
          AND status = 'pending'::"PriceSyncCardDayStatus"`);
      const pendingSets = new Set(outstanding.map((row) => row.setId));
      const groupTargets = [...new Map(dailyTargets.filter((target) => target.groupId !== null && pendingSets.has(target.setId)).map((target) => [target.groupId, target])).values()];
      enqueued = groupTargets.length;
    });
    await this.batches.seal(day);
    const active = await this.batches.active();
    if (active) await this.batches.activateJobs(active);
    return enqueued;
  }

  /** Pins revisados y registro durable: nunca resuelve nombres desde un consumidor público. */
  async groupForSet(setId: string): Promise<number | null> {
    const pin = TCGCSV_GROUPS[setId as keyof typeof TCGCSV_GROUPS];
    const mappings = await this.prisma.$queryRaw<{ externalId: string; setId: string }[]>`
      SELECT "externalId", "setId" FROM tcgcsv_set_mappings WHERE "setId" = ${setId}
        OR (${pin ?? 0} <> 0 AND "externalId" = ${String(pin ?? 0)})
    `;
    const ids = [...new Set([...(pin ? [pin] : []), ...mappings.filter((row) => row.setId === setId).map((row) => /^[1-9]\d{0,8}$/.test(row.externalId) ? Number(row.externalId) : NaN)])];
    if (ids.length !== 1 || !Number.isSafeInteger(ids[0])) return null;
    const siblings = await this.setsForGroup(ids[0]);
    return siblings.includes(setId) ? ids[0] : null;
  }

  private async setsForGroup(groupId: number): Promise<string[]> {
    const pins = Object.entries(TCGCSV_GROUPS).filter(([, id]) => id === groupId).map(([id]) => id);
    const mappings = await this.prisma.$queryRaw<{ setId: string; externalId: string }[]>`
      SELECT "setId", "externalId" FROM tcgcsv_set_mappings WHERE "setId" IN (
        SELECT "setId" FROM tcgcsv_set_mappings WHERE "externalId" = ${String(groupId)}
      ) OR "externalId" = ${String(groupId)} OR "setId" = ANY(${pins}::text[])
    `;
    const ids = [...new Set([...pins, ...mappings.filter((row) => row.externalId === String(groupId)).map((row) => row.setId)])];
    return compatibleGroupSets(groupId, ids) && !mappings.some((row) => row.externalId !== String(groupId)) ? ids : [];
  }

  @Cron('0 */10 * * * *', { timeZone: 'UTC' })
  async discover(manual = false): Promise<boolean> {
    if (!this.enabled()) return false;
    const owner = randomUUID();
    try {
      const [state] = await this.prisma.$queryRaw<DiscoveryState[]>`
        UPDATE tcgcsv_discovery_state SET "lockedBy" = ${owner}, "leaseUntil" = NOW() + INTERVAL '2 minutes',
          "nextCheckAt" = NOW() + INTERVAL '10 minutes', "updatedAt" = NOW()
        WHERE id = 'global' AND ("nextCheckAt" <= NOW() OR (${manual} AND "lastError" IS NULL))
          AND ("leaseUntil" IS NULL OR "leaseUntil" <= NOW()) RETURNING *
      `;
      if (!state) return false;
      const build = parseBuild(await this.request('last-updated.txt', 4096), this.clock());
      if (state.groupsBuild && build < state.groupsBuild) throw new Error('Build de descubrimiento retrocedió');
      let payload: unknown = state.groupsJson;
      if (buildIsNew(build, state.groupsBuild) || payload === null) {
        payload = JSON.parse(await this.request('tcgplayer/3/groups', 2 * 1024 * 1024)) as unknown;
        parseGroups(payload);
        const confirmed = parseBuild(await this.request('last-updated.txt', 4096), this.clock());
        if (confirmed.getTime() !== build.getTime()) throw new Error('Build cambió durante descubrimiento');
      }
      const [sets, existing] = await Promise.all([
        this.prisma.$queryRaw<TcgcsvLocalSet[]>`
          SELECT s.id, s.name, s.series, BOOL_AND(COALESCE(c.language = 'en', false)) AS "englishOnly"
          FROM card_sets s JOIN cards c ON c."setId" = s.id GROUP BY s.id
        `,
        this.prisma.$queryRaw<TcgcsvSetMapping[]>`
          SELECT "setId", "externalId"::int AS "groupId" FROM tcgcsv_set_mappings
          WHERE provider = 'tcgcsv' AND "externalId" ~ '^[1-9][0-9]{0,8}$'
        `,
      ]);
      const report = discoverSetMappings(sets, parseGroups(payload), existing);
      await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM tcgcsv_discovery_state WHERE id = 'global' AND "lockedBy" = ${owner} AND "leaseUntil" > NOW() FOR UPDATE`;
        if (!locked.length) throw new Error('Lease de descubrimiento vencido');
        if (report.mappings.length) {
          const rows = report.mappings.map((mapping) => Prisma.sql`(${mapping.groupId}, ${mapping.setId}, NOW())`);
          await tx.$executeRaw(Prisma.sql`INSERT INTO tcgcsv_set_groups ("groupId", "setId", "createdAt") VALUES ${Prisma.join(rows)} ON CONFLICT ("groupId", "setId") DO NOTHING`);
          const registered = await tx.$queryRaw<TcgcsvSetMapping[]>(Prisma.sql`
            SELECT "setId", "externalId"::int AS "groupId" FROM tcgcsv_set_mappings
            WHERE provider = 'tcgcsv' AND "externalId" IN (${Prisma.join(report.mappings.map((mapping) => String(mapping.groupId)))})
          `);
          if (report.mappings.some((mapping) => !registered.some((entry) => entry.setId === mapping.setId && entry.groupId === mapping.groupId))) throw new Error('Registro de grupos cambió durante descubrimiento');
        }
        await tx.$executeRaw`
          UPDATE tcgcsv_discovery_state SET "groupsBuild" = ${build}, "groupsJson" = ${JSON.stringify(payload)}::jsonb,
            report = ${JSON.stringify(report)}::jsonb, "lastError" = NULL, "lockedBy" = NULL, "leaseUntil" = NULL, "updatedAt" = NOW()
          WHERE id = 'global' AND "lockedBy" = ${owner}
        `;
      }, { timeout: 20000 });
      this.logger.log(`TCGCSV: ${report.mappings.length} sets con grupo validado, ${report.missing.length} sin asociación segura`);
      return true;
    } catch (error) {
      if (error instanceof ProviderRateLimitError && error.providerId === 'tcgcsv') {
        await this.persistProviderPause(error.retryAfterMs);
      }
      await this.prisma.$executeRaw`
        UPDATE tcgcsv_discovery_state SET "lockedBy" = NULL, "leaseUntil" = NULL,
          "lastError" = 'No se pudo validar el descubrimiento TCGCSV', "nextCheckAt" = GREATEST("nextCheckAt", NOW() + INTERVAL '1 hour'), "updatedAt" = NOW()
        WHERE id = 'global' AND "lockedBy" = ${owner} AND "leaseUntil" > NOW()
      `;
      this.logger.warn('TCGCSV conserva el registro previo; descubrimiento pendiente');
      return false;
    }
  }

  async enqueue(groupId: number, missingOnly = false): Promise<void> {
    if (!this.enabled() || (await this.setsForGroup(groupId)).length === 0) return;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO tcgcsv_group_jobs ("groupId", status, "availableAt", origin, "updatedAt") VALUES (${groupId}, 'pending', NOW(), 'interactive', NOW())
      ON CONFLICT ("groupId") DO UPDATE SET
        origin = CASE WHEN tcgcsv_group_jobs.origin = 'daily'::"PriceSyncQueueOrigin" AND tcgcsv_group_jobs.status = 'pending'
          THEN 'daily'::"PriceSyncQueueOrigin" ELSE 'interactive'::"PriceSyncQueueOrigin" END,
        status = CASE WHEN tcgcsv_group_jobs.status IN ('completed','failed') THEN 'pending' ELSE tcgcsv_group_jobs.status END, "updatedAt" = NOW(),
        "availableAt" = GREATEST(tcgcsv_group_jobs."availableAt", COALESCE(tcgcsv_group_jobs."downloadStartedAt" + INTERVAL '24 hours', NOW()))
      WHERE tcgcsv_group_jobs.status <> 'processing' AND (${missingOnly} = false OR tcgcsv_group_jobs."publishedBuild" IS NULL)
    `);
  }

  /** Resuelve un lote local de cartas a grupos sin consultas por cada set. */
  async enqueueCards(cardIds: readonly string[]): Promise<number> {
    if (!this.enabled() || cardIds.length === 0) return 0;
    const pins = Object.entries(TCGCSV_GROUPS).map(([setId, groupId]) => Prisma.sql`(${setId}, ${String(groupId)})`);
    const rows = await this.prisma.$queryRaw<{ groupId: number }[]>(Prisma.sql`
      WITH pins("setId", "externalId") AS (VALUES ${Prisma.join(pins)}), requested AS (
        SELECT DISTINCT "setId" FROM cards WHERE id = ANY(${[...new Set(cardIds)]}::text[])
      ), identities AS (
        SELECT p."setId", p."externalId" FROM pins p JOIN requested r ON r."setId" = p."setId"
        UNION ALL
        SELECT x."setId", x."externalId" FROM tcgcsv_set_mappings x
        JOIN requested r ON r."setId" = x."setId" WHERE x.provider = 'tcgcsv'
      ), groups AS (
        SELECT "setId", MIN("externalId") AS "externalId" FROM identities
        GROUP BY "setId" HAVING COUNT(DISTINCT "externalId") = 1 AND BOOL_AND("externalId" ~ '^[1-9][0-9]{0,8}$')
      ), safe AS (
        SELECT DISTINCT g."externalId"::int AS "groupId" FROM groups g
        WHERE NOT EXISTS (SELECT 1 FROM tcgcsv_set_mappings x
          WHERE x.provider = 'tcgcsv' AND x."externalId" = g."externalId" AND x."setId" <> g."setId"
            AND NOT ((g."externalId" = '1543' AND g."setId" IN ('tk1a','tk1b') AND x."setId" IN ('tk1a','tk1b'))
              OR (g."externalId" = '1542' AND g."setId" IN ('tk2a','tk2b') AND x."setId" IN ('tk2a','tk2b'))))
          AND NOT EXISTS (SELECT 1 FROM pins p WHERE p."externalId" = g."externalId" AND p."setId" <> g."setId")
          AND NOT EXISTS (SELECT 1 FROM tcgcsv_set_mappings sibling JOIN tcgcsv_set_mappings other ON other."setId" = sibling."setId"
            WHERE sibling."externalId" = g."externalId" AND other."externalId" <> g."externalId")
      )
      INSERT INTO tcgcsv_group_jobs ("groupId", status, "availableAt", origin, "updatedAt")
      SELECT "groupId", 'pending', NOW(), 'interactive', NOW() FROM safe WHERE true
      ON CONFLICT ("groupId") DO UPDATE SET
        origin = CASE WHEN tcgcsv_group_jobs.origin = 'daily'::"PriceSyncQueueOrigin" AND tcgcsv_group_jobs.status = 'pending'
          THEN 'daily'::"PriceSyncQueueOrigin" ELSE 'interactive'::"PriceSyncQueueOrigin" END,
        status = 'pending', "updatedAt" = NOW(),
        "availableAt" = GREATEST(tcgcsv_group_jobs."availableAt", COALESCE(tcgcsv_group_jobs."downloadStartedAt" + INTERVAL '24 hours', NOW()))
      WHERE tcgcsv_group_jobs.status IN ('completed', 'failed')
        OR (tcgcsv_group_jobs.status = 'pending' AND tcgcsv_group_jobs.origin <> 'interactive')
      RETURNING "groupId"
    `);
    return rows.length;
  }

  @Cron('*/5 * * * * *', { timeZone: 'UTC' })
  async poll(): Promise<void> {
    if (!this.enabled() || this.busy) return;
    this.busy = true;
    try { await this.runOne(); } catch { this.logger.warn('No se pudo procesar la cola TCGCSV'); }
    finally { this.busy = false; }
  }

  /** Sin grupo, consume sólo la tanda diaria. El grupo explícito es una unidad de ingesta para harnesses internos. */
  async runOne(groupId?: number): Promise<boolean> {
    if (!this.enabled()) return false;
    if (groupId !== undefined) return this.consumeOne(groupId);
    const owner = randomUUID();
    if (!await this.batches.acquire(owner)) return false;
    try { return await this.consumeOne(undefined, owner); }
    finally { await this.batches.release(owner); }
  }

  private async consumeOne(groupId?: number, workerOwner?: string): Promise<boolean> {
    let batch: ActiveTcgcsvBatch | null = null;
    if (groupId === undefined) {
      batch = await this.batches.active();
      if (!batch || (batch.nextAttemptAt && batch.nextAttemptAt > this.clock())) return false;
      if (!batch.feedPublishedAt) {
        const opening = batch;
        try {
          const build = parseBuild(await this.request('last-updated.txt', 4096), this.clock());
          batch = await this.batches.bind(batch, build);
          if (!batch) return false;
        } catch (error) {
          if (error instanceof ProviderRateLimitError && error.providerId === 'tcgcsv') await this.persistProviderPause(error.retryAfterMs);
          await this.batches.manifestFailed(opening, `No se pudo consultar la publicación: ${failureReason(error)}`);
          return false;
        }
      }
      await this.batches.activateJobs(batch);
    }
    const [pause] = await this.prisma.$queryRaw<RatePause[]>`SELECT "blockedUntil" FROM provider_rate_limits WHERE "providerId" = 'tcgcsv'`;
    if (pause?.blockedUntil && pause.blockedUntil > this.clock()) return false;
    const owner = workerOwner ?? randomUUID();
    const pinnedMatches = Object.entries(TCGCSV_GROUPS).map(([setId, id]) => Prisma.sql`(s."setId" = ${setId} AND j."groupId" = ${id})`);
    const dailyGroupMatch = Prisma.sql`(EXISTS (SELECT 1 FROM tcgcsv_set_mappings x WHERE x.provider = 'tcgcsv'
      AND x."setId" = s."setId" AND x."externalId" = j."groupId"::text) OR (${Prisma.join(pinnedMatches, ' OR ')}))`;
    // Un reinicio recupera el lease vencido sin borrar la reserva durable de 24 h.
    await this.prisma.$executeRaw`
      UPDATE tcgcsv_group_jobs SET status = 'pending', "lockedBy" = NULL, "leaseUntil" = NULL,
        "availableAt" = GREATEST("availableAt", COALESCE("downloadStartedAt" + INTERVAL '24 hours', NOW())), "updatedAt" = NOW()
      WHERE status = 'processing' AND "leaseUntil" <= NOW()
    `;
    const [job] = await this.prisma.$queryRaw<GroupJob[]>`
      UPDATE tcgcsv_group_jobs SET status = 'processing', "lockedBy" = ${owner}, "leaseUntil" = NOW() + INTERVAL '2 minutes', "updatedAt" = NOW()
      WHERE "groupId" = (SELECT j."groupId" FROM tcgcsv_group_jobs j
        WHERE j.status = 'pending' AND j.origin IN ('daily'::"PriceSyncQueueOrigin", 'interactive'::"PriceSyncQueueOrigin")
        AND (${groupId ?? 0} <> 0 OR NOT EXISTS (SELECT 1 FROM tcgcsv_group_jobs busy
          WHERE busy.status = 'processing' AND busy."leaseUntil" > NOW()))
        AND (${groupId ?? 0} <> 0 OR (j.origin = 'daily'::"PriceSyncQueueOrigin"
          AND j."syncDate" = ${batch?.syncDate ?? null}::date AND EXISTS (SELECT 1 FROM tcgcsv_batch_groups g
            WHERE g."syncDate" = j."syncDate" AND g."groupId" = j."groupId" AND g.status = 'pending')))
        AND (j.origin = 'interactive'::"PriceSyncQueueOrigin" OR (j."syncDate" = COALESCE(${batch?.syncDate ?? null}::date, (NOW() AT TIME ZONE 'UTC')::date) AND EXISTS (
          SELECT 1 FROM price_sync_sets s JOIN price_sync_card_days d ON d."setId" = s."setId"
          WHERE s.enabled AND ${dailyGroupMatch} AND d.provider = 'tcgcsv' AND d."syncDate" = j."syncDate"
            AND d.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus")
        ))) AND (j."availableAt" <= NOW() OR (j.origin = 'daily'::"PriceSyncQueueOrigin" AND j."publishedBuild" IS NOT NULL AND EXISTS (
          SELECT 1 FROM price_sync_set_days f JOIN price_sync_sets s ON s."setId" = f."setId"
          WHERE s.enabled AND f.provider = 'tcgcsv' AND f."syncDate" = j."syncDate" AND f.status IN ('waiting_feed'::"PriceSyncSetDayStatus", 'waiting_cooldown'::"PriceSyncSetDayStatus")
            AND f."nextAttemptAt" <= NOW() AND ${dailyGroupMatch}
        )))
        AND (j.origin = 'daily'::"PriceSyncQueueOrigin" OR j."downloadStartedAt" IS NULL OR j."downloadStartedAt" <= NOW() - INTERVAL '24 hours')
        AND (${groupId ?? 0} = 0 OR j."groupId" = ${groupId ?? 0})
        ORDER BY CASE WHEN j.origin = 'interactive'::"PriceSyncQueueOrigin" THEN 0 ELSE 1 END,
          CASE WHEN j.origin = 'daily'::"PriceSyncQueueOrigin" THEN (SELECT MIN(s.priority) FROM price_sync_sets s
            JOIN price_sync_card_days d ON d."setId" = s."setId" WHERE s.enabled AND ${dailyGroupMatch}
              AND d.provider = 'tcgcsv' AND d."syncDate" = j."syncDate") ELSE 0 END,
          j."availableAt", j."groupId" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *
    `;
    if (!job) return false;
    let resolvedSetIds: string[] = [];
    let madeHttpRequest = false;
    let consumedFile = false;
    let failurePhase = 'group_identity';
    try {
      if (batch) await this.batches.claim(batch.syncDate, job.groupId);
      resolvedSetIds = await this.setsForGroup(job.groupId);
      if (resolvedSetIds.length === 0) throw new Error('Grupo sin registro validado');
      const setIds = resolvedSetIds;
      failurePhase = 'manifest';
      const buildText = await this.request('last-updated.txt', 4096, () => { madeHttpRequest = true; });
      const build = parseBuild(buildText, this.clock());
      if (batch?.feedPublishedAt && build.getTime() !== batch.feedPublishedAt.getTime()) {
        await this.batches.failRemaining(batch.syncDate, 'La fuente cambió de publicación; no se mezcla otro feed dentro de la tanda');
        return true;
      }
      if (job.publishedBuild !== null && build <= job.publishedBuild) {
        if (build < job.publishedBuild) throw new Error('Build TCGCSV retrocedió');
        if (batch) {
          await this.batches.groupFailed(batch.syncDate, job.groupId, owner,
            'La publicación ya existe pero no hay un resultado confirmado para este grupo en la tanda', true);
          return true;
        }
        await this.markNoNewFeed(job, owner, build, setIds);
        return true;
      }
      const reserved = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.$executeRaw`
          UPDATE tcgcsv_group_jobs SET "downloadStartedAt" = NOW(), "availableAt" = GREATEST("availableAt", NOW() + INTERVAL '24 hours')
          WHERE "groupId" = ${job.groupId} AND "lockedBy" = ${owner} AND "leaseUntil" > NOW()
            AND ("downloadStartedAt" IS NULL OR "downloadStartedAt" <= NOW() - INTERVAL '24 hours')
        `;
        if (changed === 1) await tx.$executeRaw`
          UPDATE tcgcsv_discovery_state SET
            "downloadCount" = CASE WHEN "downloadWindowStartedAt" <= NOW() - INTERVAL '24 hours' THEN 1 ELSE "downloadCount" + 1 END,
            "downloadWindowStartedAt" = CASE WHEN "downloadWindowStartedAt" <= NOW() - INTERVAL '24 hours' THEN NOW() ELSE "downloadWindowStartedAt" END,
            "updatedAt" = NOW() WHERE id = 'global'
        `;
        return changed;
      });
      if (reserved !== 1) {
        await this.finish(job.groupId, owner, 'pending', 3600000);
        if (resolvedSetIds.length) await this.prisma.$executeRaw`UPDATE price_sync_set_days SET status = 'waiting_cooldown'::"PriceSyncSetDayStatus",
          "nextAttemptAt" = GREATEST(NOW() + INTERVAL '1 hour', COALESCE((SELECT "downloadStartedAt" + INTERVAL '24 hours'
            FROM tcgcsv_group_jobs WHERE "groupId" = ${job.groupId}), NOW())), "updatedAt" = NOW()
          WHERE provider = 'tcgcsv' AND "setId" = ANY(${resolvedSetIds}::text[]) AND "syncDate" = ${job.syncDate ?? new Date(Date.UTC(this.clock().getUTCFullYear(), this.clock().getUTCMonth(), this.clock().getUTCDate()))}::date`;
        if (batch) await this.prisma.$executeRaw`UPDATE tcgcsv_batch_groups SET status = 'pending',
          "nextAttemptAt" = (SELECT "availableAt" FROM tcgcsv_group_jobs WHERE "groupId" = ${job.groupId})
          WHERE "syncDate" = ${batch.syncDate}::date AND "groupId" = ${job.groupId} AND status = 'processing'`;
        return true;
      }
      consumedFile = true;
      failurePhase = 'products';
      const productsText = await this.requestContent(job.groupId, owner, 'products', () => { madeHttpRequest = true; });
      const products = parseProducts(JSON.parse(productsText) as unknown, job.groupId);
      failurePhase = 'prices';
      const pricesText = await this.requestContent(job.groupId, owner, 'prices', () => { madeHttpRequest = true; });
      const prices = parsePrices(JSON.parse(pricesText) as unknown, products);
      failurePhase = 'build_confirmation';
      const confirmedBuild = parseBuild(await this.request('last-updated.txt', 4096, () => { madeHttpRequest = true; }), this.clock());
      if (build.getTime() !== confirmedBuild.getTime()) throw new Error('Build TCGCSV cambió durante la descarga');
      const checksum = createHash('sha256').update(productsText).update('\n').update(pricesText).digest('hex');
      failurePhase = 'publication';
      await this.prisma.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<GroupJob[]>`
          SELECT * FROM tcgcsv_group_jobs WHERE "groupId" = ${job.groupId} AND "lockedBy" = ${owner} AND "leaseUntil" > NOW() FOR UPDATE
        `;
        if (!locked || (locked.publishedBuild !== null && locked.publishedBuild >= build)) throw new Error('Lease TCGCSV vencido o build ya publicado');
        if (batch) {
          const [active] = await tx.$queryRaw<{ groupId: number }[]>`SELECT g."groupId" FROM tcgcsv_batch_groups g
            JOIN tcgcsv_daily_batches b ON b."syncDate" = g."syncDate"
            WHERE g."syncDate" = ${batch.syncDate}::date AND g."groupId" = ${job.groupId} AND g.status = 'processing'
              AND b.status = 'running' AND b."feedPublishedAt" = ${build} FOR UPDATE OF g, b`;
          if (!active) throw new Error('La tanda ya está cerrada o cambió de publicación');
          const [worker] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM tcgcsv_discovery_state
            WHERE id = 'global' AND "workerLockedBy" = ${owner} AND "workerLeaseUntil" > NOW() FOR UPDATE`;
          if (!worker) throw new Error('Lease TCGCSV global vencido');
        }
        const cards = await tx.$queryRaw<LocalTcgcsvCard[]>`
          SELECT c.id, c.name, c.number, c.language, c."setId", s."printedTotal", e."externalId"
          FROM cards c JOIN card_sets s ON s.id = c."setId"
          LEFT JOIN card_external_ids e ON e."cardId" = c.id AND e.provider = 'tcgcsv'
          WHERE c."setId" = ANY(${setIds}::text[])
        `;
        failurePhase = 'product_identity';
        const mapped = matchProducts(cards.map((card) => ({ ...card, externalId: card.externalId ?? undefined })), products, { ...TCGCSV_GROUPS, ...Object.fromEntries(setIds.map((id) => [id, job.groupId])) });
        if (mapped.size === 0) throw new Error('Lote TCGCSV sin identidad de productos validada');
        failurePhase = 'compatible_quotes';
        const observations = prices.filter((price) => price.variant !== '' && mapped.has(price.productId));
        if (observations.length === 0) throw new Error('Lote TCGCSV sin cotizaciones compatibles');
        // Una colección de precios válida puede omitir productos sin cotización.
        // Se registran como no_quote; no invalidan los precios recibidos ni renuevan los anteriores.
        failurePhase = 'publication';
        const runId = randomUUID();
        const at = this.clock();
        const outcomeDay = batch?.syncDate ?? new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
        await tx.$executeRaw`
          INSERT INTO price_ingestion_runs (id, provider, "groupId", "feedPublishedAt", checksum, "publishedAt", "mappedCards", "unmappedCards", observations)
          VALUES (${runId}, 'tcgcsv', ${job.groupId}, ${build}, ${checksum}, ${at}, ${mapped.size}, ${cards.length - mapped.size}, ${observations.length})
        `;
        // SQL por lotes: la publicación incluye mapeos y todas las observaciones o hace rollback.
        if (mapped.size > 0) {
          const mappings = [...mapped].map(([productId, cardId]) => Prisma.sql`('tcgcsv', ${String(productId)}, ${cardId}, ${at})`);
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO card_external_ids (provider, "externalId", "cardId", "createdAt") VALUES ${Prisma.join(mappings)}
            ON CONFLICT (provider, "externalId") DO NOTHING
          `);
          const conflicts = await tx.$queryRaw<{ externalId: string; cardId: string }[]>(Prisma.sql`
            SELECT "externalId", "cardId" FROM card_external_ids WHERE provider = 'tcgcsv' AND "externalId" IN (${Prisma.join([...mapped.keys()].map(String))})
          `);
          if (conflicts.some((entry) => mapped.get(Number(entry.externalId)) !== entry.cardId)) throw new Error('Mapeo TCGCSV previamente asociado a otra carta');
        }
        if (observations.length > 0) {
          const rows = observations.map((price) => Prisma.sql`(${randomUUID()}, ${mapped.get(price.productId)!}, ${price.variant},
            ${price.low}, ${price.mid}, ${price.high}, ${price.market}, 'tcgcsv', 'tcgplayer', 'USD', ${at}, ${build},
            ${job.groupId}, ${price.productId}, ${price.subTypeName}, ${runId}, ${checksum})`);
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO card_prices (id, "cardId", variant, low, mid, high, market, provider, source, currency, "fetchedAt", "feedPublishedAt",
              "externalGroupId", "externalProductId", "externalSubtype", "ingestionRunId", "ingestionChecksum") VALUES ${Prisma.join(rows)}
          `);
        }
        await tx.$executeRaw`
          UPDATE tcgcsv_group_jobs SET status = 'completed', "publishedBuild" = ${build}, "lastError" = NULL,
            "lockedBy" = NULL, "leaseUntil" = NULL, "updatedAt" = NOW() WHERE "groupId" = ${job.groupId} AND "lockedBy" = ${owner}
        `;
        const mappedByCard = new Map([...mapped].map(([productId, cardId]) => [cardId, productId]));
        const marketCount = new Map<number, number>();
        for (const price of observations) if (price.market !== null) marketCount.set(price.productId, (marketCount.get(price.productId) ?? 0) + 1);
        const resultRows = cards.map((card) => {
          const productId = mappedByCard.get(card.id);
          const quoteCount = productId === undefined ? 0 : marketCount.get(productId) ?? 0;
          return { cardId: card.id, status: productId === undefined ? 'unmapped' : quoteCount > 0 ? 'quoted' : 'no_quote', quoteCount };
        });
        await tx.$executeRaw`INSERT INTO price_sync_set_days (provider, "setId", "syncDate", status, "expectedCards", "createdAt", "updatedAt")
          SELECT 'tcgcsv', c."setId", ${outcomeDay}::date, 'running'::"PriceSyncSetDayStatus", COUNT(*)::int, NOW(), NOW()
          FROM cards c WHERE c."setId" = ANY(${setIds}::text[]) GROUP BY c."setId"
          ON CONFLICT (provider, "setId", "syncDate") DO NOTHING`;
        await tx.$executeRaw`INSERT INTO price_sync_card_days (provider, "cardId", "setId", "syncDate", status, "createdAt", "updatedAt")
          SELECT 'tcgcsv', c.id, c."setId", ${outcomeDay}::date, 'pending'::"PriceSyncCardDayStatus", NOW(), NOW()
          FROM cards c WHERE c."setId" = ANY(${setIds}::text[]) ON CONFLICT (provider, "cardId", "syncDate") DO NOTHING`;
        await tx.$executeRaw`UPDATE price_sync_card_days d SET status = r.status::"PriceSyncCardDayStatus",
          "checkedAt" = ${at}, "quoteCount" = r."quoteCount", "lastError" = NULL, "updatedAt" = NOW()
          FROM jsonb_to_recordset(${JSON.stringify(resultRows)}::jsonb) AS r("cardId" text, status text, "quoteCount" integer)
          WHERE d.provider = 'tcgcsv' AND d."syncDate" = ${outcomeDay}::date AND d."cardId" = r."cardId"`;
        await tx.$executeRaw`UPDATE price_sync_set_days d SET status = CASE
            WHEN EXISTS (SELECT 1 FROM price_sync_card_days c WHERE c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate"
              AND c.status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus")) THEN 'running'::"PriceSyncSetDayStatus"
            WHEN EXISTS (SELECT 1 FROM price_sync_card_days c WHERE c.provider = d.provider AND c."setId" = d."setId" AND c."syncDate" = d."syncDate"
              AND c.status <> 'quoted'::"PriceSyncCardDayStatus") THEN 'partial'::"PriceSyncSetDayStatus"
            ELSE 'completed'::"PriceSyncSetDayStatus" END,
          "feedPublishedAt" = ${build}, "sourceCheckedAt" = ${at}, "startedAt" = COALESCE("startedAt", ${at}),
          "finishedAt" = ${at}, "nextAttemptAt" = NULL, "lastError" = NULL, "updatedAt" = NOW()
          WHERE d.provider = 'tcgcsv' AND d."setId" = ANY(${setIds}::text[]) AND d."syncDate" = ${outcomeDay}::date`;
        if (batch) await tx.$executeRaw`UPDATE tcgcsv_batch_groups SET status = 'completed', "finishedAt" = ${at},
          "lastError" = NULL, "nextAttemptAt" = NULL WHERE "syncDate" = ${batch.syncDate}::date AND "groupId" = ${job.groupId}`;
      }, { timeout: 20000 });
      if (batch) await this.batches.finish(batch.syncDate);
      try { await this.snapshots.capture(); }
      catch { this.logger.warn('El lote TCGCSV se publicó; quedó pendiente el corte de colecciones'); }
    } catch (error) {
      if (batch) {
        if (error instanceof ProviderRateLimitError && error.providerId === 'tcgcsv') await this.persistProviderPause(error.retryAfterMs);
        await this.batches.groupFailed(batch.syncDate, job.groupId, owner,
          `Falló el grupo TCGCSV (fase: ${failurePhase}): ${failureReason(error)}; ${consumedFile ? 'archivo consumido, se conserva la reserva de 24 horas' : 'sin descargar contenido'}`,
          consumedFile || failurePhase !== 'manifest');
        this.logger.warn(`El grupo TCGCSV ${job.groupId} registra su fallo en la tanda y conserva el precio previo`);
        return true;
      }
      if (error instanceof ProviderRateLimitError && error.providerId === 'tcgcsv') {
        const until = await this.persistProviderPause(error.retryAfterMs);
        await this.finish(job.groupId, owner, 'pending', error.retryAfterMs);
        if (resolvedSetIds.length && madeHttpRequest) await this.recordRunFailure(job.groupId, resolvedSetIds, job.syncDate, until, 'waiting_cooldown', 'TCGCSV solicitó una pausa temporal');
      } else {
        const message = `No se pudo validar o publicar el lote TCGCSV (fase: ${failurePhase})`;
        await this.finish(job.groupId, owner, 'failed', 3600000, message);
        if (resolvedSetIds.length && madeHttpRequest) await this.recordRunFailure(job.groupId, resolvedSetIds, job.syncDate, new Date(this.clock().getTime() + 3600000), 'waiting_feed', message);
      }
      this.logger.warn(`El grupo TCGCSV ${job.groupId} conserva el último lote publicado`);
    }
    return true;
  }

  private async markNoNewFeed(job: GroupJob, owner: string, build: Date, setIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE tcgcsv_group_jobs SET status = 'completed', "lockedBy" = NULL, "leaseUntil" = NULL,
        "availableAt" = GREATEST("availableAt", COALESCE("downloadStartedAt" + INTERVAL '24 hours', NOW()), NOW() + INTERVAL '15 minutes'),
        "lastError" = NULL, "updatedAt" = NOW()
        WHERE "groupId" = ${job.groupId} AND "lockedBy" = ${owner}`;
      if (!job.syncDate) return;
      await tx.$executeRaw`UPDATE price_sync_set_days SET status = 'waiting_feed'::"PriceSyncSetDayStatus",
        "sourceCheckedAt" = ${this.clock()}, "feedPublishedAt" = ${build}, "nextAttemptAt" = NOW() + INTERVAL '15 minutes',
        "lastError" = NULL, "updatedAt" = NOW() WHERE provider = 'tcgcsv' AND "setId" = ANY(${setIds}::text[]) AND "syncDate" = ${job.syncDate ?? new Date(Date.UTC(this.clock().getUTCFullYear(), this.clock().getUTCMonth(), this.clock().getUTCDate()))}::date
        AND status IN ('waiting_feed'::"PriceSyncSetDayStatus", 'waiting_cooldown'::"PriceSyncSetDayStatus", 'running'::"PriceSyncSetDayStatus")`;
    });
  }

  private async recordRunFailure(groupId: number, setIds: string[], syncDate: Date | null, nextAttemptAt: Date, status: 'waiting_feed' | 'waiting_cooldown', message: string): Promise<void> {
    const day = syncDate ?? new Date(Date.UTC(this.clock().getUTCFullYear(), this.clock().getUTCMonth(), this.clock().getUTCDate()));
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE price_sync_card_days SET attempts = attempts + 1,
        status = CASE WHEN attempts + 1 >= 5 THEN 'failed'::"PriceSyncCardDayStatus" ELSE 'pending'::"PriceSyncCardDayStatus" END,
        "lastError" = ${message}, "updatedAt" = NOW()
        WHERE provider = 'tcgcsv' AND "setId" = ANY(${setIds}::text[]) AND "syncDate" = ${day}::date
          AND status IN ('pending'::"PriceSyncCardDayStatus", 'processing'::"PriceSyncCardDayStatus")`;
      const [counts] = await tx.$queryRaw<{ pending: number; failed: number }[]>`SELECT
        COUNT(*) FILTER (WHERE status = 'pending'::"PriceSyncCardDayStatus")::int AS pending,
        COUNT(*) FILTER (WHERE status = 'failed'::"PriceSyncCardDayStatus")::int AS failed
        FROM price_sync_card_days WHERE provider = 'tcgcsv' AND "setId" = ANY(${setIds}::text[]) AND "syncDate" = ${day}::date`;
      if ((counts?.pending ?? 0) === 0 && (counts?.failed ?? 0) > 0) await tx.$executeRaw`UPDATE tcgcsv_group_jobs
        SET status = 'failed', "updatedAt" = NOW() WHERE "groupId" = ${groupId} AND "syncDate" = ${day}::date AND status = 'pending'`;
      await tx.$executeRaw`UPDATE price_sync_set_days d SET
        status = CASE WHEN c.pending > 0 THEN ${status}::"PriceSyncSetDayStatus"
          WHEN c.failed > 0 THEN 'failed'::"PriceSyncSetDayStatus" ELSE 'partial'::"PriceSyncSetDayStatus" END,
        "nextAttemptAt" = CASE WHEN c.pending > 0 THEN ${nextAttemptAt} ELSE NULL END,
        "finishedAt" = CASE WHEN c.pending > 0 THEN NULL ELSE NOW() END,
        "lastError" = ${message}, "updatedAt" = NOW()
        FROM (SELECT "setId", COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed FROM price_sync_card_days
          WHERE provider = 'tcgcsv' AND "setId" = ANY(${setIds}::text[]) AND "syncDate" = ${day}::date GROUP BY "setId") c
        WHERE d.provider = 'tcgcsv' AND d."setId" = c."setId" AND d."syncDate" = ${day}::date
          AND d.status IN ('pending', 'running', 'waiting_feed', 'waiting_cooldown')`;

    });
  }

  private async persistProviderPause(retryAfterMs: number): Promise<Date> {
    const until = new Date(this.clock().getTime() + retryAfterMs);
    await this.prisma.$executeRaw`INSERT INTO provider_rate_limits ("providerId", "lastCalledAt", "blockedUntil", "updatedAt")
      VALUES ('tcgcsv', NOW(), ${until}, NOW()) ON CONFLICT ("providerId") DO UPDATE SET
      "blockedUntil" = GREATEST(COALESCE(provider_rate_limits."blockedUntil", NOW()), EXCLUDED."blockedUntil"), "updatedAt" = NOW()`;
    const [result] = await this.prisma.$queryRaw<RatePause[]>`SELECT "blockedUntil" FROM provider_rate_limits WHERE "providerId" = 'tcgcsv'`;
    return result?.blockedUntil ?? until;
  }

  private async finish(groupId: number, owner: string, status: string, backoffMs: number, message = 'No se pudo validar o publicar el lote TCGCSV'): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE tcgcsv_group_jobs SET status = ${status}, "lockedBy" = NULL, "leaseUntil" = NULL,
        "lastError" = CASE WHEN ${status} = 'failed' THEN ${message} ELSE NULL END,
        "availableAt" = GREATEST("availableAt", NOW() + ${backoffMs} * INTERVAL '1 millisecond'), "updatedAt" = NOW()
      WHERE "groupId" = ${groupId} AND "lockedBy" = ${owner} AND "leaseUntil" > NOW()
    `;
  }

  private async request(path: string, maxBytes: number, onHttpAttempt?: () => void): Promise<string> {
    const [pause] = await this.prisma.$queryRaw<RatePause[]>`SELECT "blockedUntil" FROM provider_rate_limits WHERE "providerId" = 'tcgcsv'`;
    if (pause?.blockedUntil && pause.blockedUntil > this.clock()) {
      throw new ProviderRateLimitError('tcgcsv', pause.blockedUntil.getTime() - this.clock().getTime());
    }
    // Contadores informativos de 24 h: no son topes globales. La reserva por archivo sigue siendo obligatoria.
    await this.prisma.$executeRaw`
      UPDATE tcgcsv_discovery_state SET
        "requestCount" = CASE WHEN "requestWindowStartedAt" <= NOW() - INTERVAL '24 hours' THEN 1 ELSE "requestCount" + 1 END,
        "requestWindowStartedAt" = CASE WHEN "requestWindowStartedAt" <= NOW() - INTERVAL '24 hours' THEN NOW() ELSE "requestWindowStartedAt" END,
        "updatedAt" = NOW() WHERE id = 'global'
    `;
    // Reserva el ritmo en PostgreSQL: el mínimo se aplica también entre procesos/grupos.
    await this.prisma.$executeRaw`
      INSERT INTO provider_rate_limits ("providerId", "lastCalledAt", "updatedAt") VALUES ('tcgcsv', NOW() - INTERVAL '1 second', NOW())
      ON CONFLICT ("providerId") DO NOTHING
    `;
    const [slot] = await this.prisma.$queryRaw<{ waitMs: number }[]>`
      UPDATE provider_rate_limits SET "lastCalledAt" = GREATEST(NOW(), "lastCalledAt" + INTERVAL '150 milliseconds'), "updatedAt" = NOW()
      WHERE "providerId" = 'tcgcsv' AND ("blockedUntil" IS NULL OR "blockedUntil" <= NOW())
      RETURNING GREATEST(0, EXTRACT(EPOCH FROM ("lastCalledAt" - NOW())) * 1000)::float8 AS "waitMs"
    `;
    if (!slot) {
      const [blocked] = await this.prisma.$queryRaw<RatePause[]>`SELECT "blockedUntil" FROM provider_rate_limits WHERE "providerId" = 'tcgcsv'`;
      throw new ProviderRateLimitError('tcgcsv', Math.max(1, (blocked?.blockedUntil?.getTime() ?? this.clock().getTime() + 15 * 60_000) - this.clock().getTime()));
    }
    if (slot && slot.waitMs > 0) await delay(slot.waitMs);
    const [currentPause] = await this.prisma.$queryRaw<RatePause[]>`SELECT "blockedUntil" FROM provider_rate_limits WHERE "providerId" = 'tcgcsv'`;
    if (currentPause?.blockedUntil && currentPause.blockedUntil > this.clock()) throw new ProviderRateLimitError('tcgcsv', currentPause.blockedUntil.getTime() - this.clock().getTime());
    onHttpAttempt?.();
    return this.client.fetchFeed(path, maxBytes);
  }

  private async requestContent(groupId: number, owner: string, file: 'products' | 'prices', onHttpAttempt?: () => void): Promise<string> {
    const startedAt = this.clock();
    const reserved = await this.prisma.$executeRaw`
      UPDATE tcgcsv_group_jobs SET "downloadStartedAt" = GREATEST("downloadStartedAt", NOW(), ${startedAt}),
        "availableAt" = GREATEST("availableAt", NOW() + INTERVAL '24 hours 2 minutes', ${startedAt} + INTERVAL '24 hours 2 minutes')
      WHERE "groupId" = ${groupId} AND "lockedBy" = ${owner} AND "leaseUntil" > NOW()
    `;
    if (reserved !== 1) throw new Error('Lease de descarga vencido');
    try { return await this.request(`tcgplayer/3/${groupId}/${file}`, 8 * 1024 * 1024, onHttpAttempt); }
    finally {
      // El margen previo cubre timeout/espera si el proceso muere antes del finally.
      // El presupuesto termina después de leer el cuerpo, también si falla o vence el lease.
      const finishedAt = this.clock();
      await this.prisma.$executeRaw`
        UPDATE tcgcsv_group_jobs SET "downloadStartedAt" = GREATEST("downloadStartedAt", NOW(), ${finishedAt}),
          "availableAt" = GREATEST("availableAt", NOW() + INTERVAL '24 hours', ${finishedAt} + INTERVAL '24 hours') WHERE "groupId" = ${groupId}
      `;
    }
  }
}
