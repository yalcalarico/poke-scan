import {
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/index.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AccountSuppressionService } from '../account-deletion/account-suppression.service.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';

@Injectable()
export class PasswordChangeService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Optional()
    @Inject(AccountSuppressionService)
    private readonly suppression?: AccountSuppressionService,
  ) {}

  async change(
    session: AuthUser,
    dto: ChangePasswordDto,
  ): Promise<{ success: true }> {
    const invalid = () =>
      new UnauthorizedException(
        'Revisá la contraseña actual o volvé a iniciar sesión',
      );
    if (!Number.isSafeInteger(session.authVersion)) throw invalid();
    await this.suppression?.assertAllowed(session.sub);
    const before = await this.db.user.findFirst({
      where: { id: session.sub, authVersion: session.authVersion },
      select: { passwordHash: true, authVersion: true },
    });
    if (
      !before ||
      !(await argon2
        .verify(before.passwordHash, dto.currentPassword)
        .catch(() => false))
    )
      throw invalid();
    const passwordHash = await argon2.hash(dto.newPassword);
    await this.db.$transaction(async (tx) => {
      // Orden idéntico a login/refresh/reset: no puede sobrevivir una emisión vieja.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM users WHERE id = ${session.sub} FOR UPDATE`,
      );
      const current = await tx.user.findFirst({
        where: { id: session.sub, authVersion: session.authVersion },
        select: { passwordHash: true },
      });
      if (!current || current.passwordHash !== before.passwordHash)
        throw invalid();
      await this.suppression?.assertAllowed(session.sub);
      const clock = await tx.$queryRaw<Array<{ now: Date }>>(
        Prisma.sql`SELECT clock_timestamp() AS now`,
      );
      const now = clock[0]!.now;
      const updated = await tx.user.updateMany({
        where: { id: session.sub, authVersion: session.authVersion },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      if (updated.count !== 1) throw invalid();
      await tx.refreshToken.updateMany({
        where: { userId: session.sub, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.passwordRecoveryToken.updateMany({
        where: { userId: session.sub, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
    });
    return { success: true };
  }
}
