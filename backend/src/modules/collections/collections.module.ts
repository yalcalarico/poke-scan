import { Module } from '@nestjs/common';

import { JobsModule } from '../../jobs/jobs.module.js';
import { CollectionsController } from './collections.controller.js';
import { CollectionsService } from './collections.service.js';
import { PortfolioService } from './portfolio.service.js';

@Module({
  imports: [JobsModule],
  controllers: [CollectionsController],
  providers: [CollectionsService, PortfolioService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
