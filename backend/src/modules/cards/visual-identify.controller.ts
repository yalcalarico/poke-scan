import {
  Body,
  Controller,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PrismaService } from '../../prisma/index.js';
import {
  VisualIdentifyDto,
  type VisualIdentifyResponseDto,
} from './dto/visual-identify.dto.js';
import { VisualIdentifyService } from './visual-identify.service.js';

@Controller('cards')
@UseGuards(JwtAuthGuard)
export class VisualIdentifyController {
  constructor(
    private readonly visual: VisualIdentifyService,
    private readonly prisma: PrismaService,
  ) {}
  @Post('identify-visual')
  @HttpCode(200)
  async identify(
    @Body() dto: VisualIdentifyDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<VisualIdentifyResponseDto> {
    const start = performance.now();
    response.setHeader('Cache-Control', 'no-store');
    const abort = new AbortController();
    const closed = () => {
      if (!response.writableEnded) abort.abort();
    };
    response.on('close', closed);
    try {
      const result = await this.visual.identify(dto, abort.signal);
      const cards = await this.prisma.card.findMany({
        where: { id: { in: result.candidates.map((c) => c.id) } },
        select: {
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
          set: {
            select: {
              id: true,
              name: true,
              series: true,
              printedTotal: true,
              total: true,
              releaseDate: true,
              logoUrl: true,
              symbolUrl: true,
            },
          },
        },
      });
      return {
        ...result,
        totalMs: performance.now() - start,
        candidates: result.candidates.flatMap((candidate) => {
          const card = cards.find((c) => c.id === candidate.id);
          return card
            ? [
                {
                  card: {
                    ...card,
                    set: {
                      ...card.set,
                      releaseDate:
                        card.set.releaseDate?.toISOString().slice(0, 10) ??
                        null,
                    },
                  },
                  similarity: candidate.similarity,
                  retrievalRank: candidate.retrievalRank,
                  geometry: candidate.geometry,
                },
              ]
            : [];
        }),
      };
    } finally {
      response.off('close', closed);
    }
  }
}
