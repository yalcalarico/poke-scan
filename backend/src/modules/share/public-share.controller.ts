import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { ShareService, type SharedCollectionDto } from './share.service.js';

// Controller separado del privado para que la ruta pública no quede detrás
// del JwtAuthGuard a nivel de clase de ShareController.
//
// La referencia pública permanece en USD: no aplica moneda de cuenta ni ajustes
// por condición, y solo lee precios guardados del proveedor activo.
@Controller('s')
export class PublicShareController {
  constructor(private readonly shareService: ShareService) {}

  @Public()
  @Get(':slug')
  async getShared(
    @Param('slug') slug: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SharedCollectionDto> {
    response.setHeader('Cache-Control', 'no-store');
    return this.shareService.getPublic(slug);
  }
}
