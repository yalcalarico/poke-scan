import { createHmac, createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Inject, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/index.js';
import { RecoveryException, RECOVERY_CODES } from './recovery-errors.js';
import { RECOVERY_MAIL_PORT } from './recovery-mail.port.js';
import type { RecoveryMail, RecoveryMailPort } from './recovery-mail.port.js';

const GENERIC_REQUEST = {
  message: 'Recibimos tu pedido. Si corresponde y el envío puede completarse, vas a recibir instrucciones para recuperar el acceso.',
} as const;
const TOKEN_TTL_MS = 30 * 60_000;
const TICKET_TTL_MS = 2_000;
const MAX_TICKETS = 32;
const GLOBAL_PER_MINUTE = 1_000;

@Injectable()
export class PasswordRecoveryService implements OnModuleDestroy {
  private readonly tickets = new Map<object, { controller: AbortController; timer: NodeJS.Timeout }>();
  private readonly pendingJobs = new Set<Promise<void>>();
  private shuttingDown = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(RECOVERY_MAIL_PORT) private readonly mail: RecoveryMailPort,
  ) {}

  async request(emailInput: string, ipInput: string): Promise<typeof GENERIC_REQUEST> {
    if (!this.mail.available || this.shuttingDown) throw this.unavailable();
    const email = emailInput.trim().toLowerCase();
    const ip = ipInput || 'unknown';
    const budget = await this.admit(ip, 'request', email);
    if (budget.ipRetry || budget.globalRetry) throw this.rateLimited(Math.max(budget.ipRetry, budget.globalRetry));
    if (budget.identifierDenied || this.tickets.size >= MAX_TICKETS) return GENERIC_REQUEST;

    const ticket = {};
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      this.tickets.delete(ticket);
    }, TICKET_TTL_MS);
    this.tickets.set(ticket, { controller, timer });
    const generation = this.mail.caseGeneration;
    let task: Promise<void>;
    task = this.issueAndDeliver(email, ticket, generation, controller)
      .catch(() => undefined)
      .finally(() => this.pendingJobs.delete(task));
    this.pendingJobs.add(task);
    return GENERIC_REQUEST;
  }

  async recover(token: string, newPassword: string, ipInput: string): Promise<{ success: true }> {
    if (!this.mail.available) throw this.unavailable();
    const budget = await this.admit(ipInput || 'unknown', 'consume');
    if (budget.ipRetry || budget.globalRetry) throw this.rateLimited(Math.max(budget.ipRetry, budget.globalRetry));
    let passwordHash: string;
    try { passwordHash = await argon2.hash(newPassword); } catch { throw this.unavailable(); }
    const tokenHash = this.hashToken(token);
    let owner: { userId: string } | null;
    try {
      owner = await this.prisma.passwordRecoveryToken.findUnique({ where: { tokenHash }, select: { userId: true } });
    } catch { throw this.unavailable(); }
    if (!owner) throw this.linkInvalid();

    let changed: boolean;
    try { changed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${owner.userId} FOR UPDATE`);
      const currentUser = await tx.user.findUnique({ where: { id: owner.userId }, select: { id: true, authVersion: true } });
      const stored = await tx.passwordRecoveryToken.findUnique({ where: { tokenHash } });
      const clock = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`);
      if (!currentUser || !stored || stored.userId !== currentUser.id || stored.usedAt || stored.revokedAt ||
          stored.issuedAuthVersion !== currentUser.authVersion || stored.expiresAt <= clock[0]!.now) return false;
      await tx.user.update({ where: { id: currentUser.id }, data: { passwordHash, authVersion: { increment: 1 } } });
      await tx.passwordRecoveryToken.update({ where: { id: stored.id }, data: { usedAt: clock[0]!.now } });
      await tx.passwordRecoveryToken.updateMany({
        where: { userId: currentUser.id, id: { not: stored.id }, usedAt: null, revokedAt: null },
        data: { revokedAt: clock[0]!.now },
      });
      await tx.refreshToken.updateMany({
        where: { userId: currentUser.id, revokedAt: null }, data: { revokedAt: clock[0]!.now },
      });
      return true;
    }); } catch { throw this.unavailable(); }
    if (!changed) throw this.linkInvalid();
    return { success: true };
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    for (const [ticket, pending] of this.tickets) {
      clearTimeout(pending.timer);
      pending.controller.abort();
      this.tickets.delete(ticket);
    }
    await Promise.allSettled(this.pendingJobs);
  }

  private async issueAndDeliver(
    email: string, ticket: object, generation: number, controller: AbortController,
  ): Promise<void> {
    if (!this.tickets.has(ticket) || controller.signal.aborted) return;
    const issued = await this.prisma.$transaction(async (tx) => {
      const observed = await tx.user.findUnique({ where: { email }, select: { id: true, authVersion: true } });
      if (!observed || controller.signal.aborted || !this.tickets.has(ticket)) return null;
      await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${observed.id} FOR UPDATE`);
      const current = await tx.user.findUnique({ where: { id: observed.id }, select: { id: true, authVersion: true } });
      if (!current || current.authVersion !== observed.authVersion || controller.signal.aborted ||
          !this.tickets.has(ticket) || this.mail.caseGeneration !== generation) return null;
      const clock = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`);
      const now = clock[0]!.now;
      const active = await tx.passwordRecoveryToken.count({
        where: { userId: current.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      });
      if (active >= 3 || controller.signal.aborted || !this.tickets.has(ticket)) return null;
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(now.getTime() + this.tokenTtlMs());
      await tx.passwordRecoveryToken.create({
        data: { userId: current.id, tokenHash: this.hashToken(token), issuedAuthVersion: current.authVersion, expiresAt },
      });
      if (controller.signal.aborted || !this.tickets.has(ticket) || this.mail.caseGeneration !== generation) {
        throw new Error('RECOVERY_TICKET_EXPIRED');
      }
      return { token, tokenHash: this.hashToken(token), expiresAt, userId: current.id };
    }, { maxWait: 500, timeout: 1_500 });
    if (!issued) return;
    const authorizeHandoff = async (): Promise<boolean> => {
      if (controller.signal.aborted || !this.tickets.has(ticket) || this.mail.caseGeneration !== generation) return false;
      const rows = await this.prisma.$queryRaw<Array<{
        email: string; authVersion: number; issuedAuthVersion: number; expiresAt: Date;
        usedAt: Date | null; revokedAt: Date | null; now: Date;
      }>>(Prisma.sql`
        SELECT u.email, u."authVersion", r."issuedAuthVersion", r."expiresAt", r."usedAt", r."revokedAt",
          clock_timestamp() AS now
        FROM users u JOIN password_recovery_tokens r ON r."userId" = u.id
        WHERE r."tokenHash" = ${issued.tokenHash}`);
      const row = rows[0];
      return Boolean(row && row.authVersion === row.issuedAuthVersion && row.expiresAt > row.now &&
        row.usedAt === null && row.revokedAt === null && !controller.signal.aborted &&
        this.tickets.has(ticket) && this.mail.caseGeneration === generation);
    };
    if (!await authorizeHandoff()) {
      await this.revokeIssuedToken(issued.tokenHash);
      return;
    }
    try {
      const user = await this.prisma.user.findUnique({ where: { id: issued.userId }, select: { email: true } });
      if (!user) { await this.revokeIssuedToken(issued.tokenHash); return; }
      const envelope: RecoveryMail = {
        recipient: user.email, token: issued.token, expiresAt: issued.expiresAt, caseGeneration: generation,
      };
      await this.mail.deliver(envelope, controller.signal, async () => {
        const allowed = await authorizeHandoff();
        if (!allowed) await this.revokeIssuedToken(issued.tokenHash);
        return allowed;
      });
    } catch {
      await this.revokeIssuedToken(issued.tokenHash);
      throw new Error('RECOVERY_DELIVERY_FAILED');
    }
  }

  private async revokeIssuedToken(tokenHash: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const token = await tx.passwordRecoveryToken.findUnique({ where: { tokenHash }, select: { id: true, userId: true } });
        if (!token) return;
        await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${token.userId} FOR UPDATE`);
        const now = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`);
        await tx.passwordRecoveryToken.updateMany({
          where: { id: token.id, usedAt: null, revokedAt: null }, data: { revokedAt: now[0]!.now },
        });
      }, { maxWait: 500, timeout: 1_500 });
    } catch { /* A token remains unusable after its user version changes; cleanup is best effort. */ }
  }

  private async admit(ip: string, purpose: 'request' | 'consume', email?: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ipHash = this.hmac(ip);
        const globalHash = 'all';
        const identifierHash = email ? this.hmac(email) : null;
        const entries: Array<{ scope: string; keyHash: string; limit: number; windowMs: number }> = [
          { scope: 'ip', keyHash: ipHash, limit: 5, windowMs: 15 * 60_000 },
          { scope: 'global', keyHash: globalHash, limit: GLOBAL_PER_MINUTE, windowMs: 60_000 },
        ];
        if (identifierHash && purpose === 'request') entries.push({ scope: 'identifier-hour', keyHash: identifierHash, limit: 3, windowMs: 60 * 60_000 });
        const result = { ipRetry: 0, globalRetry: 0, identifierDenied: false };
        if (identifierHash && purpose === 'request') {
          await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'mobile:' + identifierHash}, 0))`);
        }
        for (const entry of entries) {
          await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${entry.scope}:${entry.keyHash}`}, 0))`);
        }
        const nowRows = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`);
        const now = nowRows[0]!.now;
        await tx.recoveryRateLimitHit.deleteMany({ where: { occurredAt: { lt: new Date(now.getTime() - 60 * 60_000) } } });
        const counts = new Map<string, { count: number; oldest: Date | null }>();
        for (const entry of entries) {
          const cutoff = new Date(now.getTime() - entry.windowMs);
          const rows = await tx.$queryRaw<Array<{ count: bigint; oldest: Date | null }>>(Prisma.sql`
            SELECT count(*)::bigint AS count, min("occurredAt") AS oldest FROM recovery_rate_limit_hits
            WHERE scope = ${entry.scope} AND "keyHash" = ${entry.keyHash} AND "occurredAt" > ${cutoff}`);
          const count = Number(rows[0]!.count);
          counts.set(entry.scope, { count, oldest: rows[0]!.oldest });
          if (count >= entry.limit) {
            const retry = Math.max(1, Math.ceil((rows[0]!.oldest!.getTime() + entry.windowMs - now.getTime()) / 1000));
            if (entry.scope === 'ip') result.ipRetry = retry;
            else if (entry.scope === 'global') result.globalRetry = retry;
            else result.identifierDenied = true;
          }
        }
        if (result.ipRetry || result.globalRetry) return result;
        for (const entry of entries.filter((candidate) => candidate.scope !== 'identifier-hour')) {
          await tx.recoveryRateLimitHit.create({ data: { scope: entry.scope, keyHash: entry.keyHash, occurredAt: now } });
        }
        if (identifierHash && purpose === 'request') {
          const entry = entries.find((candidate) => candidate.scope === 'identifier-hour');
          if (entry) {
            const lastIdentifierRequest = await tx.recoveryRateLimitHit.findFirst({
              where: { scope: 'identifier-gap', keyHash: identifierHash },
              orderBy: { occurredAt: 'desc' }, select: { occurredAt: true },
            });
            if (lastIdentifierRequest && now.getTime() - lastIdentifierRequest.occurredAt.getTime() < 60_000) {
              return { ...result, identifierDenied: true };
            }
            if (counts.get(entry.scope)!.count >= entry.limit) return { ...result, identifierDenied: true };
            await tx.recoveryRateLimitHit.create({ data: { scope: entry.scope, keyHash: entry.keyHash, occurredAt: now } });
            await tx.recoveryRateLimitHit.create({ data: { scope: 'identifier-gap', keyHash: identifierHash, occurredAt: now } });
          }
        }
        return result;
      });
    } catch {
      throw this.unavailable();
    }
  }

  private hmac(value: string): string {
    const secret = this.config.get<string>('RECOVERY_IDENTIFIER_HMAC_KEY');
    if (!secret || secret.length < 32) throw new ServiceUnavailableException('Recuperación no disponible');
    return createHmac('sha256', secret).update(value).digest('hex');
  }

  private hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
  private tokenTtlMs(): number {
    const value = Number(this.config.get<string>('RECOVERY_TOKEN_TTL_SECONDS', '1800'));
    return Number.isInteger(value) && value >= 60 && value <= 86_400 ? value * 1000 : TOKEN_TTL_MS;
  }
  private unavailable(): RecoveryException { return new RecoveryException(503, RECOVERY_CODES.unavailable, 'No pudimos procesar el pedido ahora. Probá más tarde.'); }
  private rateLimited(seconds: number): RecoveryException { return new RecoveryException(429, RECOVERY_CODES.rateLimited, 'Esperá un poco antes de volver a intentar.', { retryAfter: String(Math.max(1, seconds)) }); }
  private linkInvalid(): RecoveryException { return new RecoveryException(400, RECOVERY_CODES.linkInvalid, 'El enlace no es válido o venció. Pedí uno nuevo para continuar.'); }
}
