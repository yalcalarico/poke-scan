import { Prisma } from '@prisma/client';
import { refreshTtlMs } from './session-security.js';
import { randomBytes, createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
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
} as const;

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  preferredCurrency: string | null;
  preferredRateType: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const GENERIC_CREDENTIALS_ERROR = 'Credenciales inválidas';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

    return this.issueSession(this.toPublicUser(user), session?.deviceInfo);
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
        select: { id: true, userId: true, revokedAt: true, expiresAt: true,
          user: { select: USER_SELECT } },
      });
      if (!stored) throw new UnauthorizedException('Refresh token inválido');
      if (stored.revokedAt !== null) {
        await tx.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        // Se lanza fuera de la transacción para que la revocación haga commit.
        return null;
      }
      if (stored.expiresAt.getTime() <= Date.now()) {
        throw new UnauthorizedException('Refresh token expirado');
      }
      await tx.refreshToken.update({
        where: { id: stored.id }, data: { revokedAt: new Date() },
      });
      return this.issueSession(stored.user, dto.deviceInfo, tx);
    });
    if (!result) {
      throw new UnauthorizedException('Refresh token reutilizado: se revocaron todas las sesiones');
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
    user: PublicUser,
    deviceInfo?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    const refreshToken = randomBytes(48).toString('base64url');

    const persist = async (client: Prisma.TransactionClient) => client.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        deviceInfo: deviceInfo ?? null,
        expiresAt: this.refreshTokenExpiry(),
      },
    });

    if (tx) await persist(tx);
    else await this.prisma.$transaction(async (client) => {
      await client.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
      await persist(client);
    });

    return { accessToken, refreshToken, user };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTokenExpiry(): Date {
    return new Date(Date.now() + refreshTtlMs(this.configService));
  }

  private toPublicUser(user: UserRecord): PublicUser {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }
}
