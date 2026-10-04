import { VisualIdentifyController } from './visual-identify.controller.js';
import { VisualIdentifyService } from './visual-identify.service.js';
import { Module } from '@nestjs/common';
import { JobsModule } from '../../jobs/jobs.module.js';
import { CurrencyModule } from '../currency/currency.module.js';
import { CardsController } from './cards.controller.js';
import { CardsService } from './cards.service.js';
import { SetsController } from './sets.controller.js';

@Module({
  imports: [JobsModule, CurrencyModule],
  controllers: [CardsController, SetsController, VisualIdentifyController],
  providers: [CardsService, VisualIdentifyService],
  exports: [CardsService],
})
export class CardsModule {}
