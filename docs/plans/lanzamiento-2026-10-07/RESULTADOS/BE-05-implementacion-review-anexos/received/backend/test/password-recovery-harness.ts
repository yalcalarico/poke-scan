import { createHash, randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PasswordRecoveryService } from '../src/modules/auth/password-recovery.service.js';
import { RECOVERY_MAIL_PORT } from '../src/modules/auth/recovery-mail.port.js';
import type { RecoveryMail, RecoveryMailPort } from '../src/modules/auth/recovery-mail.port.js';
import { RecoveryHttpFilter } from '../src/modules/auth/recovery-http.filter.js';
import { REFRESH_COOKIE } from '../src/modules/auth/session-security.js';
import { PrismaService } from '../src/prisma/index.js';

const prisma = new PrismaClient();
const registeredId = 'be050000-0000-4000-8000-000000000001';
const registeredEmail = 'be05-recovery-account@example.test';
const absentEmail = 'be05-recovery-absent@example.test';

function assertOwnedLoopbackDatabase(rawUrl: string, expectedDatabase: string): void {
  const url = new URL(rawUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.port !== '55432' ||
      url.username !== 'pokemon' || url.pathname.slice(1) !== expectedDatabase ||
      !/^pokemon_cards_be05_test_[a-z0-9]+$/i.test(expectedDatabase)) {
    throw new Error('RECOVERY_HARNESS_DATABASE_GUARD');
  }
}

class HarnessMail implements RecoveryMailPort {
  readonly available = true;
  private generation = 1;
  private readonly messages = new Map<string, RecoveryMail>();
  private readonly leases = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly waiters = new Map<string, Set<{ finish(mail: RecoveryMail): void; fail(): void }>>();
  private suppressionWaiters: Array<() => void> = [];
  private suppressed = 0;
  private candidateToken: string | null = null;
  private candidateLease: ReturnType<typeof setTimeout> | null = null;
  private nextDelayMs = 0;
  private nextGate: { entered(): void; wait: Promise<void> } | null = null;

  get caseGeneration(): number { return this.generation; }
  allowDelay(milliseconds: number): void { this.nextDelayMs = milliseconds; }
  holdNextDelivery(): { entered: Promise<void>; release(): void } {
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const wait = new Promise<void>((resolve) => { release = resolve; });
    this.nextGate = { entered, wait };
    return { entered: enteredPromise, release };
  }
  waitForSuppression(): Promise<void> {
    if (this.suppressed > 0) return Promise.resolve();
    return new Promise((resolve) => this.suppressionWaiters.push(resolve));
  }
  takeCandidateToken(): string {
    const candidate = this.candidateToken;
    if (this.candidateLease) clearTimeout(this.candidateLease);
    this.candidateLease = null;
    this.candidateToken = null;
    if (!candidate) throw new Error('RECOVERY_HARNESS_NO_CANDIDATE');
    return candidate;
  }

  async deliver(mail: RecoveryMail, signal: AbortSignal, authorizeHandoff: () => Promise<boolean>): Promise<void> {
    if (![registeredEmail, absentEmail].includes(mail.recipient) || signal.aborted ||
        mail.caseGeneration !== this.generation || this.messages.size >= 32) return;
    const workDelay = this.nextDelayMs;
    this.nextDelayMs = 0;
    if (workDelay > 0) {
      if (!await this.wait(workDelay, signal)) return;
    }
    const gate = this.nextGate;
    this.nextGate = null;
    if (gate) {
      gate.entered();
      if (!await this.waitForGate(gate.wait, signal)) return;
    }
    this.candidateToken = mail.token;
    if (this.candidateLease) clearTimeout(this.candidateLease);
    this.candidateLease = setTimeout(() => { this.candidateToken = null; this.candidateLease = null; }, 120_000);
    if (!await authorizeHandoff()) {
      this.suppressed += 1;
      for (const resolve of this.suppressionWaiters) resolve();
      this.suppressionWaiters = [];
      return;
    }
    if (signal.aborted || mail.caseGeneration !== this.generation || ![registeredEmail].includes(mail.recipient)) return;
    this.messages.set(mail.recipient, mail);
    this.leases.set(mail.recipient, setTimeout(() => this.messages.delete(mail.recipient), 120_000));
    for (const waiter of this.waiters.get(mail.recipient) ?? []) waiter.finish(mail);
    this.waiters.delete(mail.recipient);
  }

