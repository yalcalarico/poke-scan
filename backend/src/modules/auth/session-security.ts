import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request } from 'express';

export const REFRESH_COOKIE = 'pcs.refreshToken';

export function readJwtSecret(config: ConfigService, name: string): string {
  const secret = config.getOrThrow<string>(name);
  if (config.get<string>('NODE_ENV') === 'production' &&
      (secret.trim().length < 32 || secret.startsWith('change-me'))) {
    throw new Error(`${name} debe ser un secreto aleatorio de al menos 32 caracteres en producción`);
  }
  return secret;
}

export function refreshCookieOptions(config: ConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.get<string>('NODE_ENV') === 'production',
    sameSite: 'lax',
    path: '/api/auth',
  };
}

export function refreshTtlMs(config: ConfigService): number {
  const days = Number(config.get<string>('JWT_REFRESH_TTL_DAYS', '30'));
  if (!Number.isFinite(days) || days <= 0 || days > 365) {
    throw new Error('JWT_REFRESH_TTL_DAYS debe estar entre 0 y 365 días');
  }
  return days * 24 * 60 * 60 * 1000;
}

export function assertSessionRequest(request: Request, config: ConfigService): void {
  // Este header fuerza preflight: un formulario de otro sitio no puede crear,
  // renovar ni cerrar la sesión del browser. CORS solo admite los orígenes propios.
  if (request.get('x-session-request') !== '1') {
    throw new ForbiddenException('Falta el encabezado de seguridad de la sesión');
  }
  const origin = request.get('origin');
  if (!origin) return;
  const allowed = (config.get<string>('CORS_ORIGINS') ||
    config.get<string>('FRONTEND_URL', 'http://localhost:3000'))
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (config.get<string>('NODE_ENV') !== 'production') {
    allowed.push('http://127.0.0.1:3000', 'http://localhost:3002');
  }
  if (!allowed.includes(origin)) {
    throw new ForbiddenException('Origen de sesión no permitido');
  }
}

export function readRefreshCookie(request: Request): string {
  const value = request.headers.cookie?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${REFRESH_COOKIE}=`))
    ?.slice(REFRESH_COOKIE.length + 1);
  if (!value || !/^[A-Za-z0-9_-]{64}$/.test(value)) {
    throw new UnauthorizedException('Sesión inválida o expirada');
  }
  return value;
}
