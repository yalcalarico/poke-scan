import { Module } from '@nestjs/common';
import { JobsModule } from '../../jobs/jobs.module.js';
import { CurrencyModule } from '../currency/currency.module.js';
import { CardsController } from './cards.controller.js';
import { CardsService } from './cards.service.js';
import { IdentifyService } from './identify.service.js';
import { SetsController } from './sets.controller.js';

@Module({
  imports: [JobsModule, CurrencyModule],
  controllers: [CardsController, SetsController],
  providers: [CardsService, IdentifyService],
  exports: [CardsService, IdentifyService],
})
export class CardsModule {}
