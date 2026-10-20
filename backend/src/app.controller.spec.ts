import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { RedisService, type RedisStatus } from './redis/redis.service.js';
import { ReadinessService } from './readiness.service.js';
import { VisualIdentifyService } from './modules/cards/visual-identify.service.js';

const SANO: RedisStatus = {
  configured: true,
  available: true,
  degradedSince: null,
  lastErrorAt: null,
};

describe('AppController', () => {
  let appController: AppController;

  const build = async (
    redis: RedisStatus,
    database: 'ready' | 'unavailable' = 'ready',
    scanner: 'disabled' | 'initializing' | 'ready' | 'unavailable' | 'incompatible' = 'disabled',
  ): Promise<void> => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: RedisService, useValue: { status: () => redis } },
        {
          provide: ReadinessService,
          useValue: { databaseState: vi.fn().mockResolvedValue(database) },
        },
        {
          provide: VisualIdentifyService,
          useValue: { readinessStatus: () => ({ state: scanner, busy: false }) },
        },
      ],
    })
      .compile();

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

  describe('ready', () => {
    it('responde 200 si DB está lista y el scanner está deshabilitado', async () => {
      await build({ ...SANO, configured: false, available: false }, 'ready', 'disabled');
      const setStatus = vi.fn();
      const response = { status: setStatus } as unknown as import('express').Response;

      await expect(appController.ready(response)).resolves.toEqual({
        status: 'ready',
        degraded: false,
        detail: {
          database: { state: 'ready' },
          scanner: { state: 'disabled', busy: false },
          redis: { state: 'disabled' },
        },
      });
      expect(setStatus).toHaveBeenCalledWith(200);
    });

    it.each([
      ['DB caída', 'unavailable', 'disabled'],
      ['scanner inicializando', 'ready', 'initializing'],
      ['scanner incompatible', 'ready', 'incompatible'],
    ] as const)('responde 503 con estado seguro cuando %s', async (_label, database, scanner) => {
      await build(SANO, database, scanner);
      const setStatus = vi.fn();
      const response = { status: setStatus } as unknown as import('express').Response;

      const body = await appController.ready(response);

      expect(setStatus).toHaveBeenCalledWith(503);
      expect(body.status).toBe('not_ready');
      expect(JSON.stringify(body)).not.toMatch(/path|secret|password|stack|error/i);
    });

    it('Redis degradado informa degradación sin retirar readiness', async () => {
      await build(
        {
          configured: true,
          available: false,
          degradedSince: '2026-10-07T00:00:00.000Z',
          lastErrorAt: '2026-10-07T00:00:01.000Z',
        },
        'ready',
        'ready',
      );
      const setStatus = vi.fn();
      const response = { status: setStatus } as unknown as import('express').Response;

      const body = await appController.ready(response);

      expect(setStatus).toHaveBeenCalledWith(200);
      expect(body.degraded).toBe(true);
      expect(body.detail.redis.state).toBe('degraded');
    });
  });
});
