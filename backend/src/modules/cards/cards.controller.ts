import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  CardsService,
  type CardDto,
  type CardWithPricesDto,
  type Paginated,
  type PriceHistoryDto,
} from './cards.service.js';
import { CardPricesQueryDto } from './dto/card-prices-query.dto.js';
import { IdentifyDto } from './dto/identify.dto.js';
import { PriceHistoryQueryDto } from './dto/price-history-query.dto.js';
import { SearchCardsDto } from './dto/search-cards.dto.js';
import { IdentifyService, type IdentifyResultDto } from './identify.service.js';

/**
 * Endpoints PÚBLICOS de catálogo. No incluyen precios en ARS: son públicos y
 * sin usuario, así que llamar a DolarApi por request mataría la performance
 * (cada página paginada pagaría una consulta externa). El frontend pide el
 * rate una vez a `GET /currency/usd-ars` (cacheado 1h) y convierte localmente.
 * La única excepción es `GET /cards/:id/prices?currency=ARS`, que usa el rate
 * ya cacheado en Redis.
 */
@Controller('cards')
export class CardsController {
  constructor(
    private readonly cardsService: CardsService,
    private readonly identifyService: IdentifyService,
  ) {}

  @Public()
  @Get('search')
  search(@Query() dto: SearchCardsDto): Promise<Paginated<CardDto>> {
    return this.cardsService.search(dto);
  }

  @Public()
  @Get('scanner-config')
  scannerConfig(): Promise<{ setCodes: string[]; setNames: string[] }> {
    return this.identifyService.scannerConfig();
  }

  // POST, así que no colisiona con `@Get(':id')`.
  @Public()
  @Post('identify')
  @HttpCode(HttpStatus.OK)
  identify(@Body() dto: IdentifyDto): Promise<IdentifyResultDto> {
    return this.identifyService.identify(dto);
  }

  // Sin `?currency=ARS` no se toca Redis ni DolarApi: el cliente convierte.
  @Public()
  @Get(':id/prices')
  getCardWithPrices(
    @Param('id') id: string,
    @Query() dto: CardPricesQueryDto,
  ): Promise<CardWithPricesDto> {
    return this.cardsService.getCardWithPrices(id, dto);
  }

  // A diferencia de `:id/prices`, esta ruta **nunca** consulta al proveedor de
  // precios: lee solo la tabla local. Por eso puede ir por el mismo camino
  // público sin gastarse nada del presupuesto de la API externa.
  @Public()
  @Get(':id/prices/history')
  getPriceHistory(
    @Param('id') id: string,
    @Query() dto: PriceHistoryQueryDto,
  ): Promise<PriceHistoryDto> {
    return this.cardsService.getPriceHistory(id, dto);
  }

  @Public()
  @Get(':id')
  getById(@Param('id') id: string): Promise<CardDto> {
    return this.cardsService.getById(id);
  }
}
