import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { ShowcaseController } from './showcase.controller.js';
import { ShowcaseService } from './showcase.service.js';
@Module({
  imports: [PrismaModule, ProvidersModule],
  controllers: [ShowcaseController],
  providers: [ShowcaseService],
})
export class ShowcaseModule {}
