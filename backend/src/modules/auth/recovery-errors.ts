import { HttpException, HttpStatus } from '@nestjs/common';

export const RECOVERY_CODES = {
  inputInvalid: 'INPUT_INVALID',
  forbidden: 'SESSION_REQUEST_FORBIDDEN',
  rateLimited: 'RECOVERY_RATE_LIMITED',
  unavailable: 'RECOVERY_UNAVAILABLE',
  linkInvalid: 'RECOVERY_LINK_INVALID',
} as const;

export class RecoveryException extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, fields?: Record<string, string>) {
    super({ statusCode: status, code, message, ...(fields ? { fields } : {}) }, status);
  }
}
