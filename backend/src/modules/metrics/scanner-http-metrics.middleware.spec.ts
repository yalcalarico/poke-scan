import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { MetricsRecorder } from './metrics.recorder.js';
import { scannerHttpMetricsMiddleware } from './scanner-http-metrics.middleware.js';

function invoke(method: string, path: string, status = 200, url = path) {
  const recorder = new MetricsRecorder();
  const response = Object.assign(new EventEmitter(), { statusCode: status, writableFinished: false });
  const next = vi.fn();
  scannerHttpMetricsMiddleware(recorder)({ method, path, url } as never, response as never, next);
  return { recorder, response, next };
}

describe('scannerHttpMetricsMiddleware', () => {
  it('cuenta sólo POST de ruta fija y resuelve finish/close una sola vez', () => {
    const excluded = invoke('GET', '/api/cards/identify-visual');
    expect(excluded.recorder.snapshot().counters.scanner_http_requests).toBe(0);
    const { recorder, response } = invoke('POST', '/api/cards/identify-visual', 503);
    response.writableFinished = true;
    response.emit('finish');
    response.emit('close');
    expect(recorder.snapshot().counters).toMatchObject({ scanner_http_requests: 1, scanner_http_503: 1, scanner_http_5xx: 1 });
    expect(recorder.snapshot().histograms.scanner_http_duration_ms?.count).toBe(1);
  });

  it.each([[401, 'scanner_http_401'], [400, 'scanner_http_400'], [503, 'scanner_http_503']] as const)('registra status fijo %i', (status, key) => {
    const { recorder, response } = invoke('POST', '/api/cards/identify-visual', status);
    response.emit('finish');
    expect(recorder.snapshot().counters[key]).toBe(1);
  });

  it('marca desconexión prematura sin guardar etiquetas de request', () => {
    const { recorder, response } = invoke('POST', '/api/cards/identify-visual', 200, '/api/cards/identify-visual?user=private');
    response.emit('close');
    expect(recorder.snapshot().counters).toMatchObject({ scanner_http_requests: 1, scanner_http_aborted: 1 });
    expect(JSON.stringify(recorder.snapshot())).not.toContain('private');
  });
});
