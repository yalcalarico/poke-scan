import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PrismaService } from '../src/prisma/index.js';

describe('sesión HTTP con cookie', () => {
  const prisma = new PrismaClient();
  let app: INestApplication<App>;
  const email = 'cookie-security@test.local';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ secret: 'test-session-security-secret', signOptions: { expiresIn: '15m' } })],
      controllers: [AuthController],
      providers: [AuthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  beforeEach(async () => { await prisma.user.deleteMany({ where: { email } }); });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
    await app.close();
  });
  const payload = { email, username: 'cookiesecurity', password: 'CookiePassword123', displayName: 'Cookie' };
  const register = () => request(app.getHttpServer()).post('/api/auth/register')
    .set('X-Session-Request', '1').send(payload);
  const cookies = (headers: Record<string, unknown>): string[] => {
    const value = headers['set-cookie'];
    if (!Array.isArray(value) || !value.every((part): part is string => typeof part === 'string')) {
      throw new Error('Falta Set-Cookie');
    }
    return value;
  };

  it('no expone refreshToken, rota cookies y las borra al salir', async () => {
    const created = await register().expect(201);
    expect(created.body).not.toHaveProperty('refreshToken');
    expect(created.headers['cache-control']).toBe('no-store');
    const initial = cookies(created.headers)[0]!;
    expect(initial).toContain('HttpOnly');
    expect(initial).toContain('Path=/api/auth');
    expect(initial).toContain('SameSite=Lax');
    const refreshed = await request(app.getHttpServer()).post('/api/auth/refresh')
      .set('X-Session-Request', '1').set('Cookie', initial.split(';')[0]!).send({}).expect(200);
    expect(refreshed.body).not.toHaveProperty('refreshToken');
    const next = cookies(refreshed.headers)[0]!;
    expect(next.split(';')[0]).not.toBe(initial.split(';')[0]);
    const loggedOut = await request(app.getHttpServer()).post('/api/auth/logout')
      .set('X-Session-Request', '1').set('Cookie', next.split(';')[0]!).send({}).expect(200);
    expect(cookies(loggedOut.headers)[0]).toContain('pcs.refreshToken=;');
    await request(app.getHttpServer()).post('/api/auth/refresh')
      .set('X-Session-Request', '1').set('Cookie', next.split(';')[0]!).send({}).expect(401);
  });

  it('rechaza CSRF y no admite refresh tokens por body', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(payload).expect(403);
    await request(app.getHttpServer()).post('/api/auth/register')
      .set('X-Session-Request', '1').set('Origin', 'https://evil.example.test').send(payload).expect(403);
    await request(app.getHttpServer()).post('/api/auth/refresh')
      .set('X-Session-Request', '1').send({ refreshToken: 'x'.repeat(64) }).expect(401);
    await request(app.getHttpServer()).post('/api/auth/logout')
      .set('X-Session-Request', '1').send({}).expect(200);
  });
});
