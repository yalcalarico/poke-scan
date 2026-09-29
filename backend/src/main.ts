import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

function allowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (raw) {
    return raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  return [frontend, 'http://127.0.0.1:3000', 'http://localhost:3002'];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
  });
  // 100kb (el default de Nest) no entra ni una captura de recorte del escáner en
  // base64. Solo la usan POST /api/jobs/scan-capture, que es de desarrollo.
  app.useBodyParser('json', { limit: '10mb' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
