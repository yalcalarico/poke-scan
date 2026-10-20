import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetricsController } from './metrics.controller.js';

describe('MetricsController', () => {
  afterEach(() => { delete process.env.METRICS_TOKEN; });
  it('oculta el endpoint cuando no se configuró un secreto válido', async () => {
    delete process.env.METRICS_TOKEN;
    const controller = new MetricsController({ snapshot: vi.fn() } as never);
    await expect(controller.get(undefined, { setHeader: vi.fn() } as never)).rejects.toMatchObject({ status: 404 });
  });
  it('oculta secretos demasiado cortos y rechaza JWT u otro formato de header', async () => {
    const controller = new MetricsController({ snapshot: vi.fn() } as never);
    const response = { setHeader: vi.fn() };
    process.env.METRICS_TOKEN = 'short';
    await expect(controller.get('short', response as never)).rejects.toMatchObject({ status: 404 });
    process.env.METRICS_TOKEN = 's'.repeat(32);
    await expect(controller.get(undefined, response as never)).rejects.toMatchObject({ status: 401 });
    await expect(controller.get(['s'.repeat(32)], response as never)).rejects.toMatchObject({ status: 401 });
    await expect(controller.get(`Bearer ${'s'.repeat(32)}`, response as never)).rejects.toMatchObject({ status: 401 });
    await expect(controller.get('s'.repeat(1025), response as never)).rejects.toMatchObject({ status: 401 });
    expect(response.setHeader).toHaveBeenCalledTimes(5);
  });
  it('exige token y devuelve no-store al autenticar', async () => {
    process.env.METRICS_TOKEN = 'x'.repeat(32);
    const snapshot = vi.fn().mockResolvedValue({ ok: true });
    const controller = new MetricsController({ snapshot } as never);
    const response = { setHeader: vi.fn() };
    await expect(controller.get('incorrecto', response as never)).rejects.toMatchObject({ status: 401 });
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    await expect(controller.get('x'.repeat(32), response as never)).resolves.toEqual({ ok: true });
    expect(snapshot).toHaveBeenCalledTimes(1);
  });
});
