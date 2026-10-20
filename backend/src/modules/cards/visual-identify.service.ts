import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import type { VisualIdentifyDto } from './dto/visual-identify.dto.js';
import { MetricsRecorder } from '../metrics/metrics.recorder.js';

export type VisualScannerState =
  'disabled' | 'initializing' | 'ready' | 'unavailable' | 'incompatible';

interface VisualWorkerResult {
  candidates: {
    id: string;
    similarity: number;
    retrievalRank: number;
  }[];
  retrievalLimit: number;
  references: number;
  indexVersion: string;
  indexStale: boolean;
  collections: number;
  indexMs: number;
  cold: boolean;
  modelMs: number;
  inferenceMs: number;
  totalMs: number;
}

interface WorkerRecord {
  child: ChildProcess;
  generation: number;
  onExit: () => void;
  onError: () => void;
  onDisconnect: () => void;
}

interface PendingWarmup {
  record: WorkerRecord;
  attempt: number;
  finish: (state: 'ready' | 'unavailable' | 'incompatible') => void;
}

const WARMUP_TIMEOUT_MS = 60_000;
const RETRY_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000] as const;

function isResult(value: unknown): value is VisualWorkerResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as VisualWorkerResult;
  return (
    Array.isArray(result.candidates) &&
    result.candidates.every(
      (candidate) =>
        candidate &&
        typeof candidate.id === 'string' &&
        Number.isFinite(candidate.similarity) &&
        Number.isInteger(candidate.retrievalRank) &&
        candidate.retrievalRank > 0,
    ) &&
    Number.isInteger(result.retrievalLimit) &&
    result.retrievalLimit > 0 &&
    result.retrievalLimit <= 8 &&
    Number.isInteger(result.references) &&
    result.references > 0 &&
    result.references <= 100_000 &&
    typeof result.indexVersion === 'string' &&
    /^[a-f0-9]{64}$/.test(result.indexVersion) &&
    typeof result.indexStale === 'boolean' &&
    Number.isInteger(result.collections) &&
    result.collections > 0 &&
    typeof result.cold === 'boolean' &&
    [result.modelMs, result.inferenceMs, result.totalMs, result.indexMs].every(
      Number.isFinite,
    )
  );
}

@Injectable()
export class VisualIdentifyService implements OnModuleInit, OnModuleDestroy {
  constructor(@Optional() private readonly metrics?: MetricsRecorder) {}
  private worker?: WorkerRecord;
  private pendingWarmup?: PendingWarmup;
  private warmupTimer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private busy = false;
  private cancelIdentify?: () => void;
  private shuttingDown = false;
  private state: Exclude<VisualScannerState, 'disabled'> = 'initializing';
  private generation = 0;
  private warmupAttempt = 0;
  private retryCount = 0;
  private warmupStartedAt?: number;

  onModuleInit(): void {
    if (this.enabled()) this.startWarmup();
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    this.stopWorker();
  }

