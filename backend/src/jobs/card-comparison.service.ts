import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { freshnessAt } from '../common/price-metadata.js';
import { PRICE_PROVIDER, type PriceProvider } from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/index.js';
import { COMPARISON_CLOCK, type ComparisonClock } from './comparison-clock.js';
import { COMPARISON_PROVIDERS, type CardComparisonDto, type CardComparisonQueryDto, type ComparisonPriceDto, type ComparisonProvider } from './comparison.dto.js';
import { TcgcsvService } from './tcgcsv/tcgcsv.service.js';

interface PriceRow { provider: ComparisonProvider; market: Prisma.Decimal | null; low: Prisma.Decimal | null; mid: Prisma.Decimal | null; high: Prisma.Decimal | null; fetchedAt: Date; feedPublishedAt: Date | null }

@Injectable()
export class CardComparisonService {
  constructor(private readonly prisma: PrismaService, private readonly ingestion: TcgcsvService,
    @Inject(PRICE_PROVIDER) private readonly active: PriceProvider,
    @Optional() @Inject(COMPARISON_CLOCK) private readonly clock: ComparisonClock = () => new Date()) {}

  async comparison(id: string, query: CardComparisonQueryDto): Promise<CardComparisonDto> {
    const card = await this.prisma.card.findUnique({ where: { id }, select: { id: true, setId: true } });
    if (!card) throw new NotFoundException('Carta no encontrada');
    const groupId = await this.ingestion.groupForSet(card.setId);
    if (groupId !== null) await this.ingestion.enqueue(groupId, true);
    const at = this.clock();
    const today = at.toISOString().slice(0, 10);
    const from = new Date(`${today}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - query.days + 1);
    const variant = query.variant;
    const [current, history, jobs] = await Promise.all([
      this.prisma.$queryRaw<PriceRow[]>(Prisma.sql`
        SELECT DISTINCT ON (p.provider) p.provider, p.market, p.low, p.mid, p.high, p."fetchedAt", p."feedPublishedAt"
        FROM card_prices p WHERE p."cardId" = ${id} AND p.variant = ${variant} AND p.source = 'tcgplayer' AND p.currency = 'USD'
          AND p.provider IN ('tcgdex','tcgcsv') AND p."fetchedAt" <= ${at}
        ORDER BY p.provider, p."fetchedAt" DESC, p.id DESC
      `),
      this.prisma.$queryRaw<PriceRow[]>(Prisma.sql`
        SELECT DISTINCT ON (p.provider, p."fetchedAt"::date)
          p.provider, p.market, p.low, p.mid, p.high, p."fetchedAt", p."feedPublishedAt"
        FROM card_prices p WHERE p."cardId" = ${id} AND p.variant = ${variant} AND p.source = 'tcgplayer' AND p.currency = 'USD'
          AND p.provider IN ('tcgdex','tcgcsv') AND p."fetchedAt" >= ${from} AND p."fetchedAt" <= ${at}
        ORDER BY p.provider, p."fetchedAt"::date, p."fetchedAt" DESC, p.id DESC
      `),
      groupId === null ? Promise.resolve([]) : this.prisma.$queryRaw<{ status: string; publishedBuild: Date | null; availableAt: Date }[]>`
        SELECT status, "publishedBuild", "availableAt" FROM tcgcsv_group_jobs WHERE "groupId" = ${groupId}
      `,
    ]);
    const toPoint = (row: PriceRow): ComparisonPriceDto => ({ date: row.fetchedAt.toISOString().slice(0, 10), market: row.market === null ? null : Number(row.market),
      low: row.low === null ? null : Number(row.low), mid: row.mid === null ? null : Number(row.mid), high: row.high === null ? null : Number(row.high),
      fetchedAt: row.fetchedAt.toISOString(), feedPublishedAt: row.feedPublishedAt?.toISOString() ?? null, upstreamUpdatedAt: null,
      freshness: freshnessAt(row.provider === 'tcgcsv' ? row.feedPublishedAt : row.fetchedAt, at),
    });
    const job = jobs[0];
    return { cardId: id, variant, currency: 'USD', windowDays: query.days, activeProvider: this.active.id, evaluatedAt: at.toISOString(),
      tcgcsv: { enabled: this.ingestion.enabled(), groupId,
        state: !this.ingestion.enabled() ? 'disabled' : groupId === null ? 'unsupported' : job?.status === 'failed' ? 'failed' : job?.publishedBuild ? 'ready' : 'pending',
        nextAttemptAt: job?.availableAt.toISOString() ?? null },
      series: COMPARISON_PROVIDERS.map((provider) => ({ provider, source: 'tcgplayer', currency: 'USD',
        current: current.find((row) => row.provider === provider) ? toPoint(current.find((row) => row.provider === provider)!) : null,
        points: history.filter((row) => row.provider === provider).map(toPoint),
      })),
    };
  }
}
