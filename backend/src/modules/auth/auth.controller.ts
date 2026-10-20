import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { AccountDeletionService } from '../account-deletion/account-deletion.service.js';
import { AccountDeletionDto, type AccountDeletionResponseDto, type AccountDeletionAvailabilityDto } from '../account-deletion/account-deletion.dto.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  Body, Controller, Get, HttpCode, Optional, Post, Req, Res, ServiceUnavailableException, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthResponseDto, AuthTokens } from '../../common/types/auth-user.js';
import { AuthService } from './auth.service.js';
import { RecoveryJsonGuard } from './recovery-json.guard.js';
import { PasswordRecoveryService } from './password-recovery.service.js';
import { PasswordRecoveryRequestDto } from './dto/password-recovery-request.dto.js';
import { PasswordRecoveryDto } from './dto/password-recovery.dto.js';
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
    private readonly recoveryService: PasswordRecoveryService,
    private readonly config: ConfigService,
    @Optional() private readonly deletion?: AccountDeletionService,
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
  @SkipThrottle()
  @HttpCode(202)
  @UseGuards(RecoveryJsonGuard)
  @Post('password-recovery-requests')
  async requestPasswordRecovery(
    @Body() dto: PasswordRecoveryRequestDto, @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    assertSessionRequest(request, this.config);
    this.setRecoveryNoStore(response);
    return this.recoveryService.request(dto.email, request.ip ?? 'unknown');
  }

  @Public()
  @SkipThrottle()
  @HttpCode(200)
  @UseGuards(RecoveryJsonGuard)
  @Post('password-recoveries')
  async recoverPassword(
    @Body() dto: PasswordRecoveryDto, @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    assertSessionRequest(request, this.config);
    const result = await this.recoveryService.recover(dto.token, dto.newPassword, request.ip ?? 'unknown');
    this.setRecoveryNoStore(response);
    this.clearSessionCookie(response);
    return result;
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

  @UseGuards(JwtAuthGuard)
  @Get('account-deletion-availability')
  async accountDeletionAvailability(
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccountDeletionAvailabilityDto> {
    this.setRecoveryNoStore(response);
    return { available: await this.deletion?.isAvailable() ?? false };
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RecoveryJsonGuard)
  @Post('account-deletions')
  async deleteAccount(
    @Body() dto: AccountDeletionDto, @Req() request: Request & { user: AuthUser },
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccountDeletionResponseDto> {
    assertSessionRequest(request, this.config);
    this.setRecoveryNoStore(response);
    if (!this.deletion) throw new ServiceUnavailableException('La eliminación todavía no está disponible');
    const result = await this.deletion.deleteOwnAccount(request.user, dto);
    this.clearSessionCookie(response);
    return result;
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

  private setRecoveryNoStore(response: Response): void {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
  }
}
