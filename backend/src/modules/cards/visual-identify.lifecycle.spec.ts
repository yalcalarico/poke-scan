import { EventEmitter } from 'node:events';
import { fork } from 'node:child_process';
import { VisualIdentifyService } from './visual-identify.service.js';
import { VisualIdentifyDto } from './dto/visual-identify.dto.js';
import { MetricsRecorder } from '../metrics/metrics.recorder.js';

vi.mock('node:child_process', () => ({ fork: vi.fn() }));

const warmupDependencies = vi.hoisted(() => ({
  createSession: vi.fn(async () => ({ session: 'fixture' })),
  expectedMetadata: vi.fn(async () => ({ modelHash: 'fixture' })),
  refreshIndex: vi.fn(async () => ({
    snapshot: { entries: [1] },
    stale: false,
  })),
  embedding: vi.fn(),
  sharp: vi.fn(),
}));
vi.mock('onnxruntime-node', () => ({
  InferenceSession: { create: warmupDependencies.createSession },
}));
vi.mock('sharp', () => ({ default: warmupDependencies.sharp }));
vi.mock('../../../scripts/scanner-visual-engine.mjs', () => ({
  embedding: warmupDependencies.embedding,
}));
vi.mock('../../../scripts/scanner-visual-index.mjs', () => ({
  expectedMetadata: warmupDependencies.expectedMetadata,
  refreshIndex: warmupDependencies.refreshIndex,
}));

class Worker extends EventEmitter {
  connected = true;
  kill = vi.fn(() => true);
  send = vi.fn((_message: unknown, callback: (error: Error | null) => void) =>
    callback(null),
  );
}

const dto = Object.assign(new VisualIdentifyDto(), {
  image: 'data:image/png;base64,YQ==',
});

describe('IPC de warmup: branch real del worker sin inferencia', () => {
  async function withWorker(
    check: (
      handler: (message: unknown) => Promise<void>,
      sent: ReturnType<typeof vi.fn>,
    ) => Promise<void>,
  ) {
    vi.resetModules();
    vi.clearAllMocks();
    const previousSend = Object.getOwnPropertyDescriptor(process, 'send');
    const sent = vi.fn();
    Object.defineProperty(process, 'send', { configurable: true, value: sent });
    const registration = vi.spyOn(process, 'on');
    let handler: ((message: unknown) => Promise<void>) | undefined;
    try {
      // La ruta variable permite importar el script JS sin inventar un DTO TS compartido.
      const workerPath = '../../../scripts/scanner-visual-worker.mjs';
      await import(workerPath);
      const listener = registration.mock.calls.find(
        ([event]) => event === 'message',
      )?.[1];
      handler = listener as typeof handler;
      if (!handler) throw new Error('No se registró el handler IPC.');
      registration.mockRestore();
      await check(handler, sent);
    } finally {
      registration.mockRestore();
      if (handler) process.off('message', handler);
      if (previousSend) Object.defineProperty(process, 'send', previousSend);
      else delete process.send;
    }
  }

  it('valida modelo/índice antes de ready, reutiliza runtime y nunca genera embedding', async () => {
    let complete!: () => void;
    warmupDependencies.refreshIndex.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = () =>
            resolve({ snapshot: { entries: [1] }, stale: false });
        }),
    );
    await withWorker(async (handler, sent) => {
      const warming = handler({ type: 'warmup', generation: 7, attempt: 1 });
      await vi.waitFor(() =>
        expect(warmupDependencies.refreshIndex).toHaveBeenCalledOnce(),
      );
      expect(sent).not.toHaveBeenCalled();
      complete();
      await warming;
      expect(sent).toHaveBeenLastCalledWith({
        type: 'warmup-result',
        generation: 7,
        attempt: 1,
        state: 'ready',
      });
      await handler({ type: 'warmup', generation: 7, attempt: 2 });
      expect(warmupDependencies.createSession).toHaveBeenCalledOnce();
      expect(warmupDependencies.refreshIndex).toHaveBeenCalledTimes(2);
      expect(warmupDependencies.embedding).not.toHaveBeenCalled();
      expect(warmupDependencies.sharp).not.toHaveBeenCalled();
    });
  });

  it('devuelve incompatible sin filtrar el error ni ejecutar inferencia', async () => {
    warmupDependencies.refreshIndex.mockRejectedValueOnce(
      new Error('Modelo o metadata del índice incompatibles. /ruta/privada'),
    );
    await withWorker(async (handler, sent) => {
      await handler({ type: 'warmup', generation: 8, attempt: 3 });
      expect(sent).toHaveBeenCalledExactlyOnceWith({
        type: 'warmup-result',
        generation: 8,
        attempt: 3,
        state: 'incompatible',
      });
      expect(warmupDependencies.embedding).not.toHaveBeenCalled();
    });
  });
});
const result = {
  candidates: [{ id: 'me55-92', similarity: 0.8, retrievalRank: 1 }],
  retrievalLimit: 1,
  references: 20_670,
  indexVersion: 'a'.repeat(64),
  indexStale: false,
  collections: 175,
  indexMs: 1,
  cold: false,
  modelMs: 1,
  inferenceMs: 1,
  totalMs: 3,
};