  async take(recipient: string): Promise<RecoveryMail> {
    const existing = this.messages.get(recipient);
    if (existing) { this.discard(recipient); return existing; }
    return new Promise<RecoveryMail>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>;
      const waiter = {
        finish: (mail: RecoveryMail): void => { clearTimeout(timeout); this.waiters.get(recipient)?.delete(waiter); this.discard(recipient); resolve(mail); },
        fail: (): void => { clearTimeout(timeout); this.waiters.get(recipient)?.delete(waiter); reject(new Error('RECOVERY_MAIL_DEADLINE')); },
      };
      timeout = setTimeout(waiter.fail, 1_700);
      const current = this.waiters.get(recipient) ?? new Set();
      current.add(waiter);
      this.waiters.set(recipient, current);
    });
  }

  teardown(): void {
    this.generation += 1;
    for (const timer of this.leases.values()) clearTimeout(timer);
    this.leases.clear();
    this.messages.clear();
    for (const waiters of this.waiters.values()) for (const waiter of waiters) waiter.fail();
    this.waiters.clear();
    this.nextDelayMs = 0;
    this.nextGate = null;
    if (this.candidateLease) clearTimeout(this.candidateLease);
    this.candidateLease = null;
    this.suppressed = 0;
    this.candidateToken = null;
    for (const resolve of this.suppressionWaiters) resolve();
    this.suppressionWaiters = [];
  }

  private discard(recipient: string): void {
    this.messages.delete(recipient);
    const timer = this.leases.get(recipient);
    if (timer) clearTimeout(timer);
    this.leases.delete(recipient);
  }

  private async wait(milliseconds: number, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
      const finish = (complete: boolean): void => {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancelled);
        resolve(complete);
      };
      const cancelled = (): void => finish(false);
      const timer = setTimeout(() => finish(true), milliseconds);
      signal.addEventListener('abort', cancelled, { once: true });
      if (signal.aborted) cancelled();
    });
  }

  private async waitForGate(gate: Promise<void>, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return false;
    return new Promise((resolve) => {
      const cancelled = (): void => { signal.removeEventListener('abort', cancelled); resolve(false); };
      signal.addEventListener('abort', cancelled, { once: true });
      void gate.then(() => {
        signal.removeEventListener('abort', cancelled);
        resolve(!signal.aborted);
      });
    });
  }
}

