import { Controller, Get, Header, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { VisualIdentifyService } from './modules/cards/visual-identify.service.js';
import { ReadinessService } from './readiness.service.js';
import { RedisService } from './redis/redis.service.js';

export interface HealthResponse {
  status: 'ok';
  degraded: boolean;
  detail: {
    redis: {
      configured: boolean;
      available: boolean;
      degradedSince: string | null;
      lastErrorAt: string | null;
    };
  };
}

export type ReadinessStatus = 'ready' | 'not_ready';
export type ScannerReadinessState =
  | 'disabled'
  | 'initializing'
  | 'ready'
  | 'unavailable'
  | 'incompatible';
export type RedisReadinessState = 'disabled' | 'ready' | 'degraded';

export interface ReadinessResponseDto {
  status: ReadinessStatus;
  degraded: boolean;
  detail: {
    database: { state: 'ready' | 'unavailable' };
    scanner: { state: ScannerReadinessState; busy: boolean };
    redis: { state: RedisReadinessState };
  };
}

@Controller()
export class AppController {
  constructor(
    private readonly redis: RedisService,
    private readonly readiness: ReadinessService,
    private readonly visual: VisualIdentifyService,
  ) {}

  /**
   * Liveness, con el detalle de degradación.
   *
   * ## Por qué `status` no cambia con Redis caído
   *
   * Porque la app **funciona** sin Redis: es una caché, y cada lectura tiene su
   * camino a Postgres. Devolver `503` acá haría que un orquestador matara un pod
   * perfectamente funcional, y el resultado sería peor que el problema: cero
   * caché y además cero app.
   *
   * Un health que dice "ok" sin más es un health que no sirve para nada: la
   * degradación es invisible hasta que se manifiesta como latencia y como más
   * tráfico contra el proveedor externo. Por eso el `status` sigue siendo `ok` y
   * la información va en `detail`, con un `degraded` explícito para alerting.
   *
   * Lo que **no** va acá es la URL de Redis ni el último error: es una
   * superficie de monitoring. Para debuggear está el log.
   */
  @Get('health')
  health(): HealthResponse {
    const redis = this.redis.status();
    return {
      status: 'ok',
      degraded: !redis.available,
      detail: { redis },
    };
  }

  @Get('ready')
  @SkipThrottle()
  @Header('Cache-Control', 'no-store')
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResponseDto> {
    const database = await this.readiness.databaseState();
    const scanner = this.visual.readinessStatus();
    const redis = this.redis.status();
    const redisState: RedisReadinessState = !redis.configured
      ? 'disabled'
      : redis.available
        ? 'ready'
        : 'degraded';
    const ready =
      database === 'ready' &&
      (scanner.state === 'disabled' || scanner.state === 'ready');
    response.status(ready ? 200 : 503);
    return {
      status: ready ? 'ready' : 'not_ready',
      degraded: redisState === 'degraded',
      detail: {
        database: { state: database },
        scanner,
        redis: { state: redisState },
      },
    };
  }
}
