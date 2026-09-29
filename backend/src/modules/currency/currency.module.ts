import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { CurrencyController } from './currency.controller.js';
import { CurrencyService } from './currency.service.js';

@Module({
  imports: [UsersModule],
  controllers: [CurrencyController],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
