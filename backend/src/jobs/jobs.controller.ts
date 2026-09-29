import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { SyncCardsService } from './sync-cards.service.js';
import { RefreshPricesDto, SyncCatalogDto } from './dto/jobs.dto.js';
import { SyncPricesService } from './sync-prices.service.js';

const SYSTEM_USER_EMAIL = 'system@pokemon-cards-scanner.app';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

    const userId = await this.resolveSystemUserId();
    const job = await this.prisma.scanJob.create({
      data: {
        userId,
        status: 'running',
        jobType: 'sync-catalog',
        startedAt: new Date(),
      },
    });

    void this.runSync(job.id, dto).catch(() => undefined);

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

  private async runSync(jobId: string, dto: SyncCatalogDto): Promise<void> {
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
