import { afterEach, describe, expect, it, vi } from 'vitest';

import { installCanvasShim, ShimImageData } from './helpers/canvas-shim';

installCanvasShim();

/**
 * `debug-capture` lee el flag del entorno al importarse, así que cada caso
 * necesita el módulo fresco.
 */
async function loadCapture(enabled: boolean) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SCAN_CAPTURE', enabled ? '1' : '0');
  return import('../debug-capture');
}

function sampleImage(): ImageData {
  const width = 40;
  const height = 30;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = i % 255;
    data[i + 1] = 128;
    data[i + 2] = 32;
    data[i + 3] = 255;
  }
  return new ShimImageData(data, width, height) as unknown as ImageData;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('debug-capture', () => {
  it('con el flag apagado no hace ninguna request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { captureStep, isScanCaptureEnabled } = await loadCapture(false);

    expect(isScanCaptureEnabled()).toBe(false);
    captureStep('run-1', '01-foto', sampleImage());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('con el flag prendido manda un PNG al endpoint de captura', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const { captureStep, isScanCaptureEnabled } = await loadCapture(true);
    expect(isScanCaptureEnabled()).toBe(true);

    captureStep('run-7', '04-banda-0-original', sampleImage());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('/jobs/scan-capture');
    expect(init.method).toBe('POST');

    const body = JSON.parse(String(init.body)) as { run: string; step: string; png: string };
    expect(body.run).toBe('run-7');
    expect(body.step).toBe('04-banda-0-original');
    expect(body.png.startsWith('data:image/png;base64,')).toBe(true);
    // La firma del PNG: siempre 89 50 4E 47.
    expect(Buffer.from(body.png.split(',')[1]!, 'base64').subarray(1, 4).toString()).toBe('PNG');
  });

  it('un error de red no rompe el escaneo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('sin conexión');
      }),
    );

    const { captureStep } = await loadCapture(true);
    expect(() => captureStep('run-8', '01-foto', sampleImage())).not.toThrow();
  });
});

