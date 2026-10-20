import { describe, expect, it, vi } from 'vitest';
import { MetricsService, type MetricsPrismaClient } from './metrics.service.js';
import { MetricsRecorder } from './metrics.recorder.js';

const visual = { readinessStatus: () => ({ state: 'ready' as const, busy: false }) };
const redis = { status: () => ({ configured: false, available: false, degradedSince: null, lastErrorAt: null }) };
const row = { status: 'pending' as const, count: 2n, oldest: new Date(Date.now() - 1_000), retries: 3n };

describe('MetricsService queue snapshot', () => {
  it('comparte consulta concurrente, publica ceros y calcula edad desde un único corte', async () => {
    let resolveQuery!: (rows: typeof row[]) => void;
    const query = vi.fn(() => new Promise<typeof row[]>((resolve) => { resolveQuery = resolve; }));
    const prisma = { $queryRaw: query, $disconnect: vi.fn() } as unknown as MetricsPrismaClient;
    const service = new MetricsService(new MetricsRecorder(), visual as never, redis as never, prisma);
    const a = service.snapshot();
    const b = service.snapshot();
    expect(query).toHaveBeenCalledTimes(1);
    resolveQuery([row]);
    const [first, second] = await Promise.all([a, b]);
    expect(first.queue).toMatchObject({ state: 'available', statuses: { pending: { count: 2, retries: 3 }, processing: { count: 0, oldestAgeMs: null, retries: 0 } } });
    expect(second.queue).toEqual(first.queue);
    if (first.queue.state === 'available') first.queue.statuses.pending.count = 999;
    const cached = await service.snapshot();
    expect(cached.queue.state === 'available' && cached.queue.statuses.pending.count).toBe(2);
    expect(query).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
  });

  it('degrada consulta fallida sin detalles ni datos variables', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('postgres://secret/private')), $disconnect: vi.fn() } as unknown as MetricsPrismaClient;
    const service = new MetricsService(new MetricsRecorder(), visual as never, redis as never, prisma);
    const result = await service.snapshot();
    expect(result.queue).toEqual({ state: 'unavailable' });
    expect(JSON.stringify(result)).not.toContain('secret');
    await service.onModuleDestroy();
  });

  it('no duplica una consulta colgada y desconecta su cliente al cerrar', async () => {
    vi.useFakeTimers();
    try {
      const query = vi.fn(() => new Promise<never>(() => undefined));
      const prisma = { $queryRaw: query, $disconnect: vi.fn().mockResolvedValue(undefined) } as unknown as MetricsPrismaClient;
      const service = new MetricsService(new MetricsRecorder(), visual as never, redis as never, prisma);
      const a = service.snapshot();
      const b = service.snapshot();
      await vi.advanceTimersByTimeAsync(2_000);
      expect((await a).queue).toEqual({ state: 'unavailable' });
      expect((await b).queue).toEqual({ state: 'unavailable' });
      expect(query).toHaveBeenCalledTimes(1);
      await service.onModuleDestroy();
      expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
      expect((await service.snapshot()).queue).toEqual({ state: 'unavailable' });
    } finally { vi.useRealTimers(); }
  });
});
