import { Injectable } from '@nestjs/common';

export type MetricsCounter = 'scanner_http_requests' | 'scanner_http_2xx' | 'scanner_http_3xx' | 'scanner_http_4xx' | 'scanner_http_5xx' | 'scanner_http_401' | 'scanner_http_400' | 'scanner_http_503' | 'scanner_http_aborted' | 'inference_started' | 'inference_completed' | 'inference_failed' | 'admission_busy' | 'admission_unavailable' | 'admission_cancelled' | 'admission_disabled' | 'admission_invalid' | 'warmup_ready' | 'warmup_failed';
const HISTOGRAM_NAMES = ['scanner_http_duration_ms', 'worker_duration_ms', 'inference_duration_ms', 'index_duration_ms', 'model_duration_ms', 'cold_model_duration_ms', 'warmup_duration_ms'] as const;
export type MetricsHistogram = typeof HISTOGRAM_NAMES[number];

/** Conserva conteos y buckets fijos; no retiene muestras por solicitud. */
@Injectable()
export class MetricsRecorder {
  private readonly counters: Record<MetricsCounter, number> = {
    scanner_http_requests: 0, scanner_http_2xx: 0, scanner_http_3xx: 0, scanner_http_4xx: 0, scanner_http_5xx: 0, scanner_http_401: 0, scanner_http_400: 0, scanner_http_503: 0, scanner_http_aborted: 0,
    inference_started: 0, inference_completed: 0, inference_failed: 0, admission_busy: 0, admission_unavailable: 0, admission_cancelled: 0, admission_disabled: 0, admission_invalid: 0, warmup_ready: 0, warmup_failed: 0,
  };
  private readonly histograms: Partial<Record<MetricsHistogram, { count: number; sumMs: number; buckets: number[] }>> = {};
  private readonly bounds = [10, 50, 100, 250, 500, 1_000, 5_000, 30_000];

  increment(name: MetricsCounter): void {
    if (!Object.hasOwn(this.counters, name)) return;
    this.counters[name] = (this.counters[name] ?? 0) + 1;
  }

  observe(name: MetricsHistogram, value: number): void {
    if (!HISTOGRAM_NAMES.includes(name)) return;
    if (!Number.isFinite(value) || value < 0) return;
    const histogram = this.histograms[name] ??= { count: 0, sumMs: 0, buckets: Array(this.bounds.length + 1).fill(0) as number[] };
    histogram.count += 1;
    histogram.sumMs += value;
    const index = this.bounds.findIndex((bound) => value <= bound);
    histogram.buckets[index === -1 ? this.bounds.length : index] += 1;
  }

  snapshot(): { since: string; counters: Record<MetricsCounter, number>; histograms: Partial<Record<MetricsHistogram, { count: number; sumMs: number; boundsMs: number[]; buckets: number[] }>> } {
    const histograms: Partial<Record<MetricsHistogram, { count: number; sumMs: number; boundsMs: number[]; buckets: number[] }>> = {};
    for (const name of HISTOGRAM_NAMES) {
      const item = this.histograms[name];
      if (item) histograms[name] = { ...item, boundsMs: [...this.bounds], buckets: [...item.buckets] };
    }
    return { since: this.startedAt, counters: { ...this.counters }, histograms };
  }

  private readonly startedAt = new Date().toISOString();
}
