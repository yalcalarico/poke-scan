/** Rate limit informado por un proveedor externo. */
export class ProviderRateLimitError extends Error {
  readonly status = 429;

  constructor(
    readonly providerId: string,
    readonly retryAfterMs: number,
    message = `El proveedor ${providerId} pidió esperar antes de continuar`,
  ) {
    super(message);
    this.name = 'ProviderRateLimitError';
  }
}

export function retryAfterMilliseconds(value: string | null, now = Date.now()): number {
  if (value !== null) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
    const at = Date.parse(value);
    if (Number.isFinite(at)) return Math.max(0, at - now);
  }
  return 15 * 60 * 1000;
}
