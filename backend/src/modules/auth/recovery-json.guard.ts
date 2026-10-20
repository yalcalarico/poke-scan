import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { RecoveryException, RECOVERY_CODES } from './recovery-errors.js';

@Injectable()
export class RecoveryJsonGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const mediaType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
    if (mediaType !== 'application/json') {
      throw new RecoveryException(400, RECOVERY_CODES.inputInvalid, 'Revisá los datos ingresados.', {
        request: 'Enviá los datos en formato JSON.',
      });
    }
    return true;
  }
}