describe('Worker visual: warmup, generación y recuperación', () => {
  let service: VisualIdentifyService;
  let workers: Worker[];
  let metrics: MetricsRecorder;
  const previous = process.env.SCANNER_VISUAL_ENABLED;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.SCANNER_VISUAL_ENABLED = '1';
    workers = [];
    metrics = new MetricsRecorder();
    vi.mocked(fork).mockImplementation(() => {
      const worker = new Worker();
      workers.push(worker);
      return worker as unknown as ReturnType<typeof fork>;
    });
    service = new VisualIdentifyService(metrics);
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
    if (previous === undefined) delete process.env.SCANNER_VISUAL_ENABLED;
    else process.env.SCANNER_VISUAL_ENABLED = previous;
  });

  function acknowledgeWarmup(
    worker: Worker,
    generation: number,
    attempt: number,
    state: 'ready' | 'unavailable' | 'incompatible' = 'ready',
  ) {
    worker.emit('message', {
      type: 'warmup-result',
      generation,
      attempt,
      state,
    });
  }

  function makeReady(): void {
    acknowledgeWarmup(workers[0], 1, 1);
    expect(service.readinessStatus()).toEqual({ state: 'ready', busy: false });
  }

  async function identify(worker = workers.at(-1)!): Promise<void> {
    const request = service.identify(dto);
    worker.emit('message', result);
    await expect(request).resolves.toEqual(result);
  }

  it('inicia warmup fuera del probe y no admite fotos hasta el acuse de esa generación', async () => {
    expect(workers).toHaveLength(1);
    expect(workers[0].send).toHaveBeenCalledWith(
      { type: 'warmup', generation: 1, attempt: 1 },
      expect.any(Function),
    );
    expect(service.readinessStatus()).toEqual({
      state: 'initializing',
      busy: false,
    });
    expect(service.readinessStatus()).toEqual({
      state: 'initializing',
      busy: false,
    });
    expect(workers[0].send).toHaveBeenCalledTimes(1);
    await expect(service.identify(dto)).rejects.toThrow(
      'todavía no está disponible',
    );
    expect(workers[0].send).toHaveBeenCalledTimes(1);

    acknowledgeWarmup(workers[0], 999, 1);
    expect(service.readinessStatus().state).toBe('initializing');
    makeReady();
    await identify(workers[0]);
  });

  it.each(['exit', 'error', 'disconnect'] as const)(
    'recupera automáticamente después de %s sin esperar otra consulta',
    async (event) => {
      makeReady();
      const request = expect(service.identify(dto)).rejects.toThrow(
        'interrumpió',
      );
      const old = workers[0];
      if (event === 'exit') old.emit(event, 1);
      else old.emit(event, new Error('fallo simulado'));
      await request;
      expect(metrics.snapshot().counters).toMatchObject({ inference_started: 1, inference_failed: 1, admission_busy: 0, admission_unavailable: 0 });
      expect(service.readinessStatus().state).toBe('unavailable');
      expect(workers).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(5_000);
      expect(workers).toHaveLength(2);
      expect(service.readinessStatus().state).toBe('initializing');
      acknowledgeWarmup(workers[1], 2, 2);
      expect(service.readinessStatus().state).toBe('ready');

      old.emit('exit', 1);
      expect(service.readinessStatus().state).toBe('ready');
      await identify(workers[1]);
    },
  );

  it('un índice incompatible queda informado y se reintenta con backoff', async () => {
    acknowledgeWarmup(workers[0], 1, 1, 'incompatible');
    expect(service.readinessStatus().state).toBe('incompatible');
    expect(workers[0].kill).toHaveBeenCalledWith('SIGKILL');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(workers).toHaveLength(2);
    expect(workers[1].send).toHaveBeenLastCalledWith(
      { type: 'warmup', generation: 2, attempt: 2 },
      expect.any(Function),
    );
    acknowledgeWarmup(workers[1], 2, 2);
    expect(service.readinessStatus().state).toBe('ready');
  });

  it('un warmup vencido mata su generación y rearma un proceso sin probe', async () => {
    await vi.advanceTimersByTimeAsync(60_000);
    expect(workers[0].kill).toHaveBeenCalledWith('SIGKILL');
    expect(service.readinessStatus().state).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(workers).toHaveLength(2);
    acknowledgeWarmup(workers[1], 2, 2);
    expect(service.readinessStatus().state).toBe('ready');
  });

  it('cancela inferencia, invalida worker y lo recupera en background', async () => {
    makeReady();
    const abort = new AbortController();
    const request = expect(service.identify(dto, abort.signal)).rejects.toThrow(
      'cancelada',
    );
    abort.abort();
    await request;
    expect(workers[0].kill).toHaveBeenCalledWith('SIGKILL');
    expect(service.readinessStatus().state).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(5_000);
    acknowledgeWarmup(workers[1], 2, 2);
    expect(service.readinessStatus().state).toBe('ready');
  });

  it('marca busy sin cambiar ready y conserva una sola inferencia admitida', async () => {
    makeReady();
    const first = service.identify(dto);
    expect(service.readinessStatus()).toEqual({ state: 'ready', busy: true });
    const rejected = Array.from({ length: 7 }, () =>
      expect(service.identify(dto)).rejects.toThrow('ocupado'),
    );
    await Promise.all(rejected);
    expect(metrics.snapshot().counters.admission_busy).toBe(7);
    expect(workers[0].send).toHaveBeenCalledTimes(2);
    workers[0].emit('message', result);
    await expect(first).resolves.toEqual(result);
    expect(service.readinessStatus()).toEqual({ state: 'ready', busy: false });
    expect(metrics.snapshot().counters).toMatchObject({ inference_started: 1, inference_completed: 1 });
  });

  it('cuenta una respuesta duplicada de warmup una sola vez y métricas rotas no afectan inferencia', async () => {
    makeReady();
    acknowledgeWarmup(workers[0], 1, 1);
    expect(metrics.snapshot().counters.warmup_ready).toBe(1);
    const request = service.identify(dto);
    workers[0].emit('message', result);
    await expect(request).resolves.toEqual(result);

    const broken = { increment: () => { throw new Error('observer failed'); }, observe: () => { throw new Error('observer failed'); } };
    const resilient = new VisualIdentifyService(broken as never);
    resilient.onModuleInit();
    const worker = workers.at(-1)!;
    worker.emit('message', { type: 'warmup-result', generation: 1, attempt: 1, state: 'ready' });
    const observed = resilient.identify(dto);
    worker.emit('message', result);
    await expect(observed).resolves.toEqual(result);
    resilient.onModuleDestroy();
  });

  it('scanner deshabilitado no crea worker ni timers', () => {
    service.onModuleDestroy();
    workers = [];
    process.env.SCANNER_VISUAL_ENABLED = 'false';
    const disabled = new VisualIdentifyService();
    disabled.onModuleInit();
    expect(disabled.readinessStatus()).toEqual({
      state: 'disabled',
      busy: false,
    });
    expect(workers).toHaveLength(0);
    disabled.onModuleDestroy();
  });

  it('shutdown mata worker y cancela la recuperación pendiente', async () => {
    acknowledgeWarmup(workers[0], 1, 1, 'unavailable');
    service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(workers).toHaveLength(1);
  });

  it.each(['error', 'disconnect', 'exit'] as const)(
    'recupera pérdida idle por %s y tolera eventos tardíos',
    async (event) => {
      makeReady();
      const old = workers[0];
      if (event === 'error') old.emit(event, new Error('fallo idle'));
      else old.emit(event);
      expect(service.readinessStatus().state).toBe('unavailable');
      await vi.advanceTimersByTimeAsync(5_000);
      acknowledgeWarmup(workers[1], 2, 2);
      old.emit('error', new Error('error tardío de IPC'));
      old.emit('disconnect');
      old.emit('exit');
      expect(service.readinessStatus().state).toBe('ready');
      old.emit('close');
      expect(old.listenerCount('error')).toBe(0);
      await identify(workers[1]);
    },
  );

  it('un acuse de warmup viejo no consume el resultado de una inferencia', async () => {
    makeReady();
    const request = service.identify(dto);
    acknowledgeWarmup(workers[0], 1, 1);
    expect(service.readinessStatus()).toEqual({ state: 'ready', busy: true });
    workers[0].emit('message', result);
    await expect(request).resolves.toEqual(result);
    expect(workers[0].listenerCount('message')).toBe(0);
  });

  it('vence inferencia, descarta su resultado tardío y recupera el siguiente worker', async () => {
    makeReady();
    const old = workers[0];
    const request = expect(service.identify(dto)).rejects.toThrow(
      'tardó demasiado',
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await request;
    expect(old.kill).toHaveBeenCalledWith('SIGKILL');
    expect(old.listenerCount('message')).toBe(0);
    await vi.advanceTimersByTimeAsync(5_000);
    acknowledgeWarmup(workers[1], 2, 2);
    const current = service.identify(dto);
    old.emit('message', result);
    expect(service.readinessStatus().busy).toBe(true);
    workers[1].emit('message', result);
    await expect(current).resolves.toEqual(result);
  });

  it.each(['throw', 'callback'] as const)(
    'limpia un fallo de envío de inferencia por %s',
    async (mode) => {
      makeReady();
      workers[0].send.mockImplementationOnce((_message, callback) => {
        if (mode === 'throw') throw new Error('IPC cerrado');
        callback(new Error('IPC cerrado'));
      });
      await expect(service.identify(dto)).rejects.toThrow('interrumpió');
      expect(workers[0].listenerCount('message')).toBe(0);
      expect(service.readinessStatus()).toEqual({
        state: 'unavailable',
        busy: false,
      });
      await vi.advanceTimersByTimeAsync(5_000);
      acknowledgeWarmup(workers[1], 2, 2);
      await identify(workers[1]);
    },
  );

  it.each(['throw', 'callback'] as const)(
    'limpia un fallo de envío de warmup por %s',
    async (mode) => {
      service.onModuleDestroy();
      workers = [];
      vi.mocked(fork).mockImplementationOnce(() => {
        const worker = new Worker();
        worker.send.mockImplementationOnce((_message, callback) => {
          if (mode === 'throw') throw new Error('IPC cerrado');
          callback(new Error('IPC cerrado'));
        });
        workers.push(worker);
        return worker as unknown as ReturnType<typeof fork>;
      });
      service = new VisualIdentifyService();
      expect(() => service.onModuleInit()).not.toThrow();
      expect(service.readinessStatus().state).toBe('unavailable');
      expect(workers[0].listenerCount('message')).toBe(0);
      await vi.advanceTimersByTimeAsync(5_000);
      acknowledgeWarmup(workers[1], 2, 2);
      expect(service.readinessStatus().state).toBe('ready');
    },
  );

  it('foto inválida no marca incompatible y recupera después de limpiar la consulta', async () => {
    makeReady();
    const request = expect(service.identify(dto)).rejects.toThrow(
      'imagen válida',
    );
    workers[0].emit('message', { error: 'Usá una imagen válida.' });
    await request;
    expect(service.readinessStatus()).toEqual({
      state: 'unavailable',
      busy: false,
    });
    await vi.advanceTimersByTimeAsync(5_000);
    acknowledgeWarmup(workers[1], 2, 2);
    await identify(workers[1]);
  });

  it('un callback tardío de envío invalida sólo su generación y recupera fuera del probe', async () => {
    service.onModuleDestroy();
    workers = [];
    let callback!: (error: Error | null) => void;
    vi.mocked(fork).mockImplementationOnce(() => {
      const worker = new Worker();
      worker.send.mockImplementationOnce((_message, complete) => {
        callback = complete;
      });
      workers.push(worker);
      return worker as unknown as ReturnType<typeof fork>;
    });
    service = new VisualIdentifyService();
    service.onModuleInit();
    makeReady();
    callback(new Error('fallo tardío de IPC'));
    expect(service.readinessStatus().state).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(5_000);
    acknowledgeWarmup(workers[1], 2, 2);
    callback(new Error('callback viejo duplicado'));
    expect(service.readinessStatus().state).toBe('ready');
    await identify(workers[1]);
  });

  it('veinte consultas hot conservan un worker y sus listeners persistentes', async () => {
    makeReady();
    for (let i = 0; i < 20; i += 1) await identify(workers[0]);
    expect(workers).toHaveLength(1);
    expect(workers[0].listenerCount('message')).toBe(0);
    for (const event of ['error', 'exit', 'disconnect']) {
      expect(workers[0].listenerCount(event)).toBe(1);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shutdown liquida inferencia pendiente sin esperar exit ni reintentar', async () => {
    makeReady();
    const request = expect(service.identify(dto)).rejects.toThrow('cancelada');
    service.onModuleDestroy();
    await request;
    workers[0].emit('error', new Error('error al cerrar'));
    expect(workers[0].listenerCount('message')).toBe(0);
    await expect(service.identify(dto)).rejects.toThrow('cerrando');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(workers).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('apagar el flag cancela al recibir warmup, sin hacer trabajo desde el probe', async () => {
    process.env.SCANNER_VISUAL_ENABLED = '0';
    expect(service.readinessStatus()).toEqual({
      state: 'disabled',
      busy: false,
    });
    expect(workers[0].kill).not.toHaveBeenCalled();
    acknowledgeWarmup(workers[0], 1, 1);
    expect(workers[0].kill).toHaveBeenCalledWith('SIGKILL');
    expect(workers[0].listenerCount('message')).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(workers).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
