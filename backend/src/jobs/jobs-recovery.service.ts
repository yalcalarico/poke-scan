import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { SYNC_LOCK_TTL_SECONDS } from './sync.constants.js';

const STALE_SCAN_JOB_MS = SYNC_LOCK_TTL_SECONDS * 1000;

/** Recupera los syncs de catálogo abandonados sin tocar corridas recientes. */
@Injectable()
export class JobsRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(JobsRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.failStaleScanJobs();
  }

  /**
   * Marca `failed` los syncs de catálogo que quedaron `running`.
   *
   * `GET /api/jobs/:id` los devolvía `running` para siempre después de un
   * restart, y un `ScanJob` que dice `running` cuando nada lo está corriendo es
   * peor que uno que dice `failed`: el primero hace creer que hay trabajo en
   * curso y el segundo dice que hay que reintentarlo.
   */
  private async failStaleScanJobs(now: Date = new Date()): Promise<void> {
    const cutoff = new Date(now.getTime() - STALE_SCAN_JOB_MS);
    try {
      const { count } = await this.prisma.scanJob.updateMany({
        where: { status: 'running', startedAt: { lt: cutoff } },
        data: {
          status: 'failed',
          lastError:
            'El proceso que lo estaba ejecutando se terminó antes de que terminara el sync. ' +
            'Se puede volver a lanzar: el cursor quedó en Postgres, así que reanuda.',
          completedAt: now,
        },
      });
      if (count > 0) {
        this.logger.warn(
          `${count} syncs de catálogo quedaron en running al arrancar y se marcaron como fallidos`,
        );
      }
    } catch (error) {
      this.logger.error(
        `No se pudieron reconciliar los synjs de catálogo: ${(error as Error).message}`,
      );
    }
  }
}
