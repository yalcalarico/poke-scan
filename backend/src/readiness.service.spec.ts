import { createServer, type Socket } from 'node:net';
import {
  boundedDatabaseUrl,
  createHealthPrismaClient,
  type HealthPrismaClient,
  ReadinessService,
} from './readiness.service.js';
import { Prisma } from '@prisma/client';

describe('ReadinessService', () => {
  afterEach(() => vi.useRealTimers());

  it('limita solo la URL dedicada y conserva los parámetros del datasource', () => {
    const bounded = new URL(
      boundedDatabaseUrl(
        'postgresql://user:secret@localhost:55432/pokemon?schema=public&sslmode=require&options=-c%20application_name%3Dapp',
      )!,
    );

    expect(bounded.searchParams.get('schema')).toBe('public');
    expect(bounded.searchParams.get('sslmode')).toBe('require');
    expect(bounded.searchParams.get('connection_limit')).toBe('1');
    expect(bounded.searchParams.get('connect_timeout')).toBe('1');
    expect(bounded.searchParams.get('pool_timeout')).toBe('1');
    expect(bounded.searchParams.get('socket_timeout')).toBe('1');
    expect(bounded.searchParams.get('options')).toContain(
      'statement_timeout=750',
    );
    expect(bounded.username).toBe('user');
    expect(bounded.password).toBe('secret');
  });

  it('comparte la consulta en vuelo y cachea el resultado por un segundo', async () => {
    vi.useFakeTimers();
    let complete!: (value: unknown) => void;
    const query = vi.fn(
      <T>() =>
        new Promise<T>((resolve) => {
          complete = (value) => resolve(value as T);
        }),
    );
    const client = {
      $queryRaw: query,
      $disconnect: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ReadinessService(
      client as unknown as HealthPrismaClient,
    );
    const first = service.databaseState();
    const second = service.databaseState();

    expect(query).toHaveBeenCalledTimes(1);
    complete([{ ok: 1 }]);
    await expect(Promise.all([first, second])).resolves.toEqual([
      'ready',
      'ready',
    ]);
    await expect(service.databaseState()).resolves.toBe('ready');
    expect(query).toHaveBeenCalledTimes(1);

    query.mockImplementation(<T>() => Promise.resolve([{ ok: 1 }] as T));
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(service.databaseState()).resolves.toBe('ready');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledWith(Prisma.sql`SELECT 1 AS ok`);
    await service.onModuleDestroy();
    expect(client.$disconnect).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('devuelve unavailable al vencer HTTP y evita apilar consultas sin cancelación server-side', async () => {
    vi.useFakeTimers();
    const query = vi.fn(<T>() => new Promise<T>(() => undefined));
    const client = {
      $queryRaw: query,
      $disconnect: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ReadinessService(
      client as unknown as HealthPrismaClient,
    );
    try {
      const first = service.databaseState();
      const second = service.databaseState();
      await vi.advanceTimersByTimeAsync(4_000);
      await expect(Promise.all([first, second])).resolves.toEqual([
        'unavailable',
        'unavailable',
      ]);
      expect(query).toHaveBeenCalledOnce();
      const third = service.databaseState();
      // El deadline pertenece a la operación compartida, no reinicia por request.
      await expect(third).resolves.toBe('unavailable');
      await vi.advanceTimersByTimeAsync(4_000);
      await expect(third).resolves.toBe('unavailable');
      expect(query).toHaveBeenCalledOnce();
    } finally {
      await service.onModuleDestroy();
      vi.useRealTimers();
    }
  });

  it('no cachea ready si la consulta termina después del deadline HTTP', async () => {
    vi.useFakeTimers();
    let complete!: () => void;
    const query = vi.fn(
      <T>() =>
        new Promise<T>((resolve) => {
          complete = () => resolve([{ ok: 1 }] as T);
        }),
    );
    const service = new ReadinessService({
      $queryRaw: query,
      $disconnect: vi.fn().mockResolvedValue(undefined),
    } as unknown as HealthPrismaClient);
    const first = service.databaseState();
    const second = service.databaseState();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(Promise.all([first, second])).resolves.toEqual([
      'unavailable',
      'unavailable',
    ]);
    complete();
    await vi.advanceTimersByTimeAsync(1);
    await expect(service.databaseState()).resolves.toBe('unavailable');
    expect(query).toHaveBeenCalledOnce();
    await service.onModuleDestroy();
  });

  it('shutdown resuelve el probe pendiente y no reconecta aunque llegue un resultado tardío', async () => {
    vi.useFakeTimers();
    let complete!: () => void;
    const query = vi.fn(
      <T>() =>
        new Promise<T>((resolve) => {
          complete = () => resolve([{ ok: 1 }] as T);
        }),
    );
    const client = {
      $queryRaw: query,
      $disconnect: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ReadinessService(
      client as unknown as HealthPrismaClient,
    );
    const request = service.databaseState();
    await service.onModuleDestroy();
    await expect(request).resolves.toBe('unavailable');
    expect(vi.getTimerCount()).toBe(0);
    complete();
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(service.databaseState()).resolves.toBe('unavailable');
    expect(query).toHaveBeenCalledOnce();
  });

  it('recorta un TCP blackhole aislado y comparte el intento sin tocar una DB real', async () => {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('No se asignó puerto local.');

    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `postgresql://probe:probe@127.0.0.1:${address.port}/pokemon_cards_test`;
    const service = new ReadinessService(createHealthPrismaClient());
    const started = Date.now();
    try {
      await expect(
        Promise.all([service.databaseState(), service.databaseState()]),
      ).resolves.toEqual(['unavailable', 'unavailable']);
      const elapsedMs = Date.now() - started;
      expect(elapsedMs).toBeLessThan(4_000);
      expect(sockets.size).toBeLessThanOrEqual(1);
    } finally {
      await service.onModuleDestroy();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  }, 10_000);
});
