import { Body, Controller, Get, NotFoundException, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { AuthUser, PublicUser } from '../../common/types/auth-user.js';
import { UsersService } from '../users/users.service.js';
import { UpdatePreferenceDto } from './dto/preference.dto.js';
import { QuoteQueryDto } from './dto/quote-query.dto.js';
import {
  CurrencyService,
  type BothRatesView,
} from './currency.service.js';

/**
 * Performance: los endpoints que devuelven precios de cartas son PÚBLICOS
 * (no hay usuario) y no pegan a DolarApi. El frontend pide el rate una vez a
 * `GET /currency/usd-ars` (cacheado 1h en Redis) y aplica la conversión.
 *
 * La única excepción es `GET /cards/:id/prices?currency=ARS`, que usa
 * exclusivamente el rate YA cacheado en Redis (nunca un fetch directo).
 */
@Controller('currency')
export class CurrencyController {
  constructor(
    private readonly currencyService: CurrencyService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Get('usd-ars')
  getUsdArs(@Query() dto: QuoteQueryDto): Promise<BothRatesView> {
    if (!this.currencyService.isArsEnabled()) {
      throw new NotFoundException('Precios en ARS deshabilitados');
    }
    return this.currencyService.getUsdArsBoth(dto.type ?? 'blue');
  }

  @UseGuards(JwtAuthGuard)
  @Patch('preference')
  updatePreference(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferenceDto,
  ): Promise<PublicUser> {
    return this.usersService.updatePreferences(user.sub, dto);
  }
}
