import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PasswordRecoveryService } from '../src/modules/auth/password-recovery.service.js';
import { RECOVERY_MAIL_PORT } from '../src/modules/auth/recovery-mail.port.js';
import type { RecoveryMail } from '../src/modules/auth/recovery-mail.port.js';
import { RecoveryHttpFilter } from '../src/modules/auth/recovery-http.filter.js';
import { REFRESH_COOKIE } from '../src/modules/auth/session-security.js';
import { PrismaService } from '../src/prisma/index.js';

import { assertOwnedLoopbackDatabase, createOwnedRecoveryMailHarness } from './password-recovery-mail-harness.js';
import type { RecoveryMailHarness } from './password-recovery-mail-harness.js';

const prisma = new PrismaClient();
const registeredId = 'be050000-0000-4000-8000-000000000001';
const registeredEmail = 'be05-recovery-account@example.test';
const absentEmail = 'be05-recovery-absent@example.test';

describe('recuperación HTTP en sandbox aislado', () => {
  let app: INestApplication<Parameters<typeof request>[0]>;
  let mail: RecoveryMailHarness;
  let auth: AuthService;
  let recovery: PasswordRecoveryService;
  let ownershipVerified = false;
  let oldPassword: string;
  let replacementPassword: string;
  const newFixturePassword = (): string => randomBytes(18).toString('base64url');

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('RECOVERY_HARNESS_DATABASE_MISSING');
    const expectedDatabase = process.env.BE05_EXPECTED_DATABASE;
    if (!expectedDatabase) throw new Error('RECOVERY_HARNESS_EXPECTED_DATABASE_MISSING');
    assertOwnedLoopbackDatabase(databaseUrl, expectedDatabase);
    const ownerMarkerFile = process.env.BE05_OWNER_MARKER_PATH;
    if (!ownerMarkerFile) throw new Error('RECOVERY_HARNESS_OWNER_MARKER_GUARD');
    mail = await createOwnedRecoveryMailHarness(prisma, {
      databaseUrl, expectedDatabase, markerPath: ownerMarkerFile,
      fixtures: [{ id: registeredId, email: registeredEmail }],
    });
    ownershipVerified = true;
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
    mail.bindVerifiedListener(server);
    if (process.env.BE05_RUNTIME_EVIDENCE_PATH) writeFileSync(process.env.BE05_RUNTIME_EVIDENCE_PATH, JSON.stringify({
      pid: process.pid, address: address.address, port: address.port, authorityVerified: true, started: true,
    }));
    auth = module.get(AuthService);
    recovery = module.get(PasswordRecoveryService);
  });

  beforeEach(async () => {
    mail.teardown();
    await idleJobs();
    await prisma.user.deleteMany({ where: { email: registeredEmail } });
    await prisma.recoveryRateLimitHit.deleteMany();
    oldPassword = newFixturePassword(); replacementPassword = newFixturePassword();
    // Cada respuesta sigue una entrada allowlisted sintética de este caso.
    await prisma.user.create({ data: {
      id: registeredId, email: registeredEmail, username: 'be05recoveryfixture', displayName: 'Fixture BE05',
      passwordHash: await argon2.hash(oldPassword),
    } });
  });

  afterAll(async () => {
    if (!ownershipVerified) { await prisma.$disconnect(); return; }
    mail?.teardown();
    await app?.close();
    const drain = recovery?.drainStatus();
    if (!drain || drain.pendingJobs !== 0 || drain.tickets !== 0 || drain.quarantined || drain.deadlineExceeded) {
      throw new Error('RECOVERY_HARNESS_DRAIN_NOT_COMPLETE');
    }
    if (mail.counts().messages || mail.counts().leases || mail.counts().waits || mail.counts().candidate || mail.counts().gate) {
      throw new Error('RECOVERY_HARNESS_MAIL_CLEANUP_FAILED');
    }
    await prisma.user.deleteMany({ where: { email: { in: [registeredEmail, absentEmail] } } });
    await prisma.recoveryRateLimitHit.deleteMany();
    const leftoverUsers = await prisma.user.count();
    if (leftoverUsers !== 0) throw new Error('RECOVERY_HARNESS_USER_CLEANUP_FAILED');
    const queries = await prisma.$queryRaw<Array<{ active: bigint; transactions: bigint }>>`SELECT
      count(*) FILTER (WHERE state = 'active' AND pid <> pg_backend_pid())::bigint AS active,
      count(*) FILTER (WHERE state = 'idle in transaction')::bigint AS transactions
      FROM pg_stat_activity WHERE datname = current_database()`;
    if (Number(queries[0]?.active) || Number(queries[0]?.transactions)) throw new Error('RECOVERY_HARNESS_SQL_NOT_QUIESCENT');
    const counts = { users: leftoverUsers, recoveryTokens: await prisma.passwordRecoveryToken.count(),
      refreshTokens: await prisma.refreshToken.count(), hits: await prisma.recoveryRateLimitHit.count() };
    await prisma.$disconnect();
    if (process.env.BE05_RUNTIME_EVIDENCE_PATH) writeFileSync(process.env.BE05_RUNTIME_EVIDENCE_PATH, JSON.stringify({
      pid: process.pid, stopped: true, serverListening: (app.getHttpServer() as unknown as Server).listening,
      drain, receiver: mail.counts(), queries: { active: Number(queries[0]?.active), transactions: Number(queries[0]?.transactions) }, counts,
    }));
  });

  const idleJobs = async (): Promise<void> => {
    const deadline = Date.now() + 4_000;
    const jobs = recovery as unknown as { pendingJobs: Set<Promise<void>> };
    while (jobs.pendingJobs.size && Date.now() < deadline) await delay(20);
    if (jobs.pendingJobs.size) throw new Error('RECOVERY_JOB_DRAIN_DEADLINE');
  };
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
    const oldSession = await auth.login({ email: registeredEmail, password: oldPassword });

    const badPassword = await consume(envelope.token, 'short');
    expect(badPassword.status).toBe(400);
    expect(badPassword.body.code).toBe('INPUT_INVALID');
    checkNoStore(badPassword.headers);
    const malformedToken = await request(app.getHttpServer()).post('/api/auth/password-recoveries')
      .set('X-Session-Request', '1').send({ newPassword: replacementPassword });
    expect(malformedToken.status).toBe(400);
    expect(malformedToken.body.code).toBe('RECOVERY_LINK_INVALID');

    const changed = await consume(envelope.token, replacementPassword);
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
    await expect(auth.login({ email: registeredEmail, password: oldPassword })).rejects.toThrow();
    const newSession = await auth.login({ email: registeredEmail, password: replacementPassword });
    await expect(auth.refresh({ refreshToken: oldSession.refreshToken })).rejects.toThrow();
    const newRefreshCount = await prisma.refreshToken.count({
      where: { tokenHash: hashToken(newSession.refreshToken), revokedAt: null },
    });
    expect(newRefreshCount).toBe(1);

    const replay = await consume(envelope.token, newFixturePassword());
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
    expect(await prisma.recoveryRateLimitHit.count({ where: { scope: 'identifier-hour' } })).toBe(1);
    expect(await prisma.recoveryRateLimitHit.count({ where: { scope: 'identifier-gap' } })).toBe(1);
    expect(await prisma.recoveryRateLimitHit.count({ where: { scope: 'ip' } })).toBe(5);
    expect(await prisma.recoveryRateLimitHit.count({ where: { scope: 'global' } })).toBe(5);
  });

  it('serializa consumos concurrentes de tokens distintos: uno solo confirma el reset', async () => {
    const tokens = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')];
    const current = await prisma.user.findUniqueOrThrow({ where: { email: registeredEmail }, select: { id: true, authVersion: true } });
    const expiresAt = new Date(Date.now() + 60_000);
    await prisma.passwordRecoveryToken.createMany({ data: tokens.map((token) => ({
      userId: current.id, tokenHash: hashToken(token), issuedAuthVersion: current.authVersion, expiresAt,
    })) });
    const results = await Promise.all(tokens.map((token) => consume(token, newFixturePassword())));
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
    const deliveryGate = mail.holdNextDelivery(true);
    const second = await requestRecovery(registeredEmail);
    expect(second.status).toBe(202);
    await deliveryGate.entered;
    const successfulReset = await consume(firstEnvelope.token, newFixturePassword());
    expect(successfulReset.status).toBe(200);
    deliveryGate.release();
    await mail.waitForSuppression();
    const lateToken = mail.takeCandidateToken();
    const suppressedRow = await prisma.passwordRecoveryToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(lateToken) }, select: { revokedAt: true },
    });
    expect(suppressedRow.revokedAt).not.toBeNull();
    const lateUse = await consume(lateToken, newFixturePassword());
    expect(lateUse.status).toBe(400);
    expect(lateUse.body.code).toBe('RECOVERY_LINK_INVALID');
    checkNoStore(lateUse.headers);
  }, 70_000);

  it.each(['reject', 'drop', 'never-resolve'] as const)('mantiene 202 genérico y cancela recursos del modo %s', async (mode) => {
    mail.mode(mode);
    const accepted = await requestRecovery(registeredEmail);
    expect(accepted.status).toBe(202);
    checkNoStore(accepted.headers);
    await idleJobs();
    expect(mail.counts()).toEqual({ messages: 0, leases: 0, waits: 0, candidate: false, gate: false });
    const stored = await prisma.passwordRecoveryToken.findMany({ where: { userId: registeredId }, select: { usedAt: true, revokedAt: true } });
    expect(stored.length === 1 && stored[0]?.usedAt === null && stored[0]?.revokedAt === null).toBe(true);
  });

  it('el lease vence retirando mensaje y timer; un gate abortado no conserva callbacks', async () => {
    mail.useReceiverLease(25);
    expect((await requestRecovery(registeredEmail)).status).toBe(202);
    await idleJobs();
    await delay(40);
    expect(mail.counts()).toEqual({ messages: 0, leases: 0, waits: 0, candidate: false, gate: false });
    // Receptor ejercitado en memoria sin emitir ni saltar cuotas de la API.
    const gate = mail.holdNextDelivery();
    const controller = new AbortController();
    const envelope: RecoveryMail = { recipient: registeredEmail, recipientUserId: registeredId,
      token: randomBytes(32).toString('base64url'), expiresAt: new Date(Date.now() + 60_000), caseGeneration: mail.caseGeneration };
    const pending = mail.deliver(envelope, controller.signal, async () => true);
    await gate.entered;
    controller.abort(); await pending; gate.release();
    expect(mail.counts()).toEqual({ messages: 0, leases: 0, waits: 0, candidate: false, gate: false });
  });

  it('rechaza JSON malformado también en consumo y deja cookie/token intactos', async () => {
    const malformed = await request(app.getHttpServer()).post('/api/auth/password-recoveries')
      .set('X-Session-Request', '1').set('Content-Type', 'application/json').send('{');
    expect(malformed.status).toBe(400); expect(malformed.body.code).toBe('INPUT_INVALID');
    expect(Object.keys(malformed.body.fields).every((key) => ['request', 'newPassword'].includes(key))).toBe(true);
    expect(malformed.headers['set-cookie'] === undefined).toBe(true); checkNoStore(malformed.headers);
    const invalidOrigin = await request(app.getHttpServer()).post('/api/auth/password-recoveries')
      .set('X-Session-Request', '1').set('Origin', 'https://evil.example.test')
      .send({ token: randomBytes(32).toString('base64url'), newPassword: newFixturePassword() });
    expect(invalidOrigin.status).toBe(403); expect(invalidOrigin.body.code).toBe('SESSION_REQUEST_FORBIDDEN'); checkNoStore(invalidOrigin.headers);
  });

  it('consume un enlace recibido aunque el transporte deje de estar disponible', async () => {
    expect((await requestRecovery(registeredEmail)).status).toBe(202);
    const envelope = await mail.take(registeredEmail); mail.unavailableForCase(true);
    try { expect((await consume(envelope.token, newFixturePassword())).status).toBe(200); }
    finally { mail.unavailableForCase(false); }
  });

  it('una solicitud en backend sin puerto falla antes del lookup para ambos emails', async () => {
    mail.unavailableForCase(true);
    const lookup = vi.spyOn(prisma.user, 'findUnique');
    try {
      const responses = await Promise.all([requestRecovery(registeredEmail), requestRecovery(absentEmail)]);
      expect(responses.map((response) => response.status)).toEqual([503, 503]);
      expect(JSON.stringify(responses[0]?.body) === JSON.stringify(responses[1]?.body)).toBe(true);
      for (const response of responses) { expect(response.body.code).toBe('RECOVERY_UNAVAILABLE'); checkNoStore(response.headers); }
      expect(lookup).not.toHaveBeenCalled();
    } finally { lookup.mockRestore(); mail.unavailableForCase(false); }
  });

  it('normaliza email antes de validar y no busca input que no sea string', async () => {
    expect((await requestRecovery(`  ${registeredEmail.toUpperCase()}  `)).status).toBe(202);
    await mail.take(registeredEmail);
    const lookup = vi.spyOn(prisma.user, 'findUnique');
    try {
      const invalid = await request(app.getHttpServer()).post('/api/auth/password-recovery-requests')
        .set('X-Session-Request', '1').send({ email: { arbitrary: true } });
      expect(invalid.status).toBe(400); expect(invalid.body.code).toBe('INPUT_INVALID');
      expect(Object.keys(invalid.body.fields)).toEqual(['email']); expect(lookup).not.toHaveBeenCalled();
    } finally { lookup.mockRestore(); }
  });

  it('rechaza formularios no JSON, conserva errores ajenos y GET no consume', async () => {
    for (const route of ['password-recovery-requests', 'password-recoveries']) {
      const nonJson = await request(app.getHttpServer()).post('/api/auth/' + route)
        .set('X-Session-Request', '1').type('form').send({ email: registeredEmail, newPassword: newFixturePassword() });
      expect(nonJson.status).toBe(400); expect(nonJson.body.code).toBe('INPUT_INVALID');
      expect(Object.keys(nonJson.body.fields)).toEqual(['request']); checkNoStore(nonJson.headers);
    }
    const alias = await request(app.getHttpServer()).post('/api/auth/password-recoveries/')
      .set('X-Session-Request', '1').send({});
    expect(alias.status).toBe(400); expect(alias.body.code).toBe('RECOVERY_LINK_INVALID'); checkNoStore(alias.headers);
    for (const route of ['password-recovery-requests/', 'password-recoveries/']) {
      const validBody = route.startsWith('password-recovery-requests') ? { email: registeredEmail } :
        { token: randomBytes(32).toString('base64url'), newPassword: newFixturePassword() };
      const forbidden = await request(app.getHttpServer()).post('/api/auth/' + route).send(validBody);
      expect(forbidden.status).toBe(403); expect(forbidden.body.code).toBe('SESSION_REQUEST_FORBIDDEN'); checkNoStore(forbidden.headers);
      const malformed = await request(app.getHttpServer()).post('/api/auth/' + route)
        .set('X-Session-Request', '1').set('Content-Type', 'application/json').send('{');
      expect(malformed.status).toBe(400); expect(malformed.body.code).toBe('INPUT_INVALID'); checkNoStore(malformed.headers);
    }
    const nonRecovery = await request(app.getHttpServer()).get('/api/unrelated');
    expect(nonRecovery.status).toBe(404); expect(nonRecovery.body.error).toBe('Not Found');
    expect(nonRecovery.body.code === undefined).toBe(true);
    const get = await request(app.getHttpServer()).get('/api/auth/password-recoveries');
    expect(get.status).toBe(404); checkNoStore(get.headers);
    expect(await prisma.passwordRecoveryToken.count({ where: { userId: registeredId, usedAt: { not: null } } })).toBe(0);
  });

  it('el error posterior al handoff conserva el enlace ya recibido', async () => {
    mail.mode('reject-after-handoff');
    const response = await requestRecovery(registeredEmail);
    expect(response.status).toBe(202);
    const received = await mail.take(registeredEmail);
    await idleJobs();
    const consumed = await consume(received.token, newFixturePassword());
    expect(consumed.status).toBe(200); expect(consumed.body.success).toBe(true);
  });

  it('la factory refutada no muta ni habilita un receptor y exige listener antes del secreto', async () => {
    const before = await prisma.user.count();
    const mutation = vi.spyOn(prisma.user, 'deleteMany');
    try {
      let rejected = false;
      try {
        await createOwnedRecoveryMailHarness(prisma, { databaseUrl: process.env.DATABASE_URL!,
          expectedDatabase: 'pokemon_cards_test', markerPath: process.env.BE05_OWNER_MARKER_PATH!,
          fixtures: [{ id: registeredId, email: registeredEmail }] });
      } catch { rejected = true; }
      expect(rejected).toBe(true); expect(mutation).not.toHaveBeenCalled();
      expect(await prisma.user.count()).toBe(before);
    } finally { mutation.mockRestore(); }
    await prisma.user.delete({ where: { id: registeredId } });
    const inert = await createOwnedRecoveryMailHarness(prisma, { databaseUrl: process.env.DATABASE_URL!,
      expectedDatabase: process.env.BE05_EXPECTED_DATABASE!, markerPath: process.env.BE05_OWNER_MARKER_PATH!,
      fixtures: [{ id: registeredId, email: registeredEmail }] });
    let reads = 0;
    await inert.deliver({ recipient: registeredEmail, recipientUserId: registeredId,
      get token() { reads += 1; return ''; }, expiresAt: new Date(), caseGeneration: inert.caseGeneration },
    new AbortController().signal, async () => true);
    expect(reads).toBe(0); expect(inert.available).toBe(false);
    expect(() => inert.bindVerifiedListener(createServer())).toThrow('RECOVERY_HARNESS_LOOPBACK_LISTENER_GUARD');
    inert.teardown();
  });

  const prepareTokens = async (count: number, expiresAt = new Date(Date.now() + 60_000)): Promise<string[]> => {
    const tokens = Array.from({ length: count }, () => randomBytes(32).toString('base64url'));
    const current = await prisma.user.findUniqueOrThrow({ where: { id: registeredId }, select: { authVersion: true } });
    await prisma.passwordRecoveryToken.createMany({ data: tokens.map((token) => ({ userId: registeredId,
      tokenHash: hashToken(token), issuedAuthVersion: current.authVersion, expiresAt })) });
    return tokens;
  };
  const heldUser = async () => {
    let entered!: () => void; let release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const done = prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${registeredId} FOR UPDATE`);
      entered(); await hold;
    }, { timeout: 4_000 });
    await enteredPromise; return { done, release };
  };
  const waitForUserLock = async (expected = 1): Promise<void> => {
    const deadline = Date.now() + 1_500;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<Array<{ waiting: bigint }>>`SELECT count(*)::bigint AS waiting
        FROM (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND query LIKE '%FOR UPDATE%') AS waiting_rows`;
      if (Number(rows[0]?.waiting) >= expected) return;
      await delay(15);
    }
    throw new Error('RECOVERY_LOCK_BARRIER_NOT_REACHED');
  };

  it('mismo token concurrente confirma una sola vez', async () => {
    const [token] = await prepareTokens(1);
    const results = await Promise.all([consume(token!, newFixturePassword()), consume(token!, newFixturePassword())]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(await prisma.user.findUnique({ where: { id: registeredId }, select: { authVersion: true } }).then((user) => user?.authVersion)).toBe(1);
  });

  it('vencimiento de recuperación y refresh se reevalúan después del lock real PG', async () => {
    const session = await auth.login({ email: registeredEmail, password: oldPassword });
    const [token] = await prepareTokens(1, new Date(Date.now() + 250));
    await prisma.refreshToken.update({ where: { tokenHash: hashToken(session.refreshToken) }, data: { expiresAt: new Date(Date.now() + 250) } });
    const held = await heldUser();
    const recoveryResult = consume(token!, newFixturePassword()).then((response) => response.status);
    const refreshResult = auth.refresh({ refreshToken: session.refreshToken }).then(() => false, () => true);
    try { await waitForUserLock(); await delay(350); } finally { held.release(); await held.done; }
    expect(await recoveryResult).toBe(400); expect(await refreshResult).toBe(true);
    expect(await prisma.user.findUnique({ where: { id: registeredId }, select: { authVersion: true } }).then((user) => user?.authVersion)).toBe(0);
  });

  it('un fallo luego de actualizar User revierte hash/versión/uso/refresh y no borra cookie', async () => {
    const [token] = await prepareTokens(1);
    const session = await auth.login({ email: registeredEmail, password: oldPassword });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: registeredId }, select: { passwordHash: true, authVersion: true } });
    await prisma.$executeRawUnsafe(`CREATE FUNCTION be05_review_reject_use() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."usedAt" IS NOT NULL THEN RAISE EXCEPTION 'BE05_CONTROLLED_ROLLBACK'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER be05_review_reject_use BEFORE UPDATE ON password_recovery_tokens FOR EACH ROW EXECUTE FUNCTION be05_review_reject_use()');
    let response;
    try { response = await consume(token!, newFixturePassword()); }
    finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER be05_review_reject_use ON password_recovery_tokens');
      await prisma.$executeRawUnsafe('DROP FUNCTION be05_review_reject_use()');
    }
    expect(response?.status).toBe(503); expect(response?.body.code).toBe('RECOVERY_UNAVAILABLE');
    expect(response?.headers['set-cookie'] === undefined).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: registeredId }, select: { passwordHash: true, authVersion: true } });
    expect(before.passwordHash === after.passwordHash && before.authVersion === after.authVersion).toBe(true);
    expect(await prisma.passwordRecoveryToken.count({ where: { userId: registeredId, usedAt: null, revokedAt: null } })).toBe(1);
    expect(await prisma.refreshToken.count({ where: { tokenHash: hashToken(session.refreshToken), revokedAt: null } })).toBe(1);
  });

  it('login/refresh/emisión que observaron versión vieja no sobreviven a un reset real en vuelo', async () => {
    const [token] = await prepareTokens(1);
    const oldSession = await auth.login({ email: registeredEmail, password: oldPassword });
    type TxAction = <T>(action: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number }) => Promise<T>;
    const client = prisma as unknown as { $transaction: TxAction };
    const original = client.$transaction.bind(prisma);
    let entered!: () => void; let release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const wrapped: TxAction = async (action, options) => original(async (tx) => {
      const delegate = tx.user as unknown as { update(args: Prisma.UserUpdateArgs): Promise<{ id: string }> };
      const update = delegate.update.bind(tx.user);
      const paused = vi.spyOn(delegate, 'update').mockImplementation(async (args) => {
        const value = await update(args);
        if (typeof args.data.passwordHash === 'string') { entered(); await hold; }
        return value;
      });
      try { return await action(tx); } finally { paused.mockRestore(); }
    }, options);
    const spy = vi.spyOn(client, '$transaction').mockImplementation(wrapped);
    const resetPassword = newFixturePassword();
    const reset = consume(token!, resetPassword);
    try {
      // Supertest inicia sólo al consumir el thenable; la promesa ya está en vuelo.
      const resetting = reset.then((response) => response);
      await enteredPromise;
      const login = auth.login({ email: registeredEmail, password: oldPassword }).then(() => false, () => true);
      const refresh = auth.refresh({ refreshToken: oldSession.refreshToken }).then(() => false, () => true);
      expect((await requestRecovery(registeredEmail)).status).toBe(202);
      await waitForUserLock(3);
      release(); expect((await resetting).status).toBe(200);
      expect(await login).toBe(true); expect(await refresh).toBe(true);
      await idleJobs();
      expect(mail.counts().messages).toBe(0);
      expect(await prisma.passwordRecoveryToken.count({ where: { userId: registeredId, usedAt: null, revokedAt: null } })).toBe(0);
      const current = await auth.login({ email: registeredEmail, password: resetPassword });
      expect(await prisma.refreshToken.count({ where: { tokenHash: hashToken(current.refreshToken), revokedAt: null } })).toBe(1);
    } finally { release(); spy.mockRestore(); }
  });

  it('un lock PG detenido termina SQL de emisión, no deja token ni se acredita timeout como cancelación', async () => {
    const held = await heldUser();
    try {
      expect((await requestRecovery(registeredEmail)).status).toBe(202);
      await waitForUserLock(); await idleJobs();
      const rows = await prisma.$queryRaw<Array<{ waiting: bigint }>>`SELECT count(*)::bigint AS waiting
        FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'`;
      expect(Number(rows[0]?.waiting)).toBe(0);
      expect(await prisma.passwordRecoveryToken.count({ where: { userId: registeredId } })).toBe(0);
      expect(recovery.drainStatus().pendingJobs).toBe(0);
    } finally { held.release(); await held.done; }
  });

  it('shutdown aborta trabajo de mail y observa drain sin referencias pendientes', async () => {
    // Servicio separado del módulo, con la misma DB/factory acreditadas.
    const service = new PasswordRecoveryService(prisma as unknown as PrismaService, app.get(ConfigService), mail);
    mail.mode('never-resolve');
    await service.request(registeredEmail, 'fixture-shutdown-ip');
    const deadline = Date.now() + 1_000;
    while (mail.counts().waits === 0 && Date.now() < deadline) await delay(10);
    expect(mail.counts().waits > 0).toBe(true);
    await service.onModuleDestroy();
    expect(service.drainStatus()).toEqual({ pendingJobs: 0, tickets: 0, quarantined: false, deadlineExceeded: false });
    expect(mail.counts()).toEqual({ messages: 0, leases: 0, waits: 0, candidate: false, gate: false });
  });

  it('el cap3 no desaloja enlaces ni el rechazo global quema identidad/IP', async () => {
    await prepareTokens(3);
    expect((await requestRecovery(registeredEmail)).status).toBe(202); await idleJobs();
    expect(await prisma.passwordRecoveryToken.count({ where: { userId: registeredId, usedAt: null, revokedAt: null } })).toBe(3);
    const before = await prisma.recoveryRateLimitHit.count();
    await prisma.recoveryRateLimitHit.createMany({ data: Array.from({ length: 1_000 }, () => ({ scope: 'global', keyHash: 'all' })) });
    const denied = await requestRecovery(absentEmail);
    expect(denied.status).toBe(429); expect(Number(denied.headers['retry-after']) > 0).toBe(true); checkNoStore(denied.headers);
    expect(await prisma.recoveryRateLimitHit.count()).toBe(before + 1_000);
  });

  it('refuta URL no loopback antes de crear un adaptador habilitado', () => {
    expect(() => assertOwnedLoopbackDatabase('postgresql://pokemon:password@remote.example.test/db', 'db')).toThrow('RECOVERY_HARNESS_DATABASE_GUARD');
    expect(() => assertOwnedLoopbackDatabase('postgresql://pokemon:password@localhost:55432/pokemon_cards_test', 'pokemon_cards_be05_test_20261009a')).toThrow('RECOVERY_HARNESS_DATABASE_GUARD');
    expect(() => assertOwnedLoopbackDatabase('postgresql://other:password@localhost:55432/pokemon_cards_be05_test_20261009a', 'pokemon_cards_be05_test_20261009a')).toThrow('RECOVERY_HARNESS_DATABASE_GUARD');
  });
});
