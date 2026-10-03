import {
  Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthResponseDto, AuthTokens } from '../../common/types/auth-user.js';
import { AuthService } from './auth.service.js';
import { BrowserSessionDto } from './dto/browser-session.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import {
  assertSessionRequest, readRefreshCookie, REFRESH_COOKIE,
  refreshCookieOptions, refreshTtlMs,
} from './session-security.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto, @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    assertSessionRequest(request, this.config);
    return this.sendSession(response, await this.authService.register(dto));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto, @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    assertSessionRequest(request, this.config);
    return this.sendSession(response, await this.authService.login(dto));
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Body() dto: BrowserSessionDto, @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    assertSessionRequest(request, this.config);
    response.setHeader('Cache-Control', 'no-store');
    try {
      return this.sendSession(response, await this.authService.refresh({
        refreshToken: readRefreshCookie(request), deviceInfo: dto.deviceInfo,
      }));
    } catch (error) {
      if (error instanceof UnauthorizedException) this.clearSessionCookie(response);
      throw error;
    }
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  async logout(
    @Body() _dto: BrowserSessionDto, @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    assertSessionRequest(request, this.config);
    response.setHeader('Cache-Control', 'no-store');
    try {
      await this.authService.logout({ refreshToken: readRefreshCookie(request) });
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
    } finally {
      this.clearSessionCookie(response);
    }
    return { success: true };
  }

  private sendSession(response: Response, tokens: AuthTokens): AuthResponseDto {
    response.setHeader('Cache-Control', 'no-store');
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...refreshCookieOptions(this.config), maxAge: refreshTtlMs(this.config),
    });
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  private clearSessionCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, refreshCookieOptions(this.config));
  }
}
