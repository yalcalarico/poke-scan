import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CollectionGoalsController } from './collection-goals.controller.js';
import { CollectionGoalsService } from './collection-goals.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [CollectionGoalsController],
  providers: [CollectionGoalsService],
  exports: [CollectionGoalsService],
})
export class CollectionGoalsModule {}
