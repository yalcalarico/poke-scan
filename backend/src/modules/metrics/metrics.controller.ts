import { Controller, Get, Headers, HttpException, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { MetricsService } from './metrics.service.js';
import type { MetricsSnapshotDto } from './metrics.dto.js';

@Controller('ops/metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}
  @Get()
  async get(@Headers('x-metrics-token') token: string | string[] | undefined, @Res({ passthrough: true }) response: Response): Promise<MetricsSnapshotDto> {
    response.setHeader('Cache-Control', 'no-store');
    const secret = process.env.METRICS_TOKEN;
    if (!secret || secret.length < 32 || secret.length > 1024) throw new HttpException('No encontrado.', HttpStatus.NOT_FOUND);
    if (typeof token !== 'string' || token.length < 32 || token.length > 1024) throw new HttpException('No autorizado.', HttpStatus.UNAUTHORIZED);
    const supplied = createHash('sha256').update(token).digest();
    const expected = createHash('sha256').update(secret).digest();
    if (!timingSafeEqual(supplied, expected)) throw new HttpException('No autorizado.', HttpStatus.UNAUTHORIZED);
    return this.metrics.snapshot();
  }
}
