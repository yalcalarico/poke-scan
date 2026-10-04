import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installCanvasShim } from './helpers/canvas-shim';
import { prepareVisualPhoto } from '../visual-photo';
import * as preprocess from '../preprocess';
const load = vi.hoisted(() => vi.fn());
vi.mock('@/components/scanner/image-input', () => ({ fileToImageData: load, DEFAULT_CAPTURE_WIDTH: 1280 }));
installCanvasShim();

describe('entrada de cámara ya encuadrada', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it('conserva los píxeles y orientación sin ejecutar detección de bordes', async () => {
    const image = new ImageData(new Uint8ClampedArray(63 * 88 * 4).fill(200), 63, 88);
    load.mockResolvedValue({ imageData: image, highResolutionSource: { close: vi.fn() } });
    const normalize = vi.spyOn(preprocess, 'normalizeCardImageData');
    const result = await prepareVisualPhoto(new File(['x'], 'camara.jpg'), true);
    expect(normalize).not.toHaveBeenCalled();
    expect(result.normalized.image).toBe(image);
    expect(result.normalized.rotation).toBe(0);
    expect(result.normalized.rect).toBeNull();
  });
  it('sigue detectando y orientando fotos de galería', async () => {
    const image = new ImageData(new Uint8ClampedArray(63 * 88 * 4).fill(200), 63, 88);
    load.mockResolvedValue({ imageData: image, highResolutionSource: { close: vi.fn() } });
    const normalize = vi.spyOn(preprocess, 'normalizeCardImageData');
    await prepareVisualPhoto(new File(['x'], 'galeria.jpg'));
    expect(normalize).toHaveBeenCalledWith(image);
  });
});
