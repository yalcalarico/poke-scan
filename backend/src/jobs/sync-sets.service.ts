import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CARD_DATA_PROVIDER,
  type CardDataProvider,
  type RemoteSet,
} from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withPageRetry } from './retry.js';
import { DEFAULT_PAGE_SIZE, REQUEST_PAUSE_MS } from './sync.constants.js';

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function parseReleaseDate(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value.trim());
  if (match) {
    const [, year, month, day] = match;
    const date = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface SyncSetsResult {
  processed: number;
  total: number;
}

@Injectable()
export class SyncSetsService {
  private readonly logger = new Logger(SyncSetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CARD_DATA_PROVIDER) private readonly provider: CardDataProvider,
  ) {}

  async syncAll(pageSize: number = DEFAULT_PAGE_SIZE): Promise<SyncSetsResult> {
    const first = await withPageRetry(this.logger, 'Sync sets: página 1', () =>
      this.provider.getSets(1, pageSize),
    );
    if (!first) {
      this.logger.error('Sync sets no pudo obtener la primera página: se aborta');
      return { processed: 0, total: 0 };
    }

    const totalPages = Math.max(first.totalPages, 1);
    const total = first.total;

    let processed = 0;
    await this.upsertBatch(first.data);
    processed += first.data.length;
    this.logger.log(`Sync sets: página 1/${totalPages} — ${processed} sets`);

    for (let page = 2; page <= totalPages; page++) {
      await wait(REQUEST_PAUSE_MS);
      const result = await withPageRetry(
        this.logger,
        `Sync sets: página ${page}`,
        () => this.provider.getSets(page, pageSize),
      );
      if (!result) break;
      await this.upsertBatch(result.data);
      processed += result.data.length;
      this.logger.log(
        `Sync sets: página ${page}/${totalPages} — ${processed} sets`,
      );
    }

    this.logger.log(`Sync sets completado: ${processed} sets`);
    return { processed, total };
  }

  private async upsertBatch(sets: RemoteSet[]): Promise<void> {
    for (const set of sets) {
      try {
        const data = {
          name: set.name,
          series: set.series,
          printedTotal: set.printedTotal,
          total: set.total,
          releaseDate: parseReleaseDate(set.releaseDate),
          logoUrl: set.logoUrl,
          symbolUrl: set.symbolUrl,
          ptcgoCode: set.ptcgoCode,
          rawJson: set.raw as Prisma.InputJsonValue,
          syncedAt: new Date(),
        };
        await this.prisma.cardSet.upsert({
          where: { id: set.id },
          create: { id: set.id, ...data },
          update: data,
        });
      } catch (error) {
        this.logger.error(
          `No se pudo guardar el set ${set.id} (${set.name}): ${(error as Error).message}`,
        );
      }
    }
  }
}
