import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  CollectionsService,
  type CollectionDto,
  type CollectionItemDto,
  type CollectionStatsDto,
  type Paginated,
  type SetProgressDto,
} from './collections.service.js';
import { AddItemDto } from './dto/add-item.dto.js';
import { CreateCollectionDto } from './dto/create-collection.dto.js';
import { ListItemsDto } from './dto/list-items.dto.js';
import { UpdateCollectionDto } from './dto/update-collection.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';
import { PortfolioService, type PortfolioDto } from './portfolio.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService, private readonly portfolioService: PortfolioService) {}

  @Get('portfolio')
  portfolio(@CurrentUser() user: AuthUser): Promise<PortfolioDto> {
    return this.portfolioService.summary(user.sub);
  }

  @Post('collections')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCollectionDto,
  ): Promise<CollectionDto> {
    return this.collectionsService.create(user.sub, dto);
  }

  @Get('collections')
  list(@CurrentUser() user: AuthUser): Promise<CollectionDto[]> {
    return this.collectionsService.list(user.sub);
  }

  @Get('collections/:id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<CollectionDto> {
    return this.collectionsService.findOne(user.sub, id);
  }

  @Patch('collections/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCollectionDto,
  ): Promise<CollectionDto> {
    return this.collectionsService.update(user.sub, id, dto);
  }

  @HttpCode(204)
  @Delete('collections/:id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.collectionsService.remove(user.sub, id);
  }

  @Get('collections/:id/items')
  listItems(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() dto: ListItemsDto,
  ): Promise<Paginated<CollectionItemDto>> {
    return this.collectionsService.listItems(user.sub, id, dto);
  }

  @Post('collections/:id/items')
  addItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddItemDto,
  ): Promise<CollectionItemDto> {
    return this.collectionsService.addItem(user.sub, id, dto);
  }

  @Get('collections/:id/duplicates')
  getDuplicates(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<CollectionItemDto[]> {
    return this.collectionsService.getDuplicates(user.sub, id);
  }

  @Get('collections/:id/stats')
  getStats(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<CollectionStatsDto> {
    return this.collectionsService.getStats(user.sub, id);
  }

  // B7. Array pelado y sin paginar: son, a lo sumo, los sets en los que el
  // usuario tiene alguna carta. Los sets que todavía no tenés los agrega el
  // cliente cruzando con `GET /sets`.
  @Get('collections/:id/set-progress')
  getSetProgress(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<SetProgressDto[]> {
    return this.collectionsService.getSetProgress(user.sub, id);
  }

  @Post('collections/:id/refresh-prices')
  async refreshPrices(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ queued: number }> {
    return { queued: await this.collectionsService.enqueueMissingPrices(user.sub, id) };
  }

  // Vive acá y no en `CardsController` porque lee colecciones **privadas**: lo
  // que lo hace privado es el `@UseGuards` de clase de este controller, no un
  // decorador del método (gotcha 9). Antes, la ficha de carta tenía que listar
  // todas las colecciones del usuario en paralelo para encontrar esta fila.
  //
  // El `passthrough` con `res.json` es a propósito: un `return null` de Nest
  // termina la respuesta **sin cuerpo**, y "no la tenés" tiene que ser un `null`
  // JSON explícito para que el cliente no tenga que distinguir `null` de `404`
  // por el status y `undefined` de "no vino nada" por el body.
  @Get('cards/:id/location')
  getCardLocation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    return this.collectionsService
      .findCardLocation(user.sub, id)
      .then((location) => {
        res.json(location);
      });
  }

  @Patch('items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemDto,
  ): Promise<CollectionItemDto> {
    return this.collectionsService.updateItem(user.sub, itemId, dto);
  }

  @HttpCode(204)
  @Delete('items/:itemId')
  removeItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    return this.collectionsService.removeItem(user.sub, itemId);
  }
}
