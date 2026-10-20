import { AccountSuppressionService } from '../account-deletion/account-suppression.service.js';
import { Prisma } from '@prisma/client';
import { refreshTtlMs } from './session-security.js';
import { randomBytes, createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/index.js';
import type { AuthTokens, PublicUser } from '../../common/types/auth-user.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RefreshSessionDto } from './dto/refresh-session.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

const USER_SELECT = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  preferredCurrency: true,
  preferredRateType: true,
  createdAt: true,
  updatedAt: true,
  authVersion: true,
} as const;

const GENERIC_CREDENTIALS_ERROR = 'Credenciales inválidas';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Optional() private readonly suppression?: AccountSuppressionService,
  ) {}

  async register(
    dto: RegisterDto,
    session?: Pick<RefreshSessionDto, 'deviceInfo'>,
  ): Promise<AuthTokens> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username: dto.username }],
      },
      select: { email: true, username: true },
    });

    if (existing) {
      if (existing.email === email) {
        throw new ConflictException('El email ya está registrado');
      }
      throw new ConflictException('El username ya está en uso');
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        username: dto.username,
        displayName: dto.displayName,
        passwordHash,
      },
      select: USER_SELECT,
    });

    return this.issueSession(user, session?.deviceInfo);
  }

  async login(
    dto: LoginDto,
    session?: Pick<RefreshSessionDto, 'deviceInfo'>,
  ): Promise<AuthTokens> {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new UnauthorizedException(GENERIC_CREDENTIALS_ERROR);
    }

    const validPassword = await argon2
      .verify(user.passwordHash, dto.password)
      .catch(() => false);

    if (!validPassword) {
      throw new UnauthorizedException(GENERIC_CREDENTIALS_ERROR);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (!current || current.passwordHash !== user.passwordHash || current.authVersion !== user.authVersion) {
        throw new UnauthorizedException(GENERIC_CREDENTIALS_ERROR);
      }
      await this.suppression?.assertAllowed(current.id);
      return this.issueSession(current, session?.deviceInfo, tx);
    });
  }

  async refresh(dto: RefreshSessionDto): Promise<AuthTokens> {
    const tokenHash = this.hashToken(dto.refreshToken);
    const owner = await this.prisma.refreshToken.findUnique({
      where: { tokenHash }, select: { userId: true },
    });
    if (!owner) throw new UnauthorizedException('Refresh token inválido');

    const result = await this.prisma.$transaction(async (tx) => {
      // El lock por usuario también ordena dos tokens distintos de la misma
      // cuenta: un reuso no puede revocar antes de que otra rotación guarde su hijo.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${owner.userId} FOR UPDATE`);
      const stored = await tx.refreshToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, revokedAt: true, expiresAt: true, issuedAuthVersion: true,
          user: { select: USER_SELECT } },
      });
      if (!stored) throw new UnauthorizedException('Refresh token inválido');
      await this.suppression?.assertAllowed(stored.userId);
      const clock = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`);
      const now = clock[0]!.now;
      if (stored.issuedAuthVersion !== stored.user.authVersion) return null;
      if (stored.revokedAt !== null) {
        await tx.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: now },
        });
        // Se lanza fuera de la transacción para que la revocación haga commit.
        return null;
      }
      if (stored.expiresAt <= now) {
        throw new UnauthorizedException('Refresh token expirado');
      }
      await tx.refreshToken.update({
        where: { id: stored.id }, data: { revokedAt: now },
      });
      return this.issueSession(stored.user, dto.deviceInfo, tx);
    });
    if (!result) {
      throw new UnauthorizedException('Refresh token inválido o no vigente');
    }
    return result;
  }

  async logout(dto: RefreshSessionDto): Promise<{ success: true }> {
    const tokenHash = this.hashToken(dto.refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  private async issueSession(
    user: PublicUser & { authVersion: number },
    deviceInfo?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AuthTokens> {
    const issue = async (client: Prisma.TransactionClient, current: PublicUser & { authVersion: number }): Promise<AuthTokens> => {
      await this.suppression?.assertAllowed(current.id);
      const accessToken = await this.jwtService.signAsync({ sub: current.id, email: current.email, authVersion: current.authVersion });
      const refreshToken = randomBytes(48).toString('base64url');
      await client.refreshToken.create({
        data: {
          userId: current.id, tokenHash: this.hashToken(refreshToken), deviceInfo: deviceInfo ?? null,
          issuedAuthVersion: current.authVersion, expiresAt: this.refreshTokenExpiry(),
        },
      });
      return { accessToken, refreshToken, user: this.toPublicUser(current) };
    };
    if (tx) return issue(tx, user);
    return this.prisma.$transaction(async (client) => {
      await client.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
      const current = await client.user.findUnique({ where: { id: user.id }, select: USER_SELECT });
      if (!current || current.authVersion !== user.authVersion) throw new UnauthorizedException(GENERIC_CREDENTIALS_ERROR);
      return issue(client, current);
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTokenExpiry(): Date {
    return new Date(Date.now() + refreshTtlMs(this.configService));
  }

  private toPublicUser(user: PublicUser & { authVersion: number }): PublicUser {
    return {
      id: user.id, email: user.email, username: user.username,
      displayName: user.displayName, avatarUrl: user.avatarUrl,
      preferredCurrency: user.preferredCurrency, preferredRateType: user.preferredRateType,
      createdAt: user.createdAt, updatedAt: user.updatedAt,
    };
  }
}
