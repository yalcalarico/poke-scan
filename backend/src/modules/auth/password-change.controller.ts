import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { RecoveryJsonGuard } from './recovery-json.guard.js';
import {
  assertSessionRequest,
  REFRESH_COOKIE,
  refreshCookieOptions,
} from './session-security.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { PasswordChangeService } from './password-change.service.js';
@Controller('auth')
export class PasswordChangeController {
  constructor(
    @Inject(PasswordChangeService)
    private readonly passwords: PasswordChangeService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}
  @Post('password-changes')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(JwtAuthGuard, RecoveryJsonGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async change(
    @Req() req: Request & { user: AuthUser },
    @Body(
      new ValidationPipe({
        expectedType: ChangePasswordDto,
        transform: true,
        whitelist: true,
      }),
    )
    dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertSessionRequest(req, this.config);
    const result = await this.passwords.change(req.user, dto);
    response.clearCookie(REFRESH_COOKIE, refreshCookieOptions(this.config));
    return result;
  }
}
