import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { CreateShareDto } from './dto/create-share.dto.js';
import { UpdateShareDto } from './dto/update-share.dto.js';
import {
  ShareService,
  type ShareLinkDto,
  type ShareViewStatsDto,
} from './share.service.js';

@Controller('share')
@UseGuards(JwtAuthGuard)
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateShareDto,
  ): Promise<ShareLinkDto> {
    return this.shareService.create(user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ShareLinkDto[]> {
    return this.shareService.listMine(user.sub);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser): Promise<ShareViewStatsDto[]> {
    return this.shareService.stats(user.sub);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateShareDto,
  ): Promise<ShareLinkDto> {
    return this.shareService.update(user.sub, id, dto);
  }

  @HttpCode(204)
  @Delete(':id')
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.shareService.revoke(user.sub, id);
  }
}
