import { describe, expect, it } from 'vitest';

import { mapFrameToSourcePixels } from '../camera';

describe('mapFrameToSourcePixels', () => {
  // El caso simple: la imagen se ve completa (contain implícito, scale=1) y el
  // marco coincide con la caja del video.
  it('mapea 1:1 cuando la imagen llena exactamente la caja', () => {
    const result = mapFrameToSourcePixels(
      { x: 100, y: 50, width: 400, height: 500 },
      { width: 800, height: 600 },
      { width: 800, height: 600 },
    );
    expect(result).toEqual({ x: 100, y: 50, width: 400, height: 500 });
  });

  it('recorta cuando el marco se sale de la imagen', () => {
    // El marco pide hasta y=610 pero la imagen mide 600 de alto.
    const result = mapFrameToSourcePixels(
      { x: 100, y: 50, width: 400, height: 560 },
      { width: 800, height: 600 },
      { width: 800, height: 600 },
    );
    expect(result).toEqual({ x: 100, y: 50, width: 400, height: 550 });
  });

  it('descuenta el escalado de object-cover', () => {
    // Video 16:9 (1920x1080) en una caja 4:3 angosta: object-cover escala por
    // el ancho y recorta por el alto.
    //   scale = max(400/1920, 600/1080) = max(0.2083, 0.5555) = 0.5555
    //   rendered  = 1066 x 600  ->  se recorta 666 px de ancho, 333 por lado
    const result = mapFrameToSourcePixels(
      { x: 20, y: 0, width: 360, height: 600 },
      { width: 400, height: 600 },
      { width: 1920, height: 1080 },
    );
    expect(result).not.toBeNull();
    // offsetX = (400 - 1066.66)/2 = -333.33 ; sx = (20 + 333.33)/0.5555 ≈ 636
    expect(result!.x).toBe(636);
    expect(result!.width).toBe(648); // 360 / 0.5555
    expect(result!.height).toBe(1080); // toda la altura
    expect(result!.y).toBe(0);
  });

  it('recorta a los límites de la imagen', () => {
    const result = mapFrameToSourcePixels(
      { x: -50, y: -50, width: 500, height: 500 },
      { width: 500, height: 500 },
      { width: 500, height: 500 },
    );
    expect(result).toEqual({ x: 0, y: 0, width: 450, height: 450 });
  });

  it('devuelve null si el área es demasiado chica para ser una carta', () => {
    expect(
      mapFrameToSourcePixels(
        { x: 10, y: 10, width: 8, height: 8 },
        { width: 800, height: 600 },
        { width: 800, height: 600 },
      ),
    ).toBeNull();
  });

  it('devuelve null con dimensiones inválidas en vez de NaN', () => {
    expect(
      mapFrameToSourcePixels(
        { x: 0, y: 0, width: 100, height: 100 },
        { width: 0, height: 0 },
        { width: 1920, height: 1080 },
      ),
    ).toBeNull();
    expect(
      mapFrameToSourcePixels(
        { x: 0, y: 0, width: 100, height: 100 },
        { width: 800, height: 600 },
        { width: 0, height: 0 },
      ),
    ).toBeNull();
  });

  it('nunca produce coordenadas NaN o negativas', () => {
    const result = mapFrameToSourcePixels(
      { x: -9999, y: 5000, width: 400, height: 300 },
      { width: 300, height: 800 },
      { width: 640, height: 480 },
    );
    // Puede dar null (área degenerada) o un rect válido, pero nunca NaN.
    if (result) {
      expect(Number.isFinite(result.x)).toBe(true);
      expect(Number.isFinite(result.y)).toBe(true);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeGreaterThanOrEqual(0);
    }
  });
});