  private stopWorker(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.warmupTimer) clearTimeout(this.warmupTimer);
    this.retryTimer = undefined;
    this.warmupTimer = undefined;
    this.pendingWarmup?.finish('unavailable');
    this.cancelIdentify?.();
    const worker = this.worker;
    this.worker = undefined;
    if (worker) this.retireWorkerListeners(worker, true);
    this.state = 'unavailable';
  }

  readinessStatus(): { state: VisualScannerState; busy: boolean } {
    if (!this.enabled()) {
      return { state: 'disabled', busy: false };
    }
    return { state: this.state, busy: this.busy };
  }

  async identify(
    dto: VisualIdentifyDto,
    signal?: AbortSignal,
  ): Promise<VisualWorkerResult> {
    const startedAt = performance.now();
    let started = false;
    try {
      const result = await this.identifyInternal(dto, signal, () => { started = true; });
      try {
        this.metrics?.increment('inference_completed');
        this.metrics?.observe('worker_duration_ms', performance.now() - startedAt);
        this.metrics?.observe('inference_duration_ms', result.inferenceMs);
        this.metrics?.observe('index_duration_ms', result.indexMs);
        this.metrics?.observe('model_duration_ms', result.modelMs);
        if (result.cold) this.metrics?.observe('cold_model_duration_ms', result.modelMs);
      } catch { /* métricas best effort */ }
      return result;
    } catch (error: unknown) {
      try {
        if (started) {
          this.metrics?.increment('inference_failed');
          this.metrics?.observe('worker_duration_ms', performance.now() - startedAt);
        }
      } catch { /* métricas best effort */ }
      throw error;
    }
  }

  private async identifyInternal(
    dto: VisualIdentifyDto,
    signal?: AbortSignal,
    onStarted: () => void = () => undefined,
  ): Promise<VisualWorkerResult> {
    if (this.shuttingDown) {
      this.countAdmission('admission_unavailable');
      throw new ServiceUnavailableException(
        'El motor visual se está cerrando.',
      );
    }
    if (!this.enabled()) {
      this.countAdmission('admission_disabled');
      this.stopWorker();
      throw new NotFoundException('La prueba visual está desactivada.');
    }
    if (this.busy) {
      this.countAdmission('admission_busy');
      throw new ServiceUnavailableException(
        'El motor visual está ocupado. Probá de nuevo en unos segundos.',
      );
    }
    const bytes = Buffer.from(dto.image.split(',')[1] ?? '', 'base64');
    if (!bytes.length || bytes.length > 6 * 1024 * 1024) {
      this.countAdmission('admission_invalid');
      throw new BadRequestException('Usá una foto de hasta 6 MiB.');
    }
    if (signal?.aborted) {
      this.countAdmission('admission_cancelled');
      throw new ServiceUnavailableException('Prueba visual cancelada.');
    }
    if (this.state !== 'ready' || !this.worker) {
      this.countAdmission('admission_unavailable');
      throw new ServiceUnavailableException(
        'El motor visual todavía no está disponible. Probá de nuevo en unos segundos.',
      );
    }

    this.busy = true;
    onStarted();
    try { this.metrics?.increment('inference_started'); } catch { /* best effort */ }
    const record = this.worker;
    try {
      return await new Promise<VisualWorkerResult>((accept, reject) => {
        let settled = false;
        const finish = (error?: Error, result?: VisualWorkerResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          record.child.off('message', message);
          record.child.off('exit', failed);
          record.child.off('error', failed);
          record.child.off('disconnect', failed);
          signal?.removeEventListener('abort', cancelled);
          if (this.cancelIdentify === cancelled)
            this.cancelIdentify = undefined;
          if (error) {
            this.retireWorker(record, true);
            this.state = 'unavailable';
            this.scheduleRetry();
            reject(error);
          } else if (result) {
            accept(result);
          }
        };
        const failed = () =>
          finish(
            new ServiceUnavailableException(
              'El motor visual se interrumpió. Probá de nuevo.',
            ),
          );
        const cancelled = () =>
          finish(new ServiceUnavailableException('Prueba visual cancelada.'));
        const message = (value: unknown) => {
          // Un acuse duplicado de warmup no corresponde a esta inferencia.
          if (
            value &&
            typeof value === 'object' &&
            'type' in value &&
            value.type === 'warmup-result'
          )
            return;
          if (isResult(value)) finish(undefined, value);
          else
            finish(
              new BadRequestException(
                value &&
                  typeof value === 'object' &&
                  'error' in value &&
                  typeof value.error === 'string'
                  ? value.error
                  : 'Respuesta visual inválida.',
              ),
            );
        };
        const timer = setTimeout(
          () =>
            finish(
              new ServiceUnavailableException(
                'El motor visual tardó demasiado. Probá de nuevo.',
              ),
            ),
          30_000,
        );
        record.child.on('message', message);
        record.child.once('exit', failed);
        record.child.once('error', failed);
        record.child.once('disconnect', failed);
        signal?.addEventListener('abort', cancelled, { once: true });
        this.cancelIdentify = cancelled;
        if (signal?.aborted) cancelled();
        else {
          try {
            record.child.send({ image: dto.image }, (error) => {
              if (error) failed();
            });
          } catch {
            failed();
          }
        }
      });
    } finally {
      this.busy = false;
    }
  }

  private enabled(): boolean {
    return process.env.SCANNER_VISUAL_ENABLED === '1';
  }

  private countAdmission(name: 'admission_busy' | 'admission_unavailable' | 'admission_cancelled' | 'admission_disabled' | 'admission_invalid'): void {
    try { this.metrics?.increment(name); } catch { /* observación best effort */ }
  }

  private startWarmup(): void {
    if (!this.enabled()) {
      this.stopWorker();
      return;
    }
    if (this.shuttingDown || this.pendingWarmup) return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    this.state = 'initializing';
    this.warmupStartedAt = performance.now();

    let record = this.worker;
    if (!record || !record.child.connected) {
      try {
        const child = fork(resolve('scripts/scanner-visual-worker.mjs'), [], {
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          execArgv: [],
        });
        const generation = ++this.generation;
        record = {
          child,
          generation,
          onExit: () => this.workerFailed(record!),
          onError: () => this.workerFailed(record!, true),
          onDisconnect: () => this.workerFailed(record!, true),
        };
        this.worker = record;
        child.once('exit', record.onExit);
        child.once('error', record.onError);
        child.once('disconnect', record.onDisconnect);
      } catch {
        this.state = 'unavailable';
        try {
          this.metrics?.increment('warmup_failed');
          if (this.warmupStartedAt !== undefined) this.metrics?.observe('warmup_duration_ms', performance.now() - this.warmupStartedAt);
        } catch { /* métricas best effort */ }
        this.warmupStartedAt = undefined;
        this.scheduleRetry();
        return;
      }
    }

    const attempt = ++this.warmupAttempt;
    const workerRecord = record;
    let warmupFinished = false;
    const message = (value: unknown) => {
      if (!isWarmupResponse(value, workerRecord.generation, attempt)) return;
      this.finishWarmup(workerRecord, attempt, value.state);
    };
    this.pendingWarmup = {
      record: workerRecord,
      attempt,
      finish: (state) => {
        if (warmupFinished) return;
        warmupFinished = true;
        try {
          this.metrics?.increment(state === 'ready' ? 'warmup_ready' : 'warmup_failed');
          if (this.warmupStartedAt !== undefined) this.metrics?.observe('warmup_duration_ms', performance.now() - this.warmupStartedAt);
        } catch { /* métricas best effort */ }
        this.warmupStartedAt = undefined;
        workerRecord.child.off('message', message);
        if (this.warmupTimer) clearTimeout(this.warmupTimer);
        this.warmupTimer = undefined;
        this.pendingWarmup = undefined;
        this.state = state;
        if (state === 'unavailable' || state === 'incompatible') {
          this.scheduleRetry();
        } else {
          this.retryCount = 0;
        }
      },
    };
    this.warmupTimer = setTimeout(() => {
      this.retireWorker(workerRecord, true);
      this.state = 'unavailable';
      this.scheduleRetry();
    }, WARMUP_TIMEOUT_MS);
    // Una respuesta vieja no debe consumir el listener de la generación actual.
    workerRecord.child.on('message', message);
    try {
      workerRecord.child.send(
        { type: 'warmup', generation: workerRecord.generation, attempt },
        (error) => {
          if (error) this.workerFailed(workerRecord, true);
        },
      );
    } catch {
      this.workerFailed(workerRecord, true);
    }
  }

  private finishWarmup(
    record: WorkerRecord,
    attempt: number,
    state: 'ready' | 'unavailable' | 'incompatible',
  ): void {
    const pending = this.pendingWarmup;
    if (
      pending?.record !== record ||
      pending.attempt !== attempt ||
      this.worker !== record ||
      this.shuttingDown
    ) {
      return;
    }
    if (!this.enabled()) {
      this.stopWorker();
      return;
    }
    if (state !== 'ready') {
      // El modelo reparado debe leerse de nuevo, sin conservar la sesión anterior.
      this.worker = undefined;
      this.retireWorkerListeners(record, true);
    }
    pending.finish(state);
  }

  private workerFailed(record: WorkerRecord, kill = false): void {
    if (this.worker !== record || this.shuttingDown) return;
    this.worker = undefined;
    this.retireWorkerListeners(record, false);
    const pending = this.pendingWarmup;
    if (pending?.record === record) pending.finish('unavailable');
    this.state = 'unavailable';
    if (kill) record.child.kill('SIGKILL');
    this.scheduleRetry();
  }

  private retireWorker(record: WorkerRecord, kill: boolean): void {
    if (this.worker !== record) return;
    this.worker = undefined;
    this.retireWorkerListeners(record, kill);
    const pending = this.pendingWarmup;
    if (pending?.record === record) pending.finish('unavailable');
  }

  private retireWorkerListeners(record: WorkerRecord, kill: boolean): void {
    record.child.off('exit', record.onExit);
    record.child.off('error', record.onError);
    record.child.off('disconnect', record.onDisconnect);
    // kill/IPC pueden emitir error hasta close; el worker retirado no revive estado.
    const ignoredError = () => undefined;
    record.child.on('error', ignoredError);
    record.child.once('close', () => record.child.off('error', ignoredError));
    if (kill) record.child.kill('SIGKILL');
  }

  private scheduleRetry(): void {
    if (!this.enabled() || this.shuttingDown || this.retryTimer) return;
    const delay =
      RETRY_BACKOFF_MS[Math.min(this.retryCount, RETRY_BACKOFF_MS.length - 1)];
    this.retryCount += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.startWarmup();
    }, delay);
    this.retryTimer.unref?.();
  }
}

interface WarmupResponse {
  type: 'warmup-result';
  generation: number;
  attempt: number;
  state: 'ready' | 'unavailable' | 'incompatible';
}

function isWarmupResponse(
  value: unknown,
  generation: number,
  attempt: number,
): value is WarmupResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<WarmupResponse>;
  return (
    response.type === 'warmup-result' &&
    response.generation === generation &&
    response.attempt === attempt &&
    ['ready', 'unavailable', 'incompatible'].includes(response.state ?? '')
  );
}
