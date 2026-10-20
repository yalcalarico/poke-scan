import { describe, expect, it } from 'vitest';
import { MetricsRecorder } from './metrics.recorder.js';

describe('MetricsRecorder', () => {
  it('mantiene sólo agregados con buckets fijos y snapshots aislados', () => {
    const recorder = new MetricsRecorder();
    recorder.increment('scanner_http_requests');
    recorder.observe('scanner_http_duration_ms', 25);
    recorder.observe('scanner_http_duration_ms', 40_000);
    const snapshot = recorder.snapshot();
    expect(snapshot.counters.scanner_http_requests).toBe(1);
    expect(snapshot.histograms.scanner_http_duration_ms).toMatchObject({ count: 2, sumMs: 40_025, buckets: [0, 1, 0, 0, 0, 0, 0, 0, 1] });
    snapshot.counters.scanner_http_requests = 90;
    expect(recorder.snapshot().counters.scanner_http_requests).toBe(1);
  });

  it('descarta duración no finita o negativa', () => {
    const recorder = new MetricsRecorder();
    recorder.observe('inference_duration_ms', Number.NaN);
    recorder.observe('inference_duration_ms', -2);
    expect(recorder.snapshot().histograms).toEqual({});
  });
});
