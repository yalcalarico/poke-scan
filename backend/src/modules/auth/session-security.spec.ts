import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import {
  assertSessionRequest, readJwtSecret, readRefreshCookie,
  refreshCookieOptions, refreshTtlMs,
} from './session-security.js';

const config = (values: Record<string, string> = {}) => new ConfigService(values);
const request = (origin?: string, header = '1', cookie?: string) => ({
  get: (name: string) => name === 'origin' ? origin : header,
  headers: { cookie },
}) as unknown as Request;

describe('seguridad de sesión', () => {
  it('rechaza los placeholders y secretos cortos en producción', () => {
    for (const JWT_SECRET of ['change-me-in-production', 'change-me'.repeat(6), 'short']) {
      expect(() => readJwtSecret(config({ NODE_ENV: 'production', JWT_SECRET }), 'JWT_SECRET')).toThrow();
    }
    const secret = 'a8f1'.repeat(16);
    expect(readJwtSecret(config({ NODE_ENV: 'production', JWT_SECRET: secret }), 'JWT_SECRET')).toBe(secret);
  });

  it('mantiene la configuración local y no acepta una variable ausente', () => {
    expect(readJwtSecret(config({ NODE_ENV: 'development', JWT_SECRET: 'dev' }), 'JWT_SECRET')).toBe('dev');
    expect(() => readJwtSecret(config(), 'JWT_SECRET')).toThrow();
  });

  it('la cookie es HttpOnly, limitada a auth y Secure en producción', () => {
    expect(refreshCookieOptions(config({ NODE_ENV: 'production' }))).toEqual({
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth',
    });
    expect(refreshCookieOptions(config({ NODE_ENV: 'development' })).secure).toBe(false);
    expect(refreshTtlMs(config())).toBe(30 * 86400000);
    for (const days of ['NaN', '0', '-1', '366']) {
      expect(() => refreshTtlMs(config({ JWT_REFRESH_TTL_DAYS: days }))).toThrow();
    }
  });

  it('bloquea formularios sin header, orígenes ajenos y null', () => {
    const cfg = config({ NODE_ENV: 'production', FRONTEND_URL: 'https://app.example.test' });
    expect(() => assertSessionRequest(request(undefined, ''), cfg)).toThrow(ForbiddenException);
    for (const origin of ['https://evil.example.test', 'null', 'http://localhost:3000']) {
      expect(() => assertSessionRequest(request(origin), cfg)).toThrow(ForbiddenException);
    }
    expect(() => assertSessionRequest(request('https://app.example.test'), cfg)).not.toThrow();
    expect(() => assertSessionRequest(request(), cfg)).not.toThrow();
  });

  it('lee únicamente el token opaco válido de la cookie', () => {
    const token = 'x'.repeat(64);
    expect(readRefreshCookie(request(undefined, '1', `other=1; pcs.refreshToken=${token}`))).toBe(token);
    for (const cookie of [undefined, 'pcs.refreshToken=', 'pcs.refreshToken=bad', 'pcs.refreshToken=%00']) {
      expect(() => readRefreshCookie(request(undefined, '1', cookie))).toThrow(UnauthorizedException);
    }
  });
});
