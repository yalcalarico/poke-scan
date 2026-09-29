import { Logger } from '@nestjs/common';

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const BASE_BACKOFF_MS = 3000;
const MAX_BACKOFF_MS = 30000;

function backoffFor(attempt: number): number {
  const exponential = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  const capped = Math.min(exponential, MAX_BACKOFF_MS);
  return capped + Math.floor(Math.random() * 2000);
}

export async function withPageRetry<T>(
  logger: Logger,
  label: string,
  fn: () => Promise<T>,
  intentos = 8,
): Promise<T | null> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= intentos; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      logger.warn(
        `${label} falló (intento ${attempt}/${intentos}): ${(error as Error).message}`,
      );
      if (attempt < intentos) await wait(backoffFor(attempt));
    }
  }

  logger.error(
    `${label} abortada después de ${intentos} intentos: ${(lastError as Error).message}`,
  );
  return null;
}
