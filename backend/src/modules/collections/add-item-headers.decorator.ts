import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

// Los parámetros @Headers nativos no admiten pipes. El decorador permite pasar
// los headers por el DTO y ValidationPipe antes de entregar la clave al service.
export const AddItemHeaders = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Record<string, unknown> =>
    context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>()
      .headers,
);
