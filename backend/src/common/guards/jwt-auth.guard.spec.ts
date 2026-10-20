import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { randomBytes } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../prisma/index.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard con versión de sesión en Postgres', () => {
  const cutoff = '2026-10-09T00:00:00.000Z';
  const nowSeconds = Math.floor(Date.now() / 1000);
  const user = { id: 'user-id', authVersion: 2 };
  const request = { headers: { authorization: 'Bearer test-token' } };
  const contextFor = (req: unknown): ExecutionContext => ({
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext);
  const makeGuard = (payload: unknown, row: unknown = user, cutoffValue?: string, dbError = false) => {
    const jwt = { verifyAsync: vi.fn().mockResolvedValue(payload) } as unknown as JwtService;
    const findUnique = dbError ? vi.fn().mockRejectedValue(new Error('db unavailable')) : vi.fn().mockResolvedValue(row);
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    const config = { get: vi.fn((key: string) => key === 'JWT_LEGACY_CUTOFF' ? cutoffValue : undefined) } as unknown as ConfigService;
    return { guard: new JwtAuthGuard(jwt, new Reflector(), prisma, config), prisma, findUnique };
  };

  it('consulta siempre la versión actual y acepta claim coincidente', async () => {
    const { guard, findUnique } = makeGuard({ sub: 'user-id', email: 'safe@example.test', authVersion: 2, iat: nowSeconds - 10, exp: nowSeconds + 200 });
    const req = structuredClone(request) as { headers: { authorization: string }; user?: unknown };
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.user).toMatchObject({ sub: 'user-id', authVersion: 2 });
    expect(findUnique.mock.calls[0]?.[0]).toEqual({ where: { id: 'user-id' }, select: { id: true, authVersion: true } });
  });

  it('rechaza claim viejo, malformado y versiones privadas negativas', async () => {
    for (const payload of [
      { sub: 'user-id', email: 'safe@example.test', authVersion: 1, iat: nowSeconds - 10, exp: nowSeconds + 200 },
      { sub: 'user-id', email: 'safe@example.test', authVersion: -1, iat: nowSeconds - 10, exp: nowSeconds + 200 },
      { sub: 'user-id', email: 'safe@example.test', authVersion: 2, iat: '100', exp: nowSeconds + 200 },
    ]) {
      const { guard } = makeGuard(payload);
      await expect(guard.canActivate(contextFor(structuredClone(request)))).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('sólo admite legacy anterior al cutoff fijo con versión cero; sin cutoff falla cerrado', async () => {
    const cutoffSeconds = Math.floor(Date.parse(cutoff) / 1000);
    const legacyBeforeCutoff = { sub: 'user-id', email: 'safe@example.test', iat: cutoffSeconds - 1, exp: nowSeconds + 3_600 };
    const { guard } = makeGuard(legacyBeforeCutoff, { id: 'user-id', authVersion: 0 }, cutoff);
    await expect(guard.canActivate(contextFor(structuredClone(request)))).resolves.toBe(true);
    const { guard: noCutoff } = makeGuard(legacyBeforeCutoff, { id: 'user-id', authVersion: 0 });
    await expect(noCutoff.canActivate(contextFor(structuredClone(request)))).rejects.toBeInstanceOf(UnauthorizedException);
    const { guard: newerLegacy } = makeGuard({ ...legacyBeforeCutoff, iat: cutoffSeconds }, { id: 'user-id', authVersion: 0 }, cutoff);
    await expect(newerLegacy.canActivate(contextFor(structuredClone(request)))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza payloads firmados escalares/nulos y no propaga campos extra', async () => {
    for (const payload of [null, 'scalar', 7, ['array']]) {
      const { guard, findUnique } = makeGuard(payload);
      await expect(guard.canActivate(contextFor(structuredClone(request)))).rejects.toBeInstanceOf(UnauthorizedException);
      expect(findUnique).not.toHaveBeenCalled();
    }
    const { guard } = makeGuard({ sub: 'user-id', email: 'safe@example.test', authVersion: 2, iat: nowSeconds - 10, exp: nowSeconds + 200, extra: 'private' });
    const req = structuredClone(request) as { headers: { authorization: string }; user?: unknown };
    await guard.canActivate(contextFor(req));
    expect(Object.keys(req.user as object).sort()).toEqual(['authVersion', 'email', 'sub']);
  });

  it('rechaza un JWT string firmado de verdad como 401 antes de consultar PG', async () => {
    const jwt = new JwtService({ secret: randomBytes(32).toString('base64url') });
    const token = await jwt.signAsync('scalar');
    const findUnique = vi.fn();
    const guard = new JwtAuthGuard(jwt, new Reflector(), { user: { findUnique } } as unknown as PrismaService,
      {} as ConfigService);
    await expect(guard.canActivate(contextFor({ headers: { authorization: `Bearer ${token}` } }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('falla cerrado como indisponibilidad si Postgres no responde', async () => {
    const { guard } = makeGuard({ sub: 'user-id', email: 'safe@example.test', authVersion: 2, iat: nowSeconds - 10, exp: nowSeconds + 200 }, user, undefined, true);
    await expect(guard.canActivate(contextFor(structuredClone(request)))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
