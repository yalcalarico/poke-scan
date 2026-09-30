import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CARD_DATA_PROVIDER,
  PROVIDER_IDS,
  type CardDataProvider,
  type RemoteCard,
} from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withPageRetry } from './retry.js';
import { SyncSetsService } from './sync-sets.service.js';
import { SyncStateService } from './sync-state.service.js';
import { DEFAULT_PAGE_SIZE, REQUEST_PAUSE_MS } from './sync.constants.js';

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface SyncCardsOptions {
  force?: boolean;
  pageSize?: number;
  maxPages?: number;
}

export interface SyncCardsResult {
  processed: number;
  total: number;
  skipped: boolean;
}

@Injectable()
export class SyncCardsService {
  private readonly logger = new Logger(SyncCardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncSetsService: SyncSetsService,
    private readonly syncState: SyncStateService,
    @Inject(CARD_DATA_PROVIDER) private readonly provider: CardDataProvider,
  ) {}

  async syncAll(options: SyncCardsOptions = {}): Promise<SyncCardsResult> {
    if (this.provider.id !== PROVIDER_IDS.POKEMON_TCG_IO) {
      throw new Error(
        `El sync actual de cartas todavía no reconcilia IDs externos de ${this.provider.id}`,
      );
    }

    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

    await this.syncSetsService.syncAll(pageSize);

    const state = await this.syncState.readCards();
    const alreadyComplete = !options.force && state.isComplete;
    if (alreadyComplete) {
      this.logger.log(
        'Sync cards omitido: el catálogo ya está completo. Usá { force: true } para rehacerlo.',
      );
      const probe = await withPageRetry(this.logger, 'Sync cards: conteo total', () =>
        this.provider.getCardsPage(1, 1),
      );
      return { processed: 0, total: probe?.total ?? 0, skipped: true };
    }

    const resumeFrom = options.force ? 0 : state.lastPage;
    if (resumeFrom > 0) {
      this.logger.log(`Sync cards reanudando desde la página ${resumeFrom + 1}`);
    }

    const first = await withPageRetry(this.logger, 'Sync cards: página inicial', () =>
      resumeFrom === 0
        ? this.provider.getCardsPage(1, pageSize)
        : this.provider.getCardsPage(1, 1),
    );
    if (!first) {
      this.logger.error('Sync cards no pudo obtener la página inicial: se aborta');
      return { processed: 0, total: 0, skipped: false };
    }

    const total = first.total;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);

    let processed = 0;
    let interrupted = false;
    const lastPage = Math.min(totalPages, options.maxPages ?? totalPages);

    if (resumeFrom === 0 && first.data.length > 0) {
      processed += await this.upsertBatch(first.data);
      await this.syncState.saveCards(1, totalPages);
      this.logger.log(
        `Sync cards: página 1/${totalPages} — ${processed} cartas (${first.data.length} guardadas)`,
      );
    }

    for (let page = resumeFrom + 1; page <= lastPage; page++) {
      if (page === 1) continue;
      await wait(REQUEST_PAUSE_MS);
      const result = await withPageRetry(
        this.logger,
        `Sync cards: página ${page}`,
        () => this.provider.getCardsPage(page, pageSize),
      );
      if (!result) {
        interrupted = true;
        this.logger.error(
          `Sync cards detenido en la página ${page}: se puede reanudar con POST /api/jobs/sync-catalog`,
        );
        break;
      }
      const saved = await this.upsertBatch(result.data);
      processed += saved;
      /*
       * El cursor se escribe **después** del `upsert`, nunca antes. Si el proceso
       * muere entre los dos, la página se reprocesa y el `upsert` la deja igual;
       * al revés, la página se pierde en silencio y el sync se declararía
       * completo con un hueco en el medio.
       */
      await this.syncState.saveCards(page, totalPages);
      this.logger.log(
        `Sync cards: página ${page}/${totalPages} — ${processed} cartas (${saved} guardadas)`,
      );
    }

    if (interrupted) {
      this.logger.log(`Sync cards interrumpido tras ${processed} cartas`);
    } else if (lastPage >= totalPages) {
      await this.syncState.completeCards(totalPages);
      this.logger.log(`Sync cards completado: ${processed} cartas`);
    } else {
      this.logger.log(
        `Sync cards parcial: ${processed} cartas hasta la página ${lastPage}/${totalPages}`,
      );
    }

    return { processed, total, skipped: false };
  }

  private async upsertBatch(cards: RemoteCard[]): Promise<number> {
    let saved = 0;
    const [cardAliases, setAliases] = await Promise.all([
      this.prisma.cardExternalId.findMany({
        where: {
          provider: this.provider.id,
          externalId: { in: cards.map((card) => card.id) },
        },
        select: { externalId: true, cardId: true },
      }),
      this.prisma.cardSetExternalId.findMany({
        where: {
          provider: this.provider.id,
          externalId: { in: [...new Set(cards.map((card) => card.setId))] },
        },
        select: { externalId: true, setId: true },
      }),
    ]);
    const cardIdByExternalId = new Map(
      cardAliases.map((alias) => [alias.externalId, alias.cardId]),
    );
    const setIdByExternalId = new Map(
      setAliases.map((alias) => [alias.externalId, alias.setId]),
    );

    for (const card of cards) {
      try {
        if (!card.setId) {
          this.logger.warn(
            `Carta ${card.id} (${card.name}) sin setId: se omite`,
          );
          continue;
        }
        const canonicalSetId = setIdByExternalId.get(card.setId);
        if (!canonicalSetId) {
          this.logger.warn(
            `La carta ${card.id} apunta al set externo ${card.setId}, que no está mapeado para ${this.provider.id}: se omite`,
          );
          continue;
        }
        const canonicalCardId = cardIdByExternalId.get(card.id) ?? card.id;
        const hasExternalId = cardIdByExternalId.has(card.id);
        const data = {
          name: card.name,
          supertype: card.supertype,
          subtypes: card.subtypes,
          hp: card.hp,
          types: card.types,
          number: card.number,
          rarity: card.rarity,
          artist: card.artist,
          imageSmall: card.imageSmall,
          imageLarge: card.imageLarge,
          regulationMark: card.regulationMark,
          language: card.language ?? 'en',
          rawJson: card.raw as Prisma.InputJsonValue,
          syncedAt: new Date(),
        };
        const upsert = this.prisma.card.upsert({
          where: { id: canonicalCardId },
          create: { id: canonicalCardId, setId: canonicalSetId, ...data },
          update: { setId: canonicalSetId, ...data },
        });
        if (hasExternalId) {
          await upsert;
        } else {
          await this.prisma.$transaction([
            upsert,
            this.prisma.cardExternalId.create({
              data: {
                provider: this.provider.id,
                externalId: card.id,
                cardId: canonicalCardId,
              },
            }),
          ]);
        }
        saved += 1;
      } catch (error) {
        this.logger.error(
          `No se pudo guardar la carta ${card.id} (${card.name}): ${(error as Error).message}`,
        );
      }
    }
    return saved;
  }
}
