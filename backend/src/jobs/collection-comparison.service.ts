import { Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/index.js';
import { PRICE_PROVIDER, type PriceProvider } from '../modules/providers/card-provider.interface.js';
import { COMPARISON_CLOCK, type ComparisonClock } from './comparison-clock.js';
import { COMPARISON_POLICY, COMPARISON_PROVIDERS, type CollectionComparisonDto, type CollectionComparisonPointDto, type ComparisonProvider } from './comparison.dto.js';

interface SnapshotRow {
  day: Date; provider: ComparisonProvider; valueUsd: Prisma.Decimal | null;
  totalCopies: number; pricedCopies: number; freshCopies: number; staleCopies: number; unknownFreshnessCopies: number;
  oldestFetchedAt: Date | null; newestFetchedAt: Date | null; feedPublishedAt: Date | null;
  compositionFingerprint: string; compositionChanged: boolean; evaluatedAt: Date;
}

@Injectable()
export class CollectionComparisonService {
  constructor(private readonly prisma: PrismaService,
    @Inject(PRICE_PROVIDER) private readonly active: PriceProvider,
    @Optional() @Inject(COMPARISON_CLOCK) private readonly clock: ComparisonClock = () => new Date()) {}

  @Cron('35 20 * * *', { timeZone: 'UTC' })
  async daily(): Promise<void> {
    if (process.env.ENABLE_COLLECTION_COMPARISON_CRON !== 'true') return;
    await this.capture();
  }

  /** Una única sentencia toma cantidades y referencias de ambos proveedores con el mismo snapshot MVCC. */
  async capture(userId: string | null = null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Serializa cortes entre lectores y crons; nunca mezcla dos snapshots del mismo usuario.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(732147201)::text`;
      const at = this.clock();
      const day = at.toISOString().slice(0, 10);
      const future = await tx.$queryRaw<{ present: boolean }[]>`
        SELECT true AS present FROM collection_comparison_snapshots s JOIN collections c ON c.id = s."collectionId"
        WHERE (${userId}::text IS NULL OR c."userId" = ${userId}) AND s.day > ${day}::date LIMIT 1
      `;
      if (future.length > 0) throw new ServiceUnavailableException('El reloj de comparación retrocedió; se conservaron los cortes cerrados');
      const freshSince = new Date(at.getTime() - 86400000);
      const cut = randomUUID();
      await tx.$executeRaw(Prisma.sql`
        WITH scope AS (
          SELECT c.id, c."userId", COUNT(*) OVER (PARTITION BY c."userId")::int AS "scopeCount"
          FROM collections c WHERE (${userId}::text IS NULL OR c."userId" = ${userId})
        ), inventory AS (
          SELECT c.id, c."scopeCount", COALESCE(SUM(i.quantity),0)::int AS total,
            md5(COALESCE(string_agg(i."cardId" || ':' || i.variant || ':' || i.condition || ':' || i.quantity::text,
              '|' ORDER BY i."cardId", i.variant, i.condition), '')) AS fingerprint
          FROM scope c LEFT JOIN collection_items i ON i."collectionId" = c.id GROUP BY c.id, c."scopeCount"
        ), aggregates AS (
          SELECT c.id, providers.provider, c."scopeCount", c.total, c.fingerprint,
            SUM(i.quantity * lp.market)::numeric(20,2) AS amount,
            COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NOT NULL),0)::int AS priced,
            COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NOT NULL AND lp.recency > ${freshSince} AND lp.recency <= ${at}),0)::int AS fresh,
            COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NOT NULL AND lp.recency <= ${freshSince}),0)::int AS stale,
            COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NOT NULL AND (lp.recency IS NULL OR lp.recency > ${at})),0)::int AS unknown,
            MIN(lp."fetchedAt") FILTER (WHERE lp.market IS NOT NULL) AS oldest,
            MAX(lp."fetchedAt") FILTER (WHERE lp.market IS NOT NULL) AS newest,
            MIN(lp."feedPublishedAt") FILTER (WHERE lp.market IS NOT NULL) AS build
          FROM inventory c CROSS JOIN (VALUES ('tcgdex'), ('tcgcsv')) AS providers(provider)
          LEFT JOIN collection_items i ON i."collectionId" = c.id
          LEFT JOIN LATERAL (
            SELECT p.market, p."fetchedAt", p."feedPublishedAt",
              CASE WHEN p.provider = 'tcgcsv' THEN p."feedPublishedAt" ELSE p."fetchedAt" END AS recency
            FROM card_prices p WHERE p."cardId" = i."cardId" AND p.variant = i.variant
              AND p.provider = providers.provider AND p.source = 'tcgplayer' AND p.currency = 'USD'
              AND p."fetchedAt" <= ${at}
            ORDER BY p."fetchedAt" DESC, p.id DESC LIMIT 1
          ) lp ON true GROUP BY c.id, providers.provider, c."scopeCount", c.total, c.fingerprint
        )
        INSERT INTO collection_comparison_snapshots
          ("collectionId", provider, policy, day, "valueUsd", "totalCopies", "pricedCopies", "freshCopies", "staleCopies", "unknownFreshnessCopies",
           "oldestFetchedAt", "newestFetchedAt", "feedPublishedAt", "compositionFingerprint", "compositionChanged", "scopeCount", "snapshotCut", "evaluatedAt")
        SELECT a.id, a.provider, ${COMPARISON_POLICY}, ${day}::date,
          CASE WHEN a.total = 0 THEN 0 WHEN a.priced = 0 THEN NULL ELSE a.amount END,
          a.total, a.priced, a.fresh, a.stale, a.unknown, a.oldest, a.newest, a.build, a.fingerprint,
          COALESCE(prior."compositionFingerprint" <> a.fingerprint, false) OR COALESCE(prior."compositionChanged" AND prior.day = ${day}::date, false),
          a."scopeCount", ${cut}, ${at}
        FROM aggregates a LEFT JOIN LATERAL (
          SELECT s."compositionFingerprint", s."compositionChanged", s.day FROM collection_comparison_snapshots s
          WHERE s."collectionId" = a.id AND s.provider = a.provider AND s.policy = ${COMPARISON_POLICY} AND s.day <= ${day}::date
          ORDER BY s.day DESC LIMIT 1
        ) prior ON true
        ON CONFLICT ("collectionId", provider, policy, day) DO UPDATE SET
          "valueUsd" = EXCLUDED."valueUsd", "totalCopies" = EXCLUDED."totalCopies", "pricedCopies" = EXCLUDED."pricedCopies",
          "freshCopies" = EXCLUDED."freshCopies", "staleCopies" = EXCLUDED."staleCopies", "unknownFreshnessCopies" = EXCLUDED."unknownFreshnessCopies",
          "oldestFetchedAt" = EXCLUDED."oldestFetchedAt", "newestFetchedAt" = EXCLUDED."newestFetchedAt", "feedPublishedAt" = EXCLUDED."feedPublishedAt",
          "compositionFingerprint" = EXCLUDED."compositionFingerprint", "compositionChanged" = EXCLUDED."compositionChanged",
          "scopeCount" = EXCLUDED."scopeCount", "snapshotCut" = EXCLUDED."snapshotCut", "evaluatedAt" = EXCLUDED."evaluatedAt"
        WHERE collection_comparison_snapshots.day = ${day}::date
      `);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 });
  }

  async comparison(userId: string, collectionId: string | null, days = 30): Promise<CollectionComparisonDto> {
    if (collectionId !== null && !await this.prisma.collection.findFirst({ where: { id: collectionId, userId }, select: { id: true } })) throw new NotFoundException('Colección no encontrada');
    await this.capture(userId);
    const at = this.clock();
    const today = at.toISOString().slice(0, 10);
    const from = new Date(`${today}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - days + 1);
    const rows = collectionId !== null
      ? await this.prisma.$queryRaw<SnapshotRow[]>(Prisma.sql`
          SELECT s.* FROM collection_comparison_snapshots s JOIN collections c ON c.id = s."collectionId"
          WHERE c."userId" = ${userId} AND c.id = ${collectionId} AND s.policy = ${COMPARISON_POLICY}
            AND s.day >= ${from.toISOString().slice(0, 10)}::date AND s.day <= ${today}::date ORDER BY s.day
        `)
      : await this.prisma.$queryRaw<SnapshotRow[]>(Prisma.sql`
          SELECT s.day, s.provider,
            CASE WHEN SUM(s."totalCopies") = 0 THEN 0 WHEN SUM(s."pricedCopies") = 0 THEN NULL ELSE SUM(s."valueUsd") END AS "valueUsd",
            SUM(s."totalCopies")::int AS "totalCopies", SUM(s."pricedCopies")::int AS "pricedCopies",
            SUM(s."freshCopies")::int AS "freshCopies", SUM(s."staleCopies")::int AS "staleCopies",
            SUM(s."unknownFreshnessCopies")::int AS "unknownFreshnessCopies",
            MIN(s."oldestFetchedAt") AS "oldestFetchedAt", MAX(s."newestFetchedAt") AS "newestFetchedAt",
            MIN(s."feedPublishedAt") AS "feedPublishedAt", MAX(s."evaluatedAt") AS "evaluatedAt",
            md5(string_agg(s."collectionId" || ':' || s."compositionFingerprint", '|' ORDER BY s."collectionId")) AS "compositionFingerprint",
            bool_or(s."compositionChanged") AS "compositionChanged"
          FROM collection_comparison_snapshots s JOIN collections c ON c.id = s."collectionId"
          WHERE c."userId" = ${userId} AND s.policy = ${COMPARISON_POLICY} AND s.day >= ${from.toISOString().slice(0, 10)}::date AND s.day <= ${today}::date
          GROUP BY s.day, s.provider HAVING COUNT(DISTINCT s."snapshotCut") = 1 AND COUNT(*) = MAX(s."scopeCount")
          ORDER BY s.day
        `);
    const collectionCount = collectionId === null ? await this.prisma.collection.count({ where: { userId } }) : 1;
    if (collectionCount > 0 && COMPARISON_PROVIDERS.some((provider) => !rows.some((row) => row.provider === provider && row.day.toISOString().slice(0, 10) === today))) {
      throw new ServiceUnavailableException('No hay un corte local coherente para la comparación');
    }
    const map = (row: SnapshotRow): CollectionComparisonPointDto => ({
      date: row.day.toISOString().slice(0, 10), valueUsd: row.valueUsd === null ? null : Number(row.valueUsd),
      totalCopies: row.totalCopies, pricedCopies: row.pricedCopies, unpricedCopies: row.totalCopies - row.pricedCopies,
      freshCopies: row.freshCopies, staleCopies: row.staleCopies, unknownFreshnessCopies: row.unknownFreshnessCopies,
      oldestFetchedAt: row.oldestFetchedAt?.toISOString() ?? null, newestFetchedAt: row.newestFetchedAt?.toISOString() ?? null,
      feedPublishedAt: row.feedPublishedAt?.toISOString() ?? null, compositionFingerprint: row.compositionFingerprint,
      compositionChanged: row.compositionChanged, provisional: row.day.toISOString().slice(0, 10) === today,
      evaluatedAt: row.evaluatedAt.toISOString(), cutAt: row.evaluatedAt.toISOString(),
    });
    return { collectionId, activeProvider: this.active.id, currency: 'USD', windowDays: days, evaluatedAt: at.toISOString(),
      series: COMPARISON_PROVIDERS.map((provider) => {
        const points = rows.filter((row) => row.provider === provider).map(map);
        const current = points.find((point) => point.date === today) ?? {
          date: today, valueUsd: 0, totalCopies: 0, pricedCopies: 0, unpricedCopies: 0, freshCopies: 0, staleCopies: 0, unknownFreshnessCopies: 0,
          oldestFetchedAt: null, newestFetchedAt: null, feedPublishedAt: null, compositionFingerprint: '', compositionChanged: false,
          provisional: true, evaluatedAt: at.toISOString(), cutAt: at.toISOString(),
        };
        return { provider, policy: COMPARISON_POLICY, current, points };
      }),
    };
  }
}
