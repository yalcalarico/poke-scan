import { Global, Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsRecorder } from './metrics.recorder.js';
import { MetricsService } from './metrics.service.js';
import { createHealthPrismaClient } from '../../readiness.service.js';
import { METRICS_PRISMA_CLIENT } from './metrics.service.js';
import { ScannerHttpMetricsMiddleware } from './scanner-http-metrics.middleware.js';

@Global()
@Module({ imports: [CardsModule], controllers: [MetricsController], providers: [MetricsRecorder, ScannerHttpMetricsMiddleware, { provide: METRICS_PRISMA_CLIENT, useFactory: createHealthPrismaClient }, MetricsService], exports: [MetricsRecorder] })
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ScannerHttpMetricsMiddleware).forRoutes('*');
  }
}
