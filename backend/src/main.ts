import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { MetricsRecorder } from './modules/metrics/metrics.recorder.js';
import { scannerHttpMetricsMiddleware } from './modules/metrics/scanner-http-metrics.middleware.js';

function allowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (raw) {
    return raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  return process.env.NODE_ENV === 'production'
    ? [frontend]
    : [frontend, 'http://127.0.0.1:3000', 'http://localhost:3002'];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Request', 'Idempotency-Key'],
  });
  const metrics = app.get(MetricsRecorder);
  app.use(scannerHttpMetricsMiddleware(metrics));
  // 100kb (el default de Nest) no entra ni una captura de recorte del escáner en
  // base64. Lo usa POST /api/cards/identify-visual.
  app.useBodyParser('json', { limit: '10mb' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  /*
   * Sin esto, Nest ignora SIGTERM y los hooks de ciclo de vida no corren: el
   * proceso muere sin que `onModuleDestroy` llegue a frenar el worker de precios
   * ni `RedisService` a cerrar la conexión. Con un despliegue que manda SIGTERM
   * y después SIGKILL, el worker se queda sin draining y la fila que tenía
   * tomada queda en `processing` hasta que la recovers el arranque siguiente.
   */
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
