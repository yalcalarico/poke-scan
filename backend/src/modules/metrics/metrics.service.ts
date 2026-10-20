import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RedisService } from '../../redis/redis.service.js';
import { VisualIdentifyService } from '../cards/visual-identify.service.js';
import { MetricsRecorder } from './metrics.recorder.js';
import type { MetricsSnapshotDto } from './metrics.dto.js';

export const METRICS_PRISMA_CLIENT = Symbol('METRICS_PRISMA_CLIENT');
const RESULT_CACHE_MS = 1_000;
const QUERY_DEADLINE_MS = 2_000;
type QueueStatus = { count: number; oldestAgeMs: number | null; retries: number };
type QueueSnapshot = { state: 'available'; sampledAt: string; statuses: Record<'pending' | 'processing', QueueStatus> } | { state: 'unavailable' };
export interface MetricsPrismaClient {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
  $disconnect(): Promise<void>;
}

@Injectable()
export class MetricsService implements OnModuleDestroy {
  private cachedQueue?: { value: QueueSnapshot; expiresAt: number };
  private inFlight?: Promise<QueueSnapshot>;
  private stopping = false;
  constructor(private readonly recorder: MetricsRecorder, private readonly visual: VisualIdentifyService, private readonly redis: RedisService, @Inject(METRICS_PRISMA_CLIENT) private readonly prisma: MetricsPrismaClient) {}

  async snapshot(): Promise<MetricsSnapshotDto> {
    const queue = await this.queueSnapshot();
    const scanner = this.visual.readinessStatus();
    const redis = this.redis.status();
    const metricSnapshot = this.recorder.snapshot();
    return { generatedAt: new Date().toISOString(), processStartedAt: metricSnapshot.since, metrics: metricSnapshot, scanner: { state: scanner.state, busy: scanner.busy }, queue, redis: { configured: redis.configured, available: redis.available, degradedSince: redis.degradedSince, lastErrorAt: redis.lastErrorAt } };
  }

  async onModuleDestroy(): Promise<void> { this.stopping = true; this.cachedQueue = undefined; await this.prisma.$disconnect(); }

  private async queueSnapshot(): Promise<QueueSnapshot> {
    if (this.stopping) return { state: 'unavailable' };
    const now = Date.now();
    if (this.cachedQueue && this.cachedQueue.expiresAt > now) return structuredClone(this.cachedQueue.value);
    let query = this.inFlight;
    if (!query) {
      query = this.readQueue();
      this.inFlight = query;
      void query.then(() => { if (this.inFlight === query) this.inFlight = undefined; });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<QueueSnapshot>((resolve) => { timer = setTimeout(() => resolve({ state: 'unavailable' }), QUERY_DEADLINE_MS); });
    const value = await Promise.race([query, deadline]);
    if (timer) clearTimeout(timer);
    if (!this.stopping) this.cachedQueue = { value: structuredClone(value), expiresAt: Date.now() + RESULT_CACHE_MS };
    return structuredClone(value);
  }

  private async readQueue(): Promise<QueueSnapshot> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ status: 'pending' | 'processing'; count: bigint; oldest: Date | null; retries: bigint }>>(Prisma.sql`SELECT status, COUNT(*)::bigint AS count, MIN("createdAt") AS oldest, COALESCE(SUM(GREATEST(attempts - 1, 0)), 0)::bigint AS retries FROM price_refresh_jobs WHERE status IN ('pending', 'processing') GROUP BY status`);
      const sampledAt = new Date();
      const statuses: Record<'pending' | 'processing', QueueStatus> = { pending: { count: 0, oldestAgeMs: null, retries: 0 }, processing: { count: 0, oldestAgeMs: null, retries: 0 } };
      for (const row of rows) statuses[row.status] = { count: Number(row.count), oldestAgeMs: row.oldest ? Math.max(0, sampledAt.getTime() - row.oldest.getTime()) : null, retries: Number(row.retries) };
      return { state: 'available', sampledAt: sampledAt.toISOString(), statuses };
    } catch {
      return { state: 'unavailable' };
    }
  }
}
