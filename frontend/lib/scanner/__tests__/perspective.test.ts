import { describe, expect, it } from 'vitest';
import { installCanvasShim } from './helpers/canvas-shim';
import { detectCardQuadrilateral, rectifyCardPerspective, type CardQuadrilateral } from '../perspective';
import { normalizeCardImageData, rotateImageData } from '../preprocess';
installCanvasShim();

function polygonPhoto(q: CardQuadrilateral, width = 240, height = 300): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inside = q.every((p, i) => {
      const b = q[(i + 1) % 4]!;
      return (b.x - p.x) * (y - p.y) - (b.y - p.y) * (x - p.x) >= 0;
    });
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = inside ? 210 : 20;
    data[i + 3] = 255;
  }
  return new ImageData(data, width, height);
}

describe('perspectiva del recorte', () => {
  it.each([0, 90] as const)('conserva el marco exterior aunque el dibujo interior tenga perspectiva (giro %s°)', (rotation) => {
    const width = 240, height = 300;
    const artwork: CardQuadrilateral = [{ x: 20, y: 20 }, { x: 222, y: 20 }, { x: 222, y: 177 }, { x: 81, y: 139 }];
    const photo = polygonPhoto(artwork, width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const insideCard = x >= 15 && x < 226 && y >= 2 && y < 297;
      const insideArtwork = photo.data[(y * width + x) * 4] === 210;
      // Una parte del borde derecho pierde contraste, como una funda sobre fondo claro.
      const value = insideArtwork ? 50 : insideCard || (x >= 226 && y >= 180) ? 200 : 20;
      const i = (y * width + x) * 4;
      photo.data[i] = photo.data[i + 1] = photo.data[i + 2] = value;
    }
    const result = normalizeCardImageData(rotation ? rotateImageData(photo, rotation) : photo);
    expect(result.rotation).toBe(rotation);
    expect(result.image.height).toBeGreaterThan(280);
    // Dos giros horarios dejan el pie arriba; debe conservarse en ambos casos.
    const footer = (Math.floor(result.image.height * (rotation ? .15 : .85)) * result.image.width + Math.floor(result.image.width / 2)) * 4;
    expect(result.image.data[footer]).toBe(200);
  });

  it('deshace un trapecio con transformación proyectiva y conserva los canales', () => {
    const data = new Uint8ClampedArray(181 * 201 * 4);
    for (let y = 0; y < 201; y++) for (let x = 0; x < 181; x++) {
      const i = (y * 181 + x) * 4;
      data[i] = x; data[i + 1] = y; data[i + 2] = 123; data[i + 3] = 255;
    }
    const result = rectifyCardPerspective(new ImageData(data, 181, 201), [{ x: 30, y: 20 }, { x: 130, y: 20 }, { x: 160, y: 180 }, { x: 0, y: 180 }]);
    expect(result).not.toBeNull();
    expect(result!.width / result!.height).toBeCloseTo(63 / 88, 2);
    const center = (Math.floor(result!.height / 2) * result!.width + Math.floor(result!.width / 2)) * 4;
    expect(result!.data[center]).toBeCloseTo(80, -1);
    // Centro proyectivo y=81,54; una interpolación bilineal de esquinas daría 100.
    expect(Math.abs(result!.data[center + 1]! - 81.54)).toBeLessThan(2);
    expect(result!.data[center + 2]).toBe(123);
    expect([...result!.data.slice(0, 4)]).toEqual([30, 20, 123, 255]);
    expect([...result!.data.slice(-4)]).toEqual([160, 180, 123, 255]);
  });

  it('detecta cuatro lados inclinados y los integra al recorte vertical', () => {
    const q: CardQuadrilateral = [{ x: 65, y: 45 }, { x: 175, y: 60 }, { x: 190, y: 245 }, { x: 45, y: 260 }];
    const photo = polygonPhoto(q);
    const found = detectCardQuadrilateral(photo);
    expect(found).not.toBeNull();
    found!.forEach((p, i) => expect(Math.hypot(p.x - q[i]!.x, p.y - q[i]!.y)).toBeLessThan(7));
    const normalized = normalizeCardImageData(photo);
    expect(normalized.quadrilateral).toBeDefined();
    expect(normalized.rotation).toBe(0);
    expect(normalized.image.width / normalized.image.height).toBeCloseTo(63 / 88, 2);
  });

  it('rectifica una carta horizontal y la rota sin perder la proporción', () => {
    const photo = polygonPhoto([{ x: 40, y: 65 }, { x: 250, y: 45 }, { x: 260, y: 180 }, { x: 60, y: 195 }], 300, 240);
    const result = normalizeCardImageData(photo);
    expect(result.quadrilateral).toBeDefined();
    expect(result.rotation).toBe(90);
    expect(result.image.width / result.image.height).toBeCloseTo(63 / 88, 2);
  });

  it('conserva el recorte anterior para una carta alineada', () => {
    const photo = polygonPhoto([{ x: 60, y: 50 }, { x: 180, y: 50 }, { x: 180, y: 218 }, { x: 60, y: 218 }]);
    expect(detectCardQuadrilateral(photo)).toBeNull();
    const result = normalizeCardImageData(photo);
    expect(result.detected).toBe(true);
    expect(result.quadrilateral).toBeUndefined();
  });

  it('no inventa esquinas en un fondo uniforme ni una carta cortada', () => {
    const uniform = new ImageData(new Uint8ClampedArray(240 * 300 * 4).fill(100), 240, 300);
    expect(detectCardQuadrilateral(uniform)).toBeNull();
    const clipped = polygonPhoto([{ x: -20, y: 40 }, { x: 150, y: 60 }, { x: 170, y: 250 }, { x: -20, y: 270 }]);
    expect(detectCardQuadrilateral(clipped)).toBeNull();
  });

  it('rechaza esquinas cruzadas, degeneradas, fuera de imagen o no finitas', () => {
    const photo = polygonPhoto([{ x: 60, y: 50 }, { x: 180, y: 50 }, { x: 180, y: 218 }, { x: 60, y: 218 }]);
    for (const q of [
      [{ x: 60, y: 50 }, { x: 180, y: 218 }, { x: 180, y: 50 }, { x: 60, y: 218 }],
      Array.from({ length: 4 }, () => ({ x: 50, y: 50 })),
      [{ x: -1, y: 50 }, { x: 180, y: 50 }, { x: 180, y: 218 }, { x: 60, y: 218 }],
      [{ x: NaN, y: 50 }, { x: 180, y: 50 }, { x: 180, y: 218 }, { x: 60, y: 218 }],
    ]) expect(rectifyCardPerspective(photo, q as CardQuadrilateral)).toBeNull();
  });
});