describe('recuperación HTTP en sandbox aislado', () => {
  let app: INestApplication<Parameters<typeof request>[0]>;
  let mail: HarnessMail;
  let ownerMarker: string;
  let auth: AuthService;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('RECOVERY_HARNESS_DATABASE_MISSING');
    const expectedDatabase = process.env.BE05_EXPECTED_DATABASE;
    if (!expectedDatabase) throw new Error('RECOVERY_HARNESS_EXPECTED_DATABASE_MISSING');
    assertOwnedLoopbackDatabase(databaseUrl, expectedDatabase);
    const ownerMarkerFile = process.env.BE05_OWNER_MARKER_PATH;
    if (!ownerMarkerFile) throw new Error('RECOVERY_HARNESS_OWNER_MARKER_GUARD');
    ownerMarker = readFileSync(ownerMarkerFile, 'utf8').trim();
    const markerRows = await prisma.$queryRaw<Array<{ count: bigint; total: bigint }>>`SELECT
      count(*) FILTER (WHERE marker = ${ownerMarker})::bigint AS count,
      count(*)::bigint AS total FROM be05_harness_owner`;
    const databaseIdentity = await prisma.$queryRaw<Array<{ database: string; role: string }>>`SELECT
      current_database() AS database, current_user AS role`;
    const userCount = await prisma.user.count();
    if (Number(markerRows[0]!.count) !== 1 || Number(markerRows[0]!.total) !== 1 || userCount !== 0 ||
        databaseIdentity[0]!.database !== expectedDatabase || databaseIdentity[0]!.role !== 'pokemon') {
      throw new Error('RECOVERY_HARNESS_OWNERSHIP_GUARD');
    }

    mail = new HarnessMail();
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), JwtModule.register({
        secret: 'be05-isolated-harness-test-secret', signOptions: { expiresIn: '15m' },
      })],
      controllers: [AuthController],
      providers: [AuthService, PasswordRecoveryService,
        { provide: RECOVERY_MAIL_PORT, useValue: mail },
        { provide: PrismaService, useValue: prisma }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new RecoveryHttpFilter(app.get(HttpAdapterHost)));
    await app.init();
    const server = app.getHttpServer() as unknown as Server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
    const address = server.address();
    if (!address || typeof address === 'string' || address.address !== '127.0.0.1' || address.port <= 0) {
      throw new Error('RECOVERY_HARNESS_LOOPBACK_LISTENER_GUARD');
    }
    auth = module.get(AuthService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: registeredEmail } });
    await prisma.recoveryRateLimitHit.deleteMany();
    mail.teardown();
    // Cada respuesta sigue una entrada allowlisted sintética de este caso.
    await prisma.user.create({ data: {
      id: registeredId, email: registeredEmail, username: 'be05recoveryfixture', displayName: 'Fixture BE05',
      passwordHash: await argon2.hash('FixtureOldPassword123'),
    } });
  });

  afterAll(async () => {
    mail?.teardown();
    await app?.close();
    await prisma.user.deleteMany({ where: { email: { in: [registeredEmail, absentEmail] } } });
    await prisma.recoveryRateLimitHit.deleteMany();
    const leftoverUsers = await prisma.user.count();
    if (leftoverUsers !== 0) throw new Error('RECOVERY_HARNESS_USER_CLEANUP_FAILED');
    await prisma.$disconnect();
  });

  const requestRecovery = (email: string) => request(app.getHttpServer()).post('/api/auth/password-recovery-requests')
    .set('X-Session-Request', '1').send({ email });
  const consume = (token: string, newPassword: string) => request(app.getHttpServer()).post('/api/auth/password-recoveries')
    .set('X-Session-Request', '1').send({ token, newPassword });
  const checkNoStore = (headers: Record<string, unknown>): void => {
    expect(headers['cache-control']).toContain('no-store');
    expect(headers.pragma).toBe('no-cache');
    expect(headers.expires).toBe('0');
  };
  const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

  it('responde igual para cuenta presente/ausente y guarda sólo SHA-256 del token', async () => {
    const present = await requestRecovery(registeredEmail);
    const absent = await requestRecovery(absentEmail);
    expect(present.status).toBe(202);
    expect(absent.status).toBe(202);
    expect(present.body).toEqual(absent.body);
    expect(JSON.stringify(present.body)).not.toContain(registeredEmail);
    checkNoStore(present.headers);
    checkNoStore(absent.headers);
    const envelope = await mail.take(registeredEmail);
    const stored = await prisma.passwordRecoveryToken.findMany({ where: { user: { email: registeredEmail } }, select: { tokenHash: true } });
    const onlyDigest = stored.length === 1 && /^[a-f0-9]{64}$/.test(stored[0]!.tokenHash) && stored[0]!.tokenHash === hashToken(envelope.token);
    expect(onlyDigest).toBe(true);
    expect(/^[A-Za-z0-9_-]{43}$/.test(envelope.token)).toBe(true);
  });

  it('valida errores sin consumir, luego cambia clave, revoca sesiones y limpia cookie tras commit', async () => {
    const accepted = await requestRecovery(registeredEmail);
    expect(accepted.status).toBe(202);
    const envelope = await mail.take(registeredEmail);
    const before = await prisma.user.findUniqueOrThrow({ where: { email: registeredEmail }, select: { authVersion: true } });
    const oldSession = await auth.login({ email: registeredEmail, password: 'FixtureOldPassword123' });

    const badPassword = await consume(envelope.token, 'short');
    expect(badPassword.status).toBe(400);
    expect(badPassword.body.code).toBe('INPUT_INVALID');
    checkNoStore(badPassword.headers);
    const malformedToken = await request(app.getHttpServer()).post('/api/auth/password-recoveries')
      .set('X-Session-Request', '1').send({ newPassword: 'FixtureNewPassword123' });
    expect(malformedToken.status).toBe(400);
    expect(malformedToken.body.code).toBe('RECOVERY_LINK_INVALID');

    const changed = await consume(envelope.token, 'FixtureNewPassword123');
    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({ success: true });
    checkNoStore(changed.headers);
    expect(String(changed.headers['set-cookie']?.[0] ?? '')).toContain(`${REFRESH_COOKIE}=;`);
    const after = await prisma.user.findUniqueOrThrow({ where: { email: registeredEmail }, select: { authVersion: true } });
    const refreshCount = await prisma.refreshToken.count({ where: { user: { email: registeredEmail }, revokedAt: null } });
    const recovery = await prisma.passwordRecoveryToken.findFirstOrThrow({ where: { user: { email: registeredEmail } } });
    expect(after.authVersion - before.authVersion).toBe(1);
    expect(refreshCount).toBe(0);
    expect(recovery.usedAt).not.toBeNull();
    await expect(auth.login({ email: registeredEmail, password: 'FixtureOldPassword123' })).rejects.toThrow();
    const newSession = await auth.login({ email: registeredEmail, password: 'FixtureNewPassword123' });
    await expect(auth.refresh({ refreshToken: oldSession.refreshToken })).rejects.toThrow();
    const newRefreshCount = await prisma.refreshToken.count({
      where: { tokenHash: hashToken(newSession.refreshToken), revokedAt: null },
    });
    expect(newRefreshCount).toBe(1);

    const replay = await consume(envelope.token, 'FixtureAnotherPassword123');
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('RECOVERY_LINK_INVALID');
    checkNoStore(replay.headers);
  });

  it('el guard de sesión y los DTOs responden sin caché y sin valores recibidos', async () => {
    const forbidden = await request(app.getHttpServer()).post('/api/auth/password-recovery-requests').send({ email: registeredEmail });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('SESSION_REQUEST_FORBIDDEN');
    checkNoStore(forbidden.headers);
    const invalid = await request(app.getHttpServer()).post('/api/auth/password-recovery-requests')
      .set('X-Session-Request', '1').send({ email: 'no-es-email' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INPUT_INVALID');
    expect(invalid.body.fields).toMatchObject({ email: expect.any(String) });
    expect(JSON.stringify(invalid.body)).not.toContain('no-es-email');
    checkNoStore(invalid.headers);
    const malformed = await request(app.getHttpServer()).post('/api/auth/password-recovery-requests')
      .set('X-Session-Request', '1').set('Content-Type', 'application/json').send('{"email":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe('INPUT_INVALID');
    checkNoStore(malformed.headers);
  });

  it('alcanza el límite compartido por IP con Retry-After positivo sin buscar identidad', async () => {
    await prisma.recoveryRateLimitHit.deleteMany();
    for (let index = 0; index < 5; index += 1) {
      const response = await requestRecovery(registeredEmail);
      expect(response.status).toBe(202);
      checkNoStore(response.headers);
    }
    const limited = await requestRecovery(registeredEmail);
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RECOVERY_RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    checkNoStore(limited.headers);
  });

  it('serializa consumos concurrentes de tokens distintos: uno solo confirma el reset', async () => {
    const tokens = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')];
    const current = await prisma.user.findUniqueOrThrow({ where: { email: registeredEmail }, select: { id: true, authVersion: true } });
    const expiresAt = new Date(Date.now() + 60_000);
    await prisma.passwordRecoveryToken.createMany({ data: tokens.map((token) => ({
      userId: current.id, tokenHash: hashToken(token), issuedAuthVersion: current.authVersion, expiresAt,
    })) });
    const results = await Promise.all(tokens.map((token, index) => consume(token, `FixtureConcurrentPassword${index}X`)));
    expect(results.map((result) => result.status).sort((left, right) => left - right)).toEqual([200, 400]);
    expect(results.filter((result) => result.body.success === true)).toHaveLength(1);
    expect(results.filter((result) => result.body.code === 'RECOVERY_LINK_INVALID')).toHaveLength(1);
    const after = await prisma.user.findUniqueOrThrow({ where: { email: registeredEmail }, select: { authVersion: true } });
    expect(after.authVersion).toBe(current.authVersion + 1);
  });

  it('una entrega demorada después del reset sigue la misma generación y el consumo consulta Postgres', async () => {
    const first = await requestRecovery(registeredEmail);
    expect(first.status).toBe(202);
    const firstEnvelope = await mail.take(registeredEmail);

    const started = Date.now();
    while (Date.now() - started < 60_100) await delay(250);
    const deliveryGate = mail.holdNextDelivery();
    const second = await requestRecovery(registeredEmail);
    expect(second.status).toBe(202);
    await deliveryGate.entered;
    const successfulReset = await consume(firstEnvelope.token, 'FixtureResetAfterDelay123');
    expect(successfulReset.status).toBe(200);
    deliveryGate.release();
    await mail.waitForSuppression();
    const lateToken = mail.takeCandidateToken();
    const suppressedRow = await prisma.passwordRecoveryToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(lateToken) }, select: { revokedAt: true },
    });
    expect(suppressedRow.revokedAt).not.toBeNull();
    const lateUse = await consume(lateToken, 'FixtureLateTokenPassword123');
    expect(lateUse.status).toBe(400);
    expect(lateUse.body.code).toBe('RECOVERY_LINK_INVALID');
    checkNoStore(lateUse.headers);
  }, 70_000);

  it('refuta URL no loopback antes de crear un adaptador habilitado', () => {
    expect(() => assertOwnedLoopbackDatabase('postgresql://pokemon:password@remote.example.test/db', 'db')).toThrow('RECOVERY_HARNESS_DATABASE_GUARD');
    expect(() => assertOwnedLoopbackDatabase('postgresql://pokemon:password@localhost:55432/pokemon_cards_test', 'pokemon_cards_be05_test_20261009a')).toThrow('RECOVERY_HARNESS_DATABASE_GUARD');
    expect(() => assertOwnedLoopbackDatabase('postgresql://other:password@localhost:55432/pokemon_cards_be05_test_20261009a', 'pokemon_cards_be05_test_20261009a')).toThrow('RECOVERY_HARNESS_DATABASE_GUARD');
  });
});
