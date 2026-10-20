import type { MetricsCounter, MetricsHistogram } from './metrics.recorder.js';

export interface MetricsHistogramDto {
  count: number;
  sumMs: number;
  boundsMs: number[];
  buckets: number[];
}

export interface MetricsSnapshotDto {
  generatedAt: string;
  processStartedAt: string;
  metrics: {
    since: string;
    counters: Record<MetricsCounter, number>;
    histograms: Partial<Record<MetricsHistogram, MetricsHistogramDto>>;
  };
  scanner: { state: 'disabled' | 'initializing' | 'ready' | 'unavailable' | 'incompatible'; busy: boolean };
  queue:
    | { state: 'unavailable' }
    | { state: 'available'; sampledAt: string; statuses: Record<'pending' | 'processing', { count: number; oldestAgeMs: number | null; retries: number }> };
  redis: { configured: boolean; available: boolean; degradedSince: string | null; lastErrorAt: string | null };
}
