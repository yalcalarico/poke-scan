import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { SyncCardsService } from './sync-cards.service.js';
import { RefreshPricesDto, SyncCatalogDto } from './dto/jobs.dto.js';
import { SYNC_LOCK_KEY, SYNC_LOCK_TTL_SECONDS } from './sync.constants.js';
import { SyncPricesService } from './sync-prices.service.js';

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

@Controller('jobs')
export class JobsController {
  private readonly logger = new Logger(JobsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly syncCardsService: SyncCardsService,
    private readonly syncPricesService: SyncPricesService,
  ) {}

  @Post('sync-catalog')
  @HttpCode(HttpStatus.ACCEPTED)
  async syncCatalog(
    @Headers('x-admin-key') adminKey: string | undefined,
    @Body() dto: SyncCatalogDto,
  ): Promise<{ started: boolean; jobId: string }> {
    this.assertAdmin(adminKey);

    // El lock va ANTES de crear el `scanJob`: si el segundo proceso espera al
    // registro para ver que ya hay uno corriendo, la ventana entre el `create` y
    // el `acquire` alcanza para que entren los dos.
    const lockToken = randomUUID();
    const acquired = await this.redis.acquireLock(
      SYNC_LOCK_KEY,
      lockToken,
      SYNC_LOCK_TTL_SECONDS,
    );
    if (!acquired) {
      throw new ConflictException(
        'Ya hay un sync de catálogo en curso. Esperá a que termine antes de iniciar otro.',
      );
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

    void this.runSync(job.id, dto, lockToken).catch(() => undefined);

    return { started: true, jobId: job.id };
  }

  @Get(':id')
  async findJob(
    @Headers('x-admin-key') adminKey: string | undefined,
    @Param('id') id: string,
  ): Promise<unknown> {
    this.assertAdmin(adminKey);
    return this.prisma.scanJob.findUnique({ where: { id } });
  }

  @Post('refresh-prices')
  @HttpCode(HttpStatus.OK)
  async refreshPrices(
    @Headers('x-admin-key') adminKey: string | undefined,
    @Body() dto: RefreshPricesDto,
  ): Promise<unknown> {
    this.assertAdmin(adminKey);
    const result = await this.syncPricesService.refreshMany(dto.cardIds);
    return {
      requested: dto.cardIds.length,
      refreshed: result.refreshed,
      failed: result.failed,
    };
  }

  private async runSync(
    jobId: string,
    dto: SyncCatalogDto,
    lockToken: string,
  ): Promise<void> {
    // El sync tarda 15-20 min contra una API lenta; el TTL se renueva a mitad
    // de vida para que el lock no expire mientras el trabajo sigue vivo.
    const renew = setInterval(() => {
      void this.redis.extendLock(SYNC_LOCK_KEY, lockToken, SYNC_LOCK_TTL_SECONDS);
    }, LOCK_RENEW_MS);
    // `unref`: el timer no debe impedir que el proceso baje.
    renew.unref?.();

    try {
      const result = await this.syncCardsService.syncAll({ force: dto.force });
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

  private assertAdmin(adminKey: string | undefined): void {
    const expected = this.config.get<string>('ADMIN_KEY') ?? process.env.ADMIN_KEY;
    if (!expected) {
      throw new ForbiddenException('ADMIN_KEY no está configurado: endpoint deshabilitado');
    }
    if (!adminKey || adminKey !== expected) {
      throw new ForbiddenException('x-admin-key inválido');
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
