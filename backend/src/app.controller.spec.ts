import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { RedisService, type RedisStatus } from './redis/redis.service.js';

const SANO: RedisStatus = {
  configured: true,
  available: true,
  degradedSince: null,
  lastErrorAt: null,
};

describe('AppController', () => {
  let appController: AppController;

  const build = async (redis: RedisStatus): Promise<void> => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: RedisService, useValue: { status: () => redis } }],
    }).compile();

    appController = app.get<AppController>(AppController);
  };

  describe('health', () => {
    it('con Redis sano dice ok y no degradado', async () => {
      await build(SANO);

      const response = appController.health();
      expect(response.status).toBe('ok');
      expect(response.degraded).toBe(false);
      expect(response.detail.redis).toEqual(SANO);
    });

    it('con Redis caído sigue diciendo ok, y degradado aparte', async () => {
      // Lo importante de este test: el `status` NO se va a 503. La app funciona
      // sin caché, y un health que la marca como muerta hace que un orquestador
      // mate un pod sano. Lo que se informa es la degradación.
      await build({
        configured: true,
        available: false,
        degradedSince: '2026-09-30T22:45:26.292Z',
        lastErrorAt: '2026-09-30T22:45:29.355Z',
      });

      const response = appController.health();
      expect(response.status).toBe('ok');
      expect(response.degraded).toBe(true);
      expect(response.detail.redis.degradedSince).toBe('2026-09-30T22:45:26.292Z');
    });

    it('sin Redis configurado no lo marca como degradado desde hace rato', async () => {
      // No usar caché y que se nos haya caído son incident distintos, y
      // confundirlos hace que una alerta apunte al problema equivocado.
      await build({ configured: false, available: false, degradedSince: null, lastErrorAt: null });

      const response = appController.health();
      expect(response.detail.redis.configured).toBe(false);
      expect(response.detail.redis.degradedSince).toBeNull();
    });
  });
});
