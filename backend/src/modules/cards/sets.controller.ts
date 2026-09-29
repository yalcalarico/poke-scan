import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  CardsService,
  type SetCardsResponseDto,
  type SetDto,
} from './cards.service.js';

@Controller('sets')
export class SetsController {
  constructor(private readonly cardsService: CardsService) {}

  @Public()
  @Get()
  findAll(): Promise<SetDto[]> {
    return this.cardsService.findAllSets();
  }

  // B8. Antes de `:id/cards` no había ningún `:id` en este controller, así que
  // no hay riesgo de que el wildcard se coma la ruta.
  @Public()
  @Get(':id/cards')
  getSetCards(@Param('id') id: string): Promise<SetCardsResponseDto> {
    return this.cardsService.getSetCards(id);
  }
}
