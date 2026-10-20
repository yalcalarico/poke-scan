import { describe, expect, it } from 'vitest';
import { installCanvasShim } from './helpers/canvas-shim';
import { analyzeCaptureQuality } from '../capture-quality';
installCanvasShim();

function photo(pixel: (x: number, y: number) => number[], width = 128, height = 176): ImageData {
  const bytes = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, rgb = pixel(x, y);
    bytes[i] = rgb[0]!; bytes[i + 1] = rgb[1]!; bytes[i + 2] = rgb[2]!; bytes[i + 3] = 255;
  }
  return new ImageData(bytes, width, height);
}
const texture = (x: number, y: number) => ((Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? 70 : 170);

describe('señales orientativas de captura', () => {
  it('separa un recorte con detalle de uno uniforme, sin declarar certeza', () => {
    const sharp = analyzeCaptureQuality(photo((x, y) => Array(3).fill(texture(x, y))))!;
    const flat = analyzeCaptureQuality(photo(() => [120, 120, 120]))!;
    expect(sharp.warnings).toEqual([]);
    expect(flat.warnings).toEqual(['blur']);
    expect(sharp.laplacianVariance).toBeGreaterThan(flat.laplacianVariance);
  });
  it('detecta una región blanca grande y registra su superficie', () => {
    const result = analyzeCaptureQuality(photo((x, y) => x > 40 && x < 85 && y > 60 && y < 110 ? [255, 255, 255] : Array(3).fill(texture(x, y))))!;
    expect(result.warnings).toContain('glare');
    expect(result.brightFraction).toBeGreaterThan(.05);
    expect(result.largestBrightRegionFraction).toBeCloseTo(result.brightFraction);
  });
  it('no trata píxeles blancos dispersos o amarillo saturado como un reflejo grande', () => {
    const scattered = analyzeCaptureQuality(photo((x, y) => x % 4 === 0 && y % 4 === 0 ? [255, 255, 255] : [100, 100, 100]))!;
    expect(scattered.brightFraction).toBeGreaterThan(.025);
    expect(scattered.warnings).not.toContain('glare');
    expect(analyzeCaptureQuality(photo(() => [255, 255, 20]))!.warnings).not.toContain('glare');
  });
  it('excluye el borde blanco del análisis de brillo', () => {
    const result = analyzeCaptureQuality(photo((x, y) => x < 6 || x >= 122 || y < 6 || y >= 170 ? [255, 255, 255] : Array(3).fill(texture(x, y))))!;
    expect(result.brightFraction).toBe(0);
    expect(result.warnings).not.toContain('glare');
  });
  it('limita el análisis y no altera los píxeles de consulta', () => {
    const image = photo(() => [120, 120, 120], 512, 704), before = image.data.slice();
    const result = analyzeCaptureQuality(image)!;
    expect(Math.max(result.analysisWidth, result.analysisHeight)).toBe(256);
    expect(image.data).toEqual(before);
    expect([result.laplacianVariance, result.brightFraction, result.largestBrightRegionFraction].every(Number.isFinite)).toBe(true);
  });
  it('omite el análisis para imágenes demasiado pequeñas', () => {
    expect(analyzeCaptureQuality(photo(() => [120, 120, 120], 2, 2))).toBeUndefined();
  });
});
