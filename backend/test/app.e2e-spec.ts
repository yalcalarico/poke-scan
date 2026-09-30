import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('/api/health (GET)', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    // `status` no cambia con Redis caído: la app funciona sin caché y un 503
    // haría que un orquestador matara un pod sano. Lo que se informa es la
    // degradación, en `detail`.
    expect(response.body.status).toBe('ok');
    expect(response.body.detail.redis).toEqual(
      expect.objectContaining({
        configured: expect.any(Boolean),
        available: expect.any(Boolean),
        degradedSince: null,
      }),
    );
    // Y la respuesta no filtra la URL de Redis.
    expect(JSON.stringify(response.body)).not.toContain('redis://');
  });

  afterEach(async () => {
    await app.close();
  });
});
