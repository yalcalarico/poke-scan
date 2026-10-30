import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Patch,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { UpdateShowcaseDto } from './showcase.dto.js';
import { ShowcaseService } from './showcase.service.js';

@Controller('showcase')
@UseGuards(JwtAuthGuard)
export class ShowcaseController {
  constructor(
    @Inject(ShowcaseService) private readonly showcase: ShowcaseService,
  ) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  get(@CurrentUser() user: AuthUser) {
    return this.showcase.get(user.sub);
  }
  @Patch()
  @Header('Cache-Control', 'private, no-store')
  update(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        expectedType: UpdateShowcaseDto,
        transform: true,
        whitelist: true,
      }),
    )
    dto: UpdateShowcaseDto,
  ) {
    return this.showcase.update(user.sub, dto);
  }
}
