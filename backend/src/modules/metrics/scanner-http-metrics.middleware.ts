import type { NextFunction, Request, Response } from 'express';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { MetricsRecorder } from './metrics.recorder.js';

const observedRequests = new WeakSet<Request>();

export function scannerHttpMetricsMiddleware(metrics: MetricsRecorder) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (observedRequests.has(request)) { next(); return; }
    if (request.method !== 'POST' || request.path !== '/api/cards/identify-visual') {
      next();
      return;
    }
    observedRequests.add(request);
    const started = performance.now();
    let recorded = false;
    const record = (aborted: boolean) => {
      if (recorded) return;
      recorded = true;
      try {
        metrics.increment('scanner_http_requests');
        if (aborted) metrics.increment('scanner_http_aborted');
        else {
          if (response.statusCode === 401) metrics.increment('scanner_http_401');
          if (response.statusCode === 400) metrics.increment('scanner_http_400');
          if (response.statusCode === 503) metrics.increment('scanner_http_503');
          if (response.statusCode >= 500) metrics.increment('scanner_http_5xx');
          else if (response.statusCode >= 400) metrics.increment('scanner_http_4xx');
          else if (response.statusCode >= 300) metrics.increment('scanner_http_3xx');
          else metrics.increment('scanner_http_2xx');
        }
        metrics.observe('scanner_http_duration_ms', performance.now() - started);
      } catch { /* Las métricas son best effort y no alteran la respuesta. */ }
    };
    response.once('finish', () => record(false));
    response.once('close', () => record(!response.writableFinished));
    next();
  };
}

@Injectable()
export class ScannerHttpMetricsMiddleware implements NestMiddleware {
  private readonly middleware: ReturnType<typeof scannerHttpMetricsMiddleware>;
  constructor(metrics: MetricsRecorder) { this.middleware = scannerHttpMetricsMiddleware(metrics); }
  use(request: Request, response: Response, next: NextFunction): void { this.middleware(request, response, next); }
}
