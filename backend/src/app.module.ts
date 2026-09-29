import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
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
