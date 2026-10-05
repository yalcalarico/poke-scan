import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import type { VisualIdentifyDto } from './dto/visual-identify.dto.js';

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
function isResult(value: unknown): value is VisualWorkerResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as VisualWorkerResult;
  return (
    Array.isArray(result.candidates) &&
    result.candidates.every(
      (c) =>
        c &&
        typeof c.id === 'string' &&
        Number.isFinite(c.similarity) &&
        Number.isInteger(c.retrievalRank) &&
        c.retrievalRank > 0,
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
    [
      result.modelMs,
      result.inferenceMs,
      result.totalMs,
      result.indexMs,
    ].every(Number.isFinite)
  );
}
@Injectable()
export class VisualIdentifyService implements OnModuleDestroy {
  private child?: ChildProcess;
  private busy = false;
  onModuleDestroy(): void {
    this.child?.kill('SIGKILL');
  }

  async identify(
    dto: VisualIdentifyDto,
    signal?: AbortSignal,
  ): Promise<VisualWorkerResult> {
    if (process.env.SCANNER_VISUAL_ENABLED !== '1')
      throw new NotFoundException('La prueba visual está desactivada.');
    if (this.busy)
      throw new ServiceUnavailableException(
        'El motor visual está ocupado. Probá de nuevo en unos segundos.',
      );
    const bytes = Buffer.from(dto.image.split(',')[1] ?? '', 'base64');
    if (!bytes.length || bytes.length > 6 * 1024 * 1024)
      throw new BadRequestException('Usá una foto de hasta 6 MiB.');
    this.busy = true;
    try {
      if (this.child && !this.child.connected) this.child = undefined;
      const child = (this.child ??= fork(
        resolve('scripts/scanner-visual-worker.mjs'),
        [],
        { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] },
      ));
      return await new Promise<VisualWorkerResult>((accept, reject) => {
        let settled = false;
        const finish = (error?: Error, result?: VisualWorkerResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          child.off('message', message);
          child.off('exit', failed);
          child.off('error', failed);
          signal?.removeEventListener('abort', cancelled);
          if (error) {
            child.kill('SIGKILL');
            this.child = undefined;
            reject(error);
          } else if (result) accept(result);
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
        child.once('message', message);
        child.once('exit', failed);
        child.once('error', failed);
        signal?.addEventListener('abort', cancelled, { once: true });
        if (signal?.aborted) cancelled();
        else
          child.send({ image: dto.image }, (error) => {
            if (error) failed();
          });
      });
    } finally {
      this.busy = false;
    }
  }
}
