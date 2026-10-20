import { createHash } from 'node:crypto';
import { HttpException, Inject, Injectable, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/index.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { AccountDeletionDto, AccountDeletionResponseDto } from './account-deletion.dto.js';
import { RedisService } from '../../redis/index.js';
import { PRICE_PROVIDER, type PriceProvider } from '../providers/card-provider.interface.js';
import { publicCacheKey } from '../share/share.service.js';
import { AccountSuppressionService } from './account-suppression.service.js';

@Injectable()
export class AccountDeletionService {
  constructor(private readonly prisma: PrismaService, private readonly suppression: AccountSuppressionService,
    @Optional() private readonly redis?: RedisService,
    @Optional() @Inject(PRICE_PROVIDER) private readonly priceProvider?: PriceProvider) {}
  isAvailable(): Promise<boolean> { return this.suppression.isAvailable(); }
  async deleteOwnAccount(session: AuthUser, dto: AccountDeletionDto): Promise<AccountDeletionResponseDto> {
    if (!this.suppression.enabled) throw new ServiceUnavailableException('La eliminación todavía no está disponible');
    if (dto.confirmation !== 'ELIMINAR' || !Number.isSafeInteger(session.authVersion)) throw new UnauthorizedException('Volvé a iniciar sesión para eliminar la cuenta');
    await this.suppression.assertAllowed(session.sub);
    await this.admit(session.sub);
    let slugs: string[];
    try {
      slugs = await this.prisma.$transaction(async (tx) => {
        // Mismo lock que login, refresh y recuperación: la clave/versión se validan vigentes.
        await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${session.sub} FOR UPDATE`);
        const current = await tx.user.findFirst({ where: { id: session.sub, authVersion: session.authVersion }, select: { id: true, passwordHash: true } });
        if (!current || !(await argon2.verify(current.passwordHash, dto.password).catch(() => false))) throw new UnauthorizedException('Revisá la contraseña actual o volvé a iniciar sesión');
        await this.suppression.assertAllowed(current.id);
        const links = await tx.shareLink.findMany({ where: { userId: current.id }, select: { slug: true } });
        // Aceptación durable irrevocable primero: si PG falla, el registro bloquea la cuenta.
        await this.suppression.accept(current.id);
        const deleted = await tx.user.deleteMany({ where: { id: current.id, authVersion: session.authVersion } });
        if (deleted.count !== 1) throw new Error('ACCOUNT_DELETION_NOT_COMMITTED');
        return links.map((link) => link.slug);
      }, { maxWait: 5_000, timeout: 15_000 });
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new ServiceUnavailableException('No pudimos confirmar el resultado. No repitas el pedido automáticamente');
    }
    if (this.redis && this.priceProvider && slugs.length) {
      try { await this.redis.del(...slugs.map((slug) => publicCacheKey(this.priceProvider!.id, slug))); }
      catch { /* La autoridad PG ya revocó los links; Redis degradado no invalida la baja confirmada. */ }
    }
    return { success: true };
  }
  private async admit(userId: string): Promise<void> {
    const keyHash = createHash('sha256').update(userId).digest('hex');
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'account-deletion:' + keyHash}, 0))`);
        const clock = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`);
        const now = clock[0]!.now;
        const scope = 'account-deletion';
        await tx.recoveryRateLimitHit.deleteMany({ where: { scope, occurredAt: { lte: new Date(now.getTime() - 15 * 60_000) } } });
        const count = await tx.recoveryRateLimitHit.count({ where: { scope, keyHash } });
        if (count >= 5) throw new HttpException('Esperá un poco antes de volver a intentar', 429);
        await tx.recoveryRateLimitHit.create({ data: { scope, keyHash, occurredAt: now } });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('La eliminación no está disponible ahora');
    }
  }

}
