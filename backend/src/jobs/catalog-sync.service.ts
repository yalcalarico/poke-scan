import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { SyncCardsService, type SyncCardsResult } from './sync-cards.service.js';
import { SYNC_LOCK_KEY, SYNC_LOCK_TTL_SECONDS } from './sync.constants.js';

const SYSTEM_USER_EMAIL = 'system@pokemon-cards-scanner.app';

/**
 * Renovación del TTL del lock a la mitad de su vida.
 *
 * El TTL es la red de seguridad para el caso de que el proceso muera a mitad
 * del sync. Si fuera más corto que el sync, el lock se vencería solo y una
 * segunda corrida empezaría a trabajar sobre el mismo cursor de `sync_state`. Por
 * eso se renueva: el lock vive lo que vive el trabajo, y se vence solo si el
 * proceso deja de responder.
 */
const LOCK_RENEW_MS = (SYNC_LOCK_TTL_SECONDS * 1000) / 2;

export interface StartSyncResult {
  started: boolean;
  jobId: string;
  /** Por qué no arrancó, cuando `started` es `false`. */
  reason?: 'lock-taken';
}

/**
 * La orquestación del sync de catálogo: lock, registro y corrida.
 *
 * Vive acá y no en el controller porque **lo usan dos disparadores**: el
 * endpoint de admin y el cron. Y la razón de que esté en un service y no
 * duplicada es concreta: el cron que syncara por su cuenta sin pasar por acá
 * multiplicaría los requests contra pokemontcg.io, que es el recurso más escaso
 * del proyecto (`AGENTS.md` §3.1). Un lock que solo se pide en el endpoint es un
 * lock que no protege nada en el único escenario donde importa, que es "alguien
 * pidió el sync mientras ya había uno corriendo".
 *
 * ## El orden de las tres cosas
 *
 * `acquireLock` → `scanJob.create` → correr. El lock va antes del registro a
 * propósito: si el segundo proceso esperara al registro para ver que ya hay uno,
 * la ventana entre el `create` y el `acquire` alcanza para que entren los dos.
 */
@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger(CatalogSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly syncCardsService: SyncCardsService,
  ) {}

  /**
   * Arranca un sync si el lock está libre. Devuelve `started: false` en vez de
   * lanzar, porque para el endpoint y para el cron "ya hay uno corriendo" es un
   * resultado normal y no una excepción.
   */
  async start(force: boolean): Promise<StartSyncResult> {
    const lockToken = randomUUID();
    const acquired = await this.redis.acquireLock(
      SYNC_LOCK_KEY,
      lockToken,
      SYNC_LOCK_TTL_SECONDS,
    );
    if (!acquired) {
      return { started: false, jobId: '', reason: 'lock-taken' };
    }

    let job;
    try {
      const userId = await this.resolveSystemUserId();
      job = await this.prisma.scanJob.create({
        data: {
          userId,
          status: 'running',
          jobType: 'sync-catalog',
          startedAt: new Date(),
        },
      });
    } catch (error) {
      // Sin registro no se puede dejar rastro del intento, y el lock quedaría
      // tomado hasta el TTL.
      await this.redis.releaseLock(SYNC_LOCK_KEY, lockToken);
      throw error;
    }

    // Fire-and-forget: el endpoint responde 202 de inmediato y el cron no
    // espera 15-20 minutos. Los errores los maneja `runSync`, que los anota en
    // el `ScanJob`.
    void this.run(job.id, force, lockToken).catch(() => undefined);

    return { started: true, jobId: job.id };
  }

  /**
   * Corre el sync hasta el final y anota el resultado.
   *
   * Es `public` para que un test pueda esperarla sin pasar por el
   * fire-and-forget de `start`.
   */
  async run(jobId: string, force: boolean, lockToken: string): Promise<void> {
    // El sync tarda 15-20 min contra una API lenta; el TTL se renueva a mitad
    // de vida para que el lock no expire mientras el trabajo sigue vivo.
    const renew = setInterval(() => {
      void this.redis.extendLock(SYNC_LOCK_KEY, lockToken, SYNC_LOCK_TTL_SECONDS);
    }, LOCK_RENEW_MS);
    // `unref`: el timer no debe impedir que el proceso baje.
    renew.unref?.();

    try {
      const result: SyncCardsResult = await this.syncCardsService.syncAll({ force });
      await this.prisma.scanJob.update({
        where: { id: jobId },
        data: {
          status: result.skipped ? 'skipped' : 'completed',
          processed: result.processed,
          total: result.total,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.scanJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          lastError: (error as Error).message.slice(0, 2000),
          completedAt: new Date(),
        },
      });
    } finally {
      clearInterval(renew);
      const released = await this.redis.releaseLock(SYNC_LOCK_KEY, lockToken);
      if (!released) {
        // No es un error: casi siempre significa que el TTL venció y otro
        // proceso tomó el lock. Se avisa porque el segundo sync puede haber
        // trabajado sobre el mismo cursor.
        this.logger.warn(
          'No se pudo soltar el lock de sync: venció su TTL o Redis no respondió. Si había otro sync corriendo, va a compartir el cursor de sync_state.',
        );
      }
    }
  }

  private async resolveSystemUserId(): Promise<string> {
    const existing = await this.prisma.user.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await this.prisma.user.upsert({
      where: { email: SYSTEM_USER_EMAIL },
      create: {
        email: SYSTEM_USER_EMAIL,
        username: 'system',
        passwordHash: 'not-usable',
        displayName: 'System',
      },
      update: {},
      select: { id: true },
    });
    return created.id;
  }
}

/**
 * Lee `ADMIN_KEY` de la config.
 *
 * Vive acá porque los dos disparadores del sync necesitan el mismo criterio de
 * "está configurado": sin él, el endpoint responde 403 y el cron no tiene a quién
 * auditar. Que no haya key no deshabilita el cron —eso lo decide
 * `ENABLE_CATALOG_SYNC_CRON`—, pero es el mismo dato y conviene leerlo una vez.
 */
export function readAdminKey(config: ConfigService): string | undefined {
  return config.get<string>('ADMIN_KEY') ?? process.env.ADMIN_KEY;
}