import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { JobsModule } from './jobs/jobs.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CardsModule } from './modules/cards/cards.module.js';
import { CollectionsModule } from './modules/collections/collections.module.js';
import { CurrencyModule } from './modules/currency/currency.module.js';
import { FriendsModule } from './modules/friends/friends.module.js';
import { ShareModule } from './modules/share/share.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    /*
     * `ScheduleModule.forRoot()` es lo que activa los `@Cron` de
     * `ScheduledJobsService`. Estaba en `package.json` desde el principio y sin
     * esta línea no había ningún cron: los decorators se registraban y no se
     * ejecutaban nunca.
     *
     * Los tres jobs que hay (sync semanal de catálogo, backfill diario de
     * precios, retención mensual) se apagan con `ENABLE_CATALOG_SYNC_CRON`,
     * `ENABLE_PRICE_BACKFILL_CRON` y `ENABLE_RETENTION_CRON`. Ver
     * `jobs.md` §"Los crons".
     */
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    RedisModule,
    JobsModule,
    AuthModule,
    UsersModule,
    CardsModule,
    CollectionsModule,
    ShareModule,
    CurrencyModule,
    FriendsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
