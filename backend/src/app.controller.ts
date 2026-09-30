import { Controller, Get } from '@nestjs/common';
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

@Controller()
export class AppController {
  constructor(private readonly redis: RedisService) {}

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
}
