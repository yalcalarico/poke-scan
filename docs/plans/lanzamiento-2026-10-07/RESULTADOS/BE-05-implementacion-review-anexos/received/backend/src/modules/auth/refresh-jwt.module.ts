import { readJwtSecret } from './session-security.js';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';

export const REFRESH_JWT = Symbol('REFRESH_JWT');

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: readJwtSecret(configService, 'JWT_REFRESH_SECRET'),
        signOptions: {
          expiresIn: Number(
            configService.get<string>('JWT_REFRESH_TTL_DAYS', '30'),
          ) * 24 * 60 * 60,
        },
      }),
    }),
  ],
  providers: [{ provide: REFRESH_JWT, useExisting: JwtService }],
  exports: [REFRESH_JWT],
})
export class RefreshJwtModule {}
