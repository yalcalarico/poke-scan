import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { ShareService, type SharedCollectionDto } from './share.service.js';

// Controller separado del privado para que la ruta pública no quede detrás
// del JwtAuthGuard a nivel de clase de ShareController.
//
// Los precios en ARS NO se calculan acá: es público, sin usuario, y llamar a
// DolarApi por request rompería la performance. El cliente toma el rate de
// `GET /currency/usd-ars` (cacheado 1h) y convierte localmente.
@Controller('s')
export class PublicShareController {
  constructor(private readonly shareService: ShareService) {}

  @Public()
  @Get(':slug')
  getShared(@Param('slug') slug: string): Promise<SharedCollectionDto> {
    return this.shareService.getPublic(slug);
  }
}
