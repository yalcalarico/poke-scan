import { createHash } from 'node:crypto';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../../prisma/index.js';
import type { RegisterDto } from './dto/register.dto.js';

const TEST_EMAIL = 'test@ejemplo.com';

const registerDto: RegisterDto = {
  email: TEST_EMAIL,
  password: 'password123',
  username: 'testuser',
  displayName: 'Test User',
};

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

describe('AuthService', () => {
  const prismaClient = new PrismaClient();
  let moduleRef: TestingModule;
  let service: AuthService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.registerAsync({
          global: true,
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            secret: configService.getOrThrow<string>('JWT_SECRET'),
            signOptions: {
              expiresIn: configService.get<string>('JWT_ACCESS_TTL', '15m') as JwtSignOptions['expiresIn'],
            },
          }),
        }),
      ],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaClient },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterAll(async () => {
    await prismaClient.user.deleteMany({ where: { email: { endsWith: '@ejemplo.com' } } });
    await prismaClient.$disconnect();
    await moduleRef.close();
  });

  beforeEach(async () => {
    // Acotado a los datos del spec: los specs comparten la DB de desarrollo, así
    // que un `deleteMany()` sin filtro borra los usuarios reales que uno tenga
    // (el de pruebas de `scripts/dev-user.ts` incluido) y sus sesiones. Este spec
    // usa dos emails, y ambos caen en `@ejemplo.com`.
    await prismaClient.user.deleteMany({ where: { email: { endsWith: '@ejemplo.com' } } });
  });

  it('registra un usuario y no expone el passwordHash', async () => {
    const result = await service.register(registerDto);

    expect(result.user).toMatchObject({
      email: registerDto.email,
      username: registerDto.username,
      displayName: registerDto.displayName,
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('password');
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
  });

  it('rechaza emails y usernames duplicados con ConflictException', async () => {
    await service.register(registerDto);

    await expect(service.register(registerDto)).rejects.toBeInstanceOf(
      ConflictException,
    );

    await expect(
      service.register({
        email: 'otro@ejemplo.com',
        password: registerDto.password,
        username: 'otro_user',
        displayName: registerDto.displayName,
      }),
    ).resolves.toMatchObject({ user: { email: 'otro@ejemplo.com' } });
  });

  it('guarda el refresh token hasheado (SHA-256) en la BD, no en claro', async () => {
    const { refreshToken } = await service.register(registerDto);

    const stored = await prismaClient.refreshToken.findMany({
      where: { user: { email: TEST_EMAIL } },
    });

    expect(stored).toHaveLength(1);
    expect(stored[0]!.tokenHash).not.toBe(refreshToken);
    expect(stored[0]!.tokenHash).toBe(sha256(refreshToken));
    expect(stored[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('hace login y falla con credenciales inválidas', async () => {
    await service.register(registerDto);

    const session = await service.login({
      email: registerDto.email,
      password: registerDto.password,
    });
    expect(session.user.email).toBe(registerDto.email);
    expect(session.user).not.toHaveProperty('passwordHash');

    await expect(
      service.login({ email: registerDto.email, password: 'incorrecta' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      service.login({ email: 'nadie@ejemplo.com', password: 'password123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rota el refresh token: el viejo queda revocado y se emite uno nuevo', async () => {
    const { refreshToken: oldToken } = await service.register(registerDto);

    const rotated = await service.refresh({ refreshToken: oldToken });

    const oldStored = await prismaClient.refreshToken.findUnique({
      where: { tokenHash: sha256(oldToken) },
    });
    const newStored = await prismaClient.refreshToken.findUnique({
      where: { tokenHash: sha256(rotated.refreshToken) },
    });

    expect(oldStored!.revokedAt).not.toBeNull();
    expect(newStored!.revokedAt).toBeNull();
    expect(rotated.refreshToken).not.toBe(oldToken);
    expect(rotated.accessToken).toEqual(expect.any(String));
  });

  it('detecta reutilización: revoca todos los tokens del usuario y lanza UnauthorizedException', async () => {
    const { refreshToken: firstToken } = await service.register(registerDto);
    const { refreshToken: secondToken } = await service.refresh({
      refreshToken: firstToken,
    });
    const { refreshToken: thirdToken } = await service.refresh({
      refreshToken: secondToken,
    });
    expect(thirdToken).toBeTruthy();

    await expect(
      service.refresh({ refreshToken: firstToken }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const active = await prismaClient.refreshToken.findMany({
      where: { user: { email: TEST_EMAIL }, revokedAt: null },
    });
    expect(active).toHaveLength(0);
  });

  it('rechaza refresh tokens expirados', async () => {
    const { refreshToken } = await service.register(registerDto);

    await prismaClient.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      service.refresh({ refreshToken }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout es idempotente', async () => {
    const { refreshToken } = await service.register(registerDto);

    await expect(service.logout({ refreshToken })).resolves.toEqual({
      success: true,
    });
    await expect(service.logout({ refreshToken })).resolves.toEqual({
      success: true,
    });
    await expect(
      service.logout({ refreshToken: 'token-inexistente' }),
    ).resolves.toEqual({ success: true });
  });
});
