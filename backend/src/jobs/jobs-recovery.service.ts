import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { PriceQueueService } from './price-queue.service.js';
import { SYNC_LOCK_TTL_SECONDS } from './sync.constants.js';

const STALE_SCAN_JOB_MS = SYNC_LOCK_TTL_SECONDS * 1000;

/**
 * Qué hacer con el trabajo que quedó a medias cuando el proceso anterior murió.
 *
 * Las dos cosas que se reconcilian acá son el mismo problema —"un job en curso
 * cuyo dueño ya no existe"— y por eso viven juntas y en el arranque: si una
 * falla, el síntoma es el mismo (un precio que no se actualiza, un sync que la
 * UI muestra siempre corriendo) y conviene tener un solo lugar donde mirar.
 *
 * ## Por qué "a medias" y no "en curso"
 *
 * No se puede marcar todo lo que esté `running` o `processing`: con dos
 * instancias, la otra está trabajando y sus jobs son legítimos. El criterio es
 * la **edad**, atada a lo que un job puede tardar de verdad:
 *
 * - El lock de catálogo dura 30 min (`SYNC_LOCK_TTL_SECONDS`) y el sync entero
 *   15-20. Un `running` más viejo que el TTL es de un proceso que ya no está.
 * - El refresh de precio es un request con reintentos, del orden del minuto, y
 *   el umbral de la cola es 10 min (`ABANDONED_JOB_MS`).
 *
 * Los dos umbrales son "varios veces el peor caso", no "lo que se vio una vez".
 * Un umbral más corto cerraría jobs de una instancia sana; uno más largo deja
 * basura más tiempo, que es el problema menos grave de los dos.
 */
@Injectable()
export class JobsRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(JobsRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: PriceQueueService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.recoverPriceJobs();
    await this.failStaleScanJobs();
  }

  /**
   * Devuelve a la cola los refrescos que quedaron `processing`.
   *
   * Sin esto, una fila en `processing` no la vuelve a tomar nadie —el claim solo
   * mira `pending`— y no es un error que nadie vea: es un precio que deja de
   * actualizarse en silencio.
   */
  private async recoverPriceJobs(): Promise<void> {
    try {
      await this.queue.reconcileAbandoned();
    } catch (error) {
      // Que falle la recuperación no puede impedir que la app arranque: la cola
      // se llena sola con la próxima lectura. Perderla sería peor que arrancar
      // con un aviso en el log.
      this.logger.error(
        `No se pudieron recuperar los refrescos de precio abandonados: ${(error as Error).message}`,
      );
    }
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
