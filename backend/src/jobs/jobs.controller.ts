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
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogSyncService, readAdminKey } from './catalog-sync.service.js';
import { RefreshPricesDto, SyncCatalogDto } from './dto/jobs.dto.js';
import { SyncPricesService } from './sync-prices.service.js';

@Controller('jobs')
export class JobsController {
  private readonly logger = new Logger(JobsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly catalogSync: CatalogSyncService,
    private readonly syncPricesService: SyncPricesService,
  ) {}

  /**
   * Lanza un sync de catálogo.
   *
   * La orquestación (lock, `ScanJob`, corrida) está en `CatalogSyncService`
   * porque el cron usa el mismo camino. Acá solo queda lo que es de HTTP: la
   * auth y la traducción de "ya hay uno corriendo" a `409`.
   */
  @Post('sync-catalog')
  @HttpCode(HttpStatus.ACCEPTED)
  async syncCatalog(
    @Headers('x-admin-key') adminKey: string | undefined,
    @Body() dto: SyncCatalogDto,
  ): Promise<{ started: boolean; jobId: string }> {
    this.assertAdmin(adminKey);

    const result = await this.catalogSync.start(dto.force ?? false);
    if (!result.started) {
      throw new ConflictException(
        'Ya hay un sync de catálogo en curso. Esperá a que termine antes de iniciar otro.',
      );
    }

    return { started: true, jobId: result.jobId };
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

  private assertAdmin(adminKey: string | undefined): void {
    const expected = readAdminKey(this.config);
    if (!expected) {
      throw new ForbiddenException('ADMIN_KEY no está configurado: endpoint deshabilitado');
    }
    if (!adminKey || adminKey !== expected) {
      throw new ForbiddenException('x-admin-key inválido');
    }
  }
}