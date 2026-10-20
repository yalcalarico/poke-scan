import { Prisma } from '@prisma/client';
import { Controller, Get, Header, Param, Query, UseGuards, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { CardComparisonService } from './card-comparison.service.js';
import { CollectionComparisonService } from './collection-comparison.service.js';
import { CardComparisonQueryDto, ComparisonQueryDto, type CardComparisonDto, type CollectionComparisonDto } from './comparison.dto.js';

@Controller()
export class ComparisonController {
  constructor(private readonly cards: CardComparisonService, private readonly collections: CollectionComparisonService) {}

  @Public()
  @Header('Cache-Control', 'no-store')
  @Get('cards/:id/comparison')
  card(@Param('id') id: string, @Query() query: CardComparisonQueryDto): Promise<CardComparisonDto> {
    return this.ready(() => this.cards.comparison(id, query));
  }

  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  @Get('collections/:id/comparison')
  collection(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: ComparisonQueryDto): Promise<CollectionComparisonDto> {
    return this.ready(() => this.collections.comparison(user.sub, id, query.days));
  }

  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  @Get('portfolio/comparison')
  portfolio(@CurrentUser() user: AuthUser, @Query() query: ComparisonQueryDto): Promise<CollectionComparisonDto> {
    return this.ready(() => this.collections.comparison(user.sub, null, query.days));
  }

  private async ready<T>(read: () => Promise<T>): Promise<T> {
    try { return await read(); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2021' || error.code === 'P2022' || (error.code === 'P2010' && ['42P01', '42703'].includes(String(error.meta?.code))))) {
        throw new ServiceUnavailableException('La comparación está pendiente de la actualización local de la base de datos');
      }
      throw error;
    }
  }
}
