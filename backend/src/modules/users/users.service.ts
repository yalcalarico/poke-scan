import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/index.js';
import type { PublicUser } from '../../common/types/auth-user.js';
import {
  type PreferredCurrency,
  type RateType,
} from '../currency/currency.constants.js';
import type { UpdatePreferenceDto } from '../currency/dto/preference.dto.js';

/**
 * Única definición de qué es un usuario "público". `passwordHash` nunca entra
 * al select, así que ningún endpoint puede filtrarlo por accidente.
 */
export const publicUserSelect = {
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

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  /**
   * Guarda la preferencia de moneda del usuario. Reusa `publicUserSelect` para
   * devolver exactamente el mismo shape sanitizado que `GET /users/me`.
   */
  async updatePreferences(
    id: string,
    dto: UpdatePreferenceDto,
  ): Promise<PublicUser> {
    const data: {
      preferredCurrency: PreferredCurrency;
      preferredRateType?: RateType;
    } = { preferredCurrency: dto.preferredCurrency };

    // Si no viene `preferredRateType`, se conserva el que ya tenía.
    if (dto.preferredRateType !== undefined) {
      data.preferredRateType = dto.preferredRateType;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: publicUserSelect,
    });

    return user;
  }
}
