import { retryAfterMilliseconds } from './provider-rate-limit.error.js';

describe('retryAfterMilliseconds', () => {
  it('acepta segundos, fecha HTTP y usa quince minutos por omisión', () => {
    const now = Date.parse('2026-10-18T12:00:00.000Z');
    expect(retryAfterMilliseconds('120', now)).toBe(120_000);
    expect(retryAfterMilliseconds('Sun, 18 Oct 2026 12:03:00 GMT', now)).toBe(180_000);
    expect(retryAfterMilliseconds(null, now)).toBe(900_000);
    expect(retryAfterMilliseconds('no válido', now)).toBe(900_000);
  });
});
