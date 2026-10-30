import { AccountDeletionModule } from '../account-deletion/account-deletion.module.js';
import { readJwtSecret } from './session-security.js';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { APP_FILTER } from '@nestjs/core';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { AuthController } from './auth.controller.js';
import { PasswordChangeController } from './password-change.controller.js';
import { PasswordChangeService } from './password-change.service.js';
import { AuthService } from './auth.service.js';
import { PasswordRecoveryService } from './password-recovery.service.js';
import { RECOVERY_MAIL_PORT } from './recovery-mail.port.js';
import { createResendRecoveryMailPort } from './resend-recovery-mail.port.js';
import { RecoveryHttpFilter } from './recovery-http.filter.js';
import { RefreshJwtModule } from './refresh-jwt.module.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: readJwtSecret(configService, 'JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_TTL', '15m') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
    RefreshJwtModule, AccountDeletionModule,
  ],
  controllers: [AuthController, PasswordChangeController],
  providers: [
    AuthService, PasswordRecoveryService, PasswordChangeService, JwtAuthGuard,
    { provide: RECOVERY_MAIL_PORT, inject: [ConfigService], useFactory: createResendRecoveryMailPort },
    { provide: APP_FILTER, useClass: RecoveryHttpFilter },
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
