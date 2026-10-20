import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AccessTokenPayload, AuthUser } from '../types/auth-user.js';
import { PrismaService } from '../../prisma/index.js';

type RequestWithUser = Request & { user?: AuthUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token de acceso requerido');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Token de acceso inválido o expirado');
    }
    try {
      if (typeof payload.sub !== 'string' || payload.sub.length === 0 ||
          typeof payload.email !== 'string' || payload.email.length === 0 ||
          typeof payload.iat !== 'number' || !Number.isSafeInteger(payload.iat) ||
          typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp) || payload.exp <= payload.iat ||
          (payload.authVersion !== undefined && (!Number.isSafeInteger(payload.authVersion) || payload.authVersion < 0))) {
        throw new UnauthorizedException('Token de acceso inválido o expirado');
      }
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (payload.iat > nowSeconds || payload.exp <= nowSeconds) {
        throw new UnauthorizedException('Token de acceso inválido o expirado');
      }
      let current: { id: string; authVersion: number } | null;
      try {
        current = await this.prisma.user.findUnique({
          where: { id: payload.sub }, select: { id: true, authVersion: true },
        });
      } catch {
        throw new ServiceUnavailableException('No se pudo validar la sesión');
      }
      if (!current) throw new UnauthorizedException('Token de acceso inválido o expirado');
      if (payload.authVersion === undefined) {
        const cutoff = this.config.get<string>('JWT_LEGACY_CUTOFF');
        const cutoffSeconds = cutoff ? Date.parse(cutoff) / 1000 : Number.NaN;
        if (!Number.isFinite(cutoffSeconds) || payload.iat >= cutoffSeconds || current.authVersion !== 0) {
          throw new UnauthorizedException('Token de acceso inválido o expirado');
        }
      } else if (!Number.isInteger(payload.authVersion) || payload.authVersion !== current.authVersion) {
        throw new UnauthorizedException('Token de acceso inválido o expirado');
      }
      request.user = payload as AuthUser;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('No se pudo validar la sesión');
    }

    return true;
  }

  private extractToken(request: RequestWithUser): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;

    const [type, value] = header.split(' ');
    if (type?.toLowerCase() !== 'bearer' || !value) return undefined;

    return value.trim();
  }
}
