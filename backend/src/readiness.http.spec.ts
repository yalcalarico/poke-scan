import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AppController } from './app.controller.js';
import { RedisService } from './redis/redis.service.js';
import { ReadinessService } from './readiness.service.js';
import { VisualIdentifyService } from './modules/cards/visual-identify.service.js';

describe('GET /api/ready (HTTP)', () => {
  let app: INestApplication;
  let database: 'ready' | 'unavailable';
  let scanner:
    'disabled' | 'initializing' | 'ready' | 'unavailable' | 'incompatible';
  let busy = false;
  const redis = {
    configured: true,
    available: false,
    degradedSince: '2026-10-07T00:00:00.000Z',
    lastErrorAt: '2026-10-07T00:00:01.000Z',
  };

  beforeAll(async () => {
    database = 'ready';
    scanner = 'disabled';
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1 }])],
      controllers: [AppController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: RedisService, useValue: { status: () => redis } },
        {
          provide: ReadinessService,
          useValue: { databaseState: () => Promise.resolve(database) },
        },
        {
          provide: VisualIdentifyService,
          useValue: {
            readinessStatus: () => ({ state: scanner, busy }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('entrega 200 no-store y no consume el throttler global al sondear readiness', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/ready')
      .expect(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.body).toEqual({
      status: 'ready',
      degraded: true,
      detail: {
        database: { state: 'ready' },
        scanner: { state: 'disabled', busy: false },
        redis: { state: 'degraded' },
      },
    });

    const second = await request(app.getHttpServer())
      .get('/api/ready')
      .expect(200);
    expect(second.headers['cache-control']).toBe('no-store');
  });

  it('entrega 503 no-store con estado público reducido cuando DB/scanner no están listos', async () => {
    database = 'unavailable';
    scanner = 'incompatible';
    const response = await request(app.getHttpServer())
      .get('/api/ready')
      .expect(503);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      status: 'not_ready',
      degraded: true,
      detail: {
        database: { state: 'unavailable' },
        scanner: { state: 'incompatible', busy: false },
        redis: { state: 'degraded' },
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /localhost|secret|password|stack|path/i,
    );
  });

  it('conserva `/api/health` HTTP 200 cuando Redis está caído', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(response.body).toEqual({
      status: 'ok',
      degraded: true,
      detail: {
        redis: {
          configured: true,
          available: false,
          degradedSince: redis.degradedSince,
          lastErrorAt: redis.lastErrorAt,
        },
      },
    });
  });

  it('scanner ocupado conserva HTTP 200 y deja busy como dato informativo', async () => {
    database = 'ready';
    scanner = 'ready';
    busy = true;
    const response = await request(app.getHttpServer())
      .get('/api/ready')
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.detail.scanner).toEqual({
      state: 'ready',
      busy: true,
    });
  });
});
