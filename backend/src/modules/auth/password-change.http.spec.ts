import {
  type INestApplication,
  type ExecutionContext,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { PrismaService } from '../../prisma/index.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { UsersController } from '../users/users.controller.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { PasswordChangeController } from './password-change.controller.js';
import { PasswordChangeService } from './password-change.service.js';

describe('Cuenta — HTTP y credenciales aisladas', () => {
  const db = new PrismaClient();
  let app: INestApplication, auth: AuthService, owner: string, other: string;
  const ids: string[] = [];
  const oldPassword = 'Old password 123';
  const newPassword = 'New password 456';
  const http = () => request(app.getHttpServer());
  const change = () =>
    http()
      .post('/auth/password-changes')
      .set('X-Session-Request', '1')
      .set('Origin', 'http://localhost:3000');
  beforeAll(async () => {
    const config = new ConfigService({
      NODE_ENV: 'test',
      JWT_REFRESH_TTL_DAYS: '30',
    });
    const mod = await Test.createTestingModule({
      controllers: [UsersController, PasswordChangeController],
      providers: [
        UsersService,
        PasswordChangeService,
        { provide: PrismaService, useValue: db },
        { provide: ConfigService, useValue: config },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(ctx: ExecutionContext) {
          const req = ctx
            .switchToHttp()
            .getRequest<{
              user?: { sub: string; authVersion: number };
              headers: Record<string, string>;
            }>();
          if (req.headers['x-guest']) return false;
          req.user = {
            sub: owner,
            authVersion: Number(req.headers['x-version'] ?? 0),
          };
          return true;
        },
      })
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
    auth = new AuthService(
      db,
      new JwtService({ secret: 'synthetic-account-test-secret' }),
      config,
    );
    for (const suffix of ['owner', 'other']) {
      const u = await db.user.create({
        data: {
          email: `vineta-account-${suffix}@test.local`,
          username: `vineta_${suffix}`,
          displayName: 'Nombre original',
          passwordHash: await argon2.hash(oldPassword),
        },
      });
      ids.push(u.id);
    }
    [owner, other] = ids as [string, string];
  });
  beforeEach(async () => {
    await db.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await db.passwordRecoveryToken.deleteMany({
      where: { userId: { in: ids } },
    });
    await db.user.updateMany({
      where: { id: { in: ids } },
      data: {
        authVersion: 0,
        passwordHash: await argon2.hash(oldPassword),
        displayName: 'Nombre original',
      },
    });
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await app?.close();
    await db.$disconnect();
  });
  it('edita nombre propio y no modifica email ni otra cuenta', async () => {
    const before = (await http().get('/users/me').expect(200)).body;
    const res = await http()
      .patch('/users/me')
      .send({ displayName: '  Mi nombre  ', email: 'not-changed@invalid.test' })
      .expect(200);
    expect(res.body.displayName).toBe('Mi nombre');
    expect(res.body.email).toBe(before.email);
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('authVersion');
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: other } })).displayName,
    ).toBe('Nombre original');
  });
  it.each(['', '   ', 'x'.repeat(81), null])(
    'rechaza nombre %j sin cambiar perfil',
    async (displayName) => {
      const before = (await http().get('/users/me').expect(200)).body;
      await http().patch('/users/me').send({ displayName }).expect(400);
      expect((await http().get('/users/me').expect(200)).body).toEqual(before);
    },
  );
  it('cambia clave, invalida refresh anterior y conserva la otra cuenta', async () => {
    const old = await auth.login({
      email: 'vineta-account-owner@test.local',
      password: oldPassword,
    });
    const res = await change()
      .send({ currentPassword: oldPassword, newPassword })
      .expect(200);
    expect(res.body).toEqual({ success: true });
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['set-cookie']?.join(';')).toContain(
      'pcs.refreshToken=;',
    );
    await expect(
      auth.login({
        email: 'vineta-account-owner@test.local',
        password: oldPassword,
      }),
    ).rejects.toThrow();
    await expect(
      auth.refresh({ refreshToken: old.refreshToken }),
    ).rejects.toThrow();
    await expect(
      auth.login({
        email: 'vineta-account-owner@test.local',
        password: newPassword,
      }),
    ).resolves.toHaveProperty('accessToken');
    await expect(
      auth.login({
        email: 'vineta-account-other@test.local',
        password: oldPassword,
      }),
    ).resolves.toHaveProperty('accessToken');
  });
  it('rechaza clave incorrecta o versión vieja sin revocar sesiones', async () => {
    const session = await auth.login({
      email: 'vineta-account-owner@test.local',
      password: oldPassword,
    });
    await change()
      .send({ currentPassword: 'incorrect', newPassword })
      .expect(401);
    await change()
      .set('x-version', '99')
      .send({ currentPassword: oldPassword, newPassword })
      .expect(401);
    await expect(
      auth.refresh({ refreshToken: session.refreshToken }),
    ).resolves.toHaveProperty('accessToken');
    await expect(
      auth.login({
        email: 'vineta-account-owner@test.local',
        password: oldPassword,
      }),
    ).resolves.toHaveProperty('accessToken');
  });
  it('valida tamaño sin truncar y bloquea origen/formato ajenos', async () => {
    await change()
      .send({ currentPassword: oldPassword, newPassword: 'short' })
      .expect(400);
    await change()
      .send({ currentPassword: oldPassword, newPassword: 'x'.repeat(73) })
      .expect(400);
    await change()
      .set('Origin', 'https://untrusted.invalid')
      .send({ currentPassword: oldPassword, newPassword })
      .expect(403);
    await http()
      .post('/auth/password-changes')
      .send({ currentPassword: oldPassword, newPassword })
      .expect(403);
    await change()
      .type('form')
      .send({ currentPassword: oldPassword, newPassword })
      .expect(400);
    await expect(
      auth.login({
        email: 'vineta-account-owner@test.local',
        password: oldPassword,
      }),
    ).resolves.toHaveProperty('accessToken');
  });
  it('rechaza solicitudes de invitados', async () => {
    await http().get('/users/me').set('x-guest', '1').expect(403);
    await change()
      .set('x-guest', '1')
      .send({ currentPassword: oldPassword, newPassword })
      .expect(403);
  });
});
