import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RECOVERY_CODES } from './recovery-errors.js';

@Catch()
export class RecoveryHttpFilter extends BaseExceptionFilter implements ExceptionFilter {
  constructor(adapterHost: HttpAdapterHost) { super(adapterHost.httpAdapter); }

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const path = request.path.replace(/^\/api\//, '/');
    if (!['/auth/password-recovery-requests', '/auth/password-recoveries'].includes(path)) {
      super.catch(exception, host);
      return;
    }
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');

    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status === 429) {
      const retryAfter = this.retryAfter(exception);
      response.setHeader('Retry-After', String(retryAfter));
      response.status(429).json({ statusCode: 429, code: RECOVERY_CODES.rateLimited, message: 'Esperá un poco antes de volver a intentar.' });
      return;
    }
    if (status === 403) {
      response.status(403).json({ statusCode: 403, code: RECOVERY_CODES.forbidden, message: 'No pudimos procesar el pedido desde esta página. Volvé a empezar desde PokéScan.' });
      return;
    }
    if (status === 400) {
      if (exception instanceof HttpException) {
        const body = exception.getResponse();
        if (typeof body === 'object' && body !== null && 'code' in body && body.code === RECOVERY_CODES.linkInvalid) {
          response.status(400).json({ statusCode: 400, code: RECOVERY_CODES.linkInvalid, message: 'El enlace no es válido o venció. Pedí uno nuevo para continuar.' });
          return;
        }
      }
      if (path.endsWith('recoveries')) {
        const joined = this.validationMessage(exception);
        if (/token/i.test(joined)) {
          response.status(400).json({ statusCode: 400, code: RECOVERY_CODES.linkInvalid, message: 'El enlace no es válido o venció. Pedí uno nuevo para continuar.' });
          return;
        }
      }
      const fields = this.invalidFields(exception, path, request.body);
      response.status(400).json({ statusCode: 400, code: RECOVERY_CODES.inputInvalid, message: 'Revisá los datos ingresados.', fields });
      return;
    }
    if (status === 503) {
      response.status(503).json({ statusCode: 503, code: RECOVERY_CODES.unavailable, message: 'No pudimos procesar el pedido ahora. Probá más tarde.' });
      return;
    }
    response.status(500).json({ statusCode: 500, code: RECOVERY_CODES.unavailable, message: 'No pudimos procesar el pedido ahora. Probá más tarde.' });
  }

  private invalidFields(exception: unknown, path: string, body: unknown): Record<string, string> {
    if (!(exception instanceof HttpException) || exception.getStatus() !== 400) return {};
    const response = exception.getResponse();
    const messages = typeof response === 'object' && response !== null && 'message' in response ? response.message : undefined;
    const joined = Array.isArray(messages) ? messages.join(' ') : typeof messages === 'string' ? messages : '';
    const fields: Record<string, string> = {};
    if (path.endsWith('requests') && /email/i.test(joined)) fields.email = 'Revisá el formato del email.';
    if (path.endsWith('recoveries') && /newPassword/i.test(joined)) fields.newPassword = 'Usá entre 8 y 72 caracteres.';
    if (!Object.keys(fields).length && typeof body === 'object' && body !== null) fields.request = 'Revisá los datos ingresados.';
    return fields;
  }

  private validationMessage(exception: unknown): string {
    if (!(exception instanceof HttpException)) return '';
    const response = exception.getResponse();
    const messages = typeof response === 'object' && response !== null && 'message' in response ? response.message : undefined;
    return Array.isArray(messages) ? messages.join(' ') : typeof messages === 'string' ? messages : '';
  }

  private retryAfter(exception: unknown): number {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null && 'fields' in body &&
          typeof body.fields === 'object' && body.fields !== null && 'retryAfter' in body.fields) {
        const value = Number(body.fields.retryAfter);
        if (Number.isInteger(value) && value > 0) return value;
      }
    }
    return 60;
  }
}
