import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/index.js';
import { latestMarketPriceJoin } from '../../common/sql/latest-price.js';
import {
  PRICE_PROVIDER,
  type PriceProvider,
} from '../providers/card-provider.interface.js';
import type { UpdateShowcaseDto } from './showcase.dto.js';

type Preference = { mode: 'value' | 'personal'; cardIds: string[] };
type ReferenceRow = {
  cardId: string;
  variant: string;
  market: number | null;
  fetchedAt: Date | null;
};
const cardSelect = {
  id: true,
  name: true,
  supertype: true,
  subtypes: true,
  hp: true,
  types: true,
  number: true,
  rarity: true,
  artist: true,
  setId: true,
  imageSmall: true,
  imageLarge: true,
} as const;

@Injectable()
export class ShowcaseService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PRICE_PROVIDER) private readonly prices: PriceProvider,
  ) {}

  async get(userId: string) {
    return this.db.$transaction(async (tx) => {
      const stored = await tx.showcasePreference.findUnique({
        where: { userId },
      });
      const preferences: Preference = {
        mode: stored?.mode === 'personal' ? 'personal' : 'value',
        cardIds: stored?.cardIds ?? [],
      };
      return { preferences, cards: await this.cards(tx, userId, preferences) };
    });
  }

  async update(userId: string, dto: UpdateShowcaseDto) {
    await this.db.$transaction(async (tx) => {
      // Comparte la frontera de cuenta con la baja y evita upserts concurrentes.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`,
      );
      if (dto.cardIds.length) {
        const owned = await tx.collectionItem.findMany({
          where: { cardId: { in: dto.cardIds }, collection: { userId } },
          distinct: ['cardId'],
          select: { cardId: true },
        });
        if (owned.length !== dto.cardIds.length)
          throw new BadRequestException('Elegí sólo cartas de tus colecciones');
      }
      await tx.showcasePreference.upsert({
        where: { userId },
        create: { userId, mode: dto.mode, cardIds: dto.cardIds },
        update: { mode: dto.mode, cardIds: dto.cardIds },
      });
    });
    return this.get(userId);
  }

  private async cards(
    tx: Prisma.TransactionClient,
    userId: string,
    preference: Preference,
  ) {
    if (preference.mode === 'personal' && !preference.cardIds.length) return [];
    const chosen =
      preference.mode === 'personal'
        ? Prisma.sql`AND i."cardId" IN (${Prisma.join(preference.cardIds)})`
        : Prisma.empty;
    // Una referencia por carta, sólo de variantes propias y del proveedor vigente.
    const rows = await tx.$queryRaw<ReferenceRow[]>(Prisma.sql`
      SELECT "cardId",variant,market,"fetchedAt" FROM (
        SELECT DISTINCT ON (i."cardId") i."cardId",i.variant,lp.market::float8 AS market,lp."fetchedAt",c.name
        FROM collection_items i JOIN collections col ON col.id=i."collectionId"
        JOIN cards c ON c.id=i."cardId"
        ${latestMarketPriceJoin(this.prices)}
        WHERE col."userId"=${userId} ${chosen}
        ORDER BY i."cardId",lp.market DESC NULLS LAST,i.variant ASC
      ) ranked
      ${preference.mode === 'value' ? Prisma.sql`WHERE market IS NOT NULL ORDER BY market DESC,name ASC,"cardId" ASC LIMIT 3` : Prisma.sql`ORDER BY array_position(ARRAY[${Prisma.join(preference.cardIds)}]::text[],"cardId")`}
    `);
    if (!rows.length) return [];
    const cards = await tx.card.findMany({
      where: { id: { in: rows.map((row) => row.cardId) } },
      select: cardSelect,
    });
    const byId = new Map(cards.map((card) => [card.id, card]));
    return rows.flatMap((row) => {
      const card = byId.get(row.cardId);
      return card
        ? [
            {
              card,
              variant: row.variant,
              market: row.market,
              currency: 'USD' as const,
              fetchedAt: row.fetchedAt?.toISOString() ?? null,
            },
          ]
        : [];
    });
  }
}
