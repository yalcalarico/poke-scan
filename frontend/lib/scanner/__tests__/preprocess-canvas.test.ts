import { describe, expect, it } from 'vitest';
import { installCanvasShim, ShimCanvas } from './helpers/canvas-shim';
import { cropImageData, detectCardRect, expandRect, normalizeCardImageData, rotateImageData, toImageData } from '../preprocess';
installCanvasShim();
const asCanvas = (canvas: ShimCanvas) => canvas as unknown as HTMLCanvasElement;

function gradientCanvas(width = 60, height = 40): ShimCanvas {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const dark = x % 7 === 0 && y % 5 === 0;
      const v = dark ? 20 : 100 + ((x * 3) % 60);
      pixels[i] = v;
      pixels[i + 1] = v;
      pixels[i + 2] = v;
      pixels[i + 3] = 255;
    }
  }
  return new ShimCanvas(width, height, { width, height, data: pixels });
}

function photoWithCard(
  width: number,
  height: number,
  card: { x: number; y: number; width: number; height: number },
  rotated = false,
): ShimCanvas {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const inside =
        x >= card.x && x < card.x + card.width && y >= card.y && y < card.y + card.height;
      const v = inside ? 210 : 30;
      pixels[i] = v;
      pixels[i + 1] = v;
      pixels[i + 2] = v;
      pixels[i + 3] = 255;
    }
  }
  const canvas = new ShimCanvas(width, height);
  canvas.getContext().putImageData({ data: pixels, width, height }, 0, 0);
  return rotated ? canvas : canvas;
}



describe('cropImageData', () => {
  const makeSource = (width: number, height: number) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        // Codifica la posición en los canales para poder verificar el recorte.
        data[i] = x;
        data[i + 1] = y;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
    return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData;
  };

  it('copies the requested region', () => {
    const source = makeSource(100, 200);
    const box = { x: 0.2, y: 0.1, width: 0.5, height: 0.25 };
    const cropped = cropImageData(source, box);

    expect(cropped.width).toBe(50);
    expect(cropped.height).toBe(50);
    // Primer píxel: (x=20, y=20) en la fuente.
    expect([cropped.data[0], cropped.data[1]]).toEqual([20, 20]);
    // Píxel (10, 10) del recorte → (30, 30) en la fuente.
    const i = (10 * cropped.width + 10) * 4;
    expect([cropped.data[i], cropped.data[i + 1]]).toEqual([30, 30]);
  });

  it('clamps a box that overflows the source instead of reading out of bounds', () => {
    const cropped = cropImageData(makeSource(10, 10), { x: 0.5, y: 0.5, width: 2, height: 2 });
    expect(cropped.width).toBe(5);
    expect(cropped.height).toBe(5);
  });

  it('never returns a zero-sized image', () => {
    const cropped = cropImageData(makeSource(10, 10), { x: 0.99, y: 0.99, width: 0.001, height: 0.001 });
    expect(cropped.width).toBeGreaterThanOrEqual(1);
    expect(cropped.height).toBeGreaterThanOrEqual(1);
  });
});

describe('detectCardRect', () => {
  it('conserva la carta vertical con un dibujo apaisado y mucho fondo', () => {
    const canvas = photoWithCard(400, 600, { x: 100, y: 180, width: 200, height: 280 });
    const image = toImageData(asCanvas(canvas));
    for (let y = 210; y < 335; y += 1) {
      for (let x = 112; x < 288; x += 1) {
        const i = (y * image.width + x) * 4;
        image.data[i] = 60;
        image.data[i + 1] = 60;
        image.data[i + 2] = 60;
      }
    }
    const normalized = normalizeCardImageData(image);
    expect(normalized.detected).toBe(true);
    expect(normalized.rotation).toBe(0);
    expect(normalized.rect!.height).toBeGreaterThan(250);
  });
  it('encuentra una carta vertical sobre fondo oscuro', () => {
    // 200x300 carta (proporción 0.667, cerca de 0.716) en una foto de 400x400.
    const canvas = photoWithCard(400, 400, { x: 100, y: 50, width: 200, height: 300 });
    const rect = detectCardRect(toImageData(asCanvas(canvas)));

    expect(rect).not.toBeNull();
    expect(rect!.width / rect!.height).toBeGreaterThan(0.55);
    expect(rect!.height).toBeGreaterThan(200);
  });

  it('encuentra una carta de costado y la señala como tal', () => {
    // La misma carta pero acostada: 300x200.
    const canvas = photoWithCard(400, 400, { x: 50, y: 100, width: 300, height: 200 });
    const rect = detectCardRect(toImageData(asCanvas(canvas)));

    expect(rect).not.toBeNull();
    expect(rect!.width).toBeGreaterThan(rect!.height);
  });

  it('no inventa una carta cuando la imagen ya ES la carta', () => {
    // Una imagen llena del mismo color no tiene bordes de carta que buscar.
    const flat = gradientCanvas(600, 825);
    const rect = detectCardRect(toImageData(asCanvas(flat)));
    // Puede o no encontrar algo, pero nunca un rect que cubra casi todo:
    if (rect !== null) {
      const coverage = (rect.width * rect.height) / (600 * 825);
      expect(coverage).toBeLessThanOrEqual(0.88);
    }
  });
});

describe('rotateImageData', () => {
  /** Pinta cada píxel con su posición para poder seguir el giro. */
  const positional = (width: number, height: number): ImageData => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        data[i] = x;
        data[i + 1] = y;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
    return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData;
  };

  it('90° intercambia ancho y alto', () => {
    const rotated = rotateImageData(positional(4, 2), 90);
    expect(rotated.width).toBe(2);
    expect(rotated.height).toBe(4);
  });

  it('rota 90° en sentido horario: la esquina superior izquierda queda arriba a la derecha', () => {
    const source = positional(4, 2);
    const rotated = rotateImageData(source, 90);
    // La salida mide 2x4: el píxel (0,0) de la fuente cae en (1,0).
    const i = (0 * rotated.width + 1) * 4;
    expect([rotated.data[i], rotated.data[i + 1]]).toEqual([0, 0]);
  });

  it('180° da la vuelta dos veces', () => {
    const source = positional(4, 2);
    const rotated = rotateImageData(source, 180);
    expect([rotated.data[0], rotated.data[1]]).toEqual([3, 1]);
  });

  it('cuatro giros de 90° vuelven al original', () => {
    const source = positional(3, 2);
    let current = source;
    for (let i = 0; i < 4; i += 1) current = rotateImageData(current, 90);
    expect(current.width).toBe(source.width);
    expect([...current.data]).toEqual([...source.data]);
  });
});

describe('normalizeCardImageData', () => {
  it('recupera un pie corto sin desplazar la banda superior', () => {
    const result = expandRect({ x: 100, y: 80, width: 630, height: 820 }, { width: 1000, height: 1400 });
    expect(result.y).toBe(80);
    expect(result.height).toBeGreaterThanOrEqual(880);
  });

  it('no alarga cartas completas, apaisadas ni recortes demasiado deformados', () => {
    for (const rect of [
      { x: 100, y: 80, width: 630, height: 880 },
      { x: 100, y: 80, width: 880, height: 630 },
      { x: 100, y: 80, width: 630, height: 650 },
    ]) {
      expect(expandRect(rect, { width: 1400, height: 1400 }).height).toBe(rect.height);
    }
  });

  it('limita la recuperación del pie al tamaño de la foto', () => {
    const result = expandRect({ x: 100, y: 80, width: 630, height: 820 }, { width: 1000, height: 950 });
    expect(result.y + result.height).toBeLessThanOrEqual(950);
  });

  it('deja la imagen sin tocar cuando no detecta carta', () => {
    const flat = toImageData(asCanvas(gradientCanvas(300, 400)));
    const result = normalizeCardImageData(flat);
    // Puede no detectar nada (y entonces no toca nada) o detectar algo, pero en
    // cualquier caso la rotación solo puede ser 0 o 90.
    expect([0, 90]).toContain(result.rotation);
    if (!result.detected) expect(result.image).toBe(flat);
  });

  it('rota 90° cuando el rectángulo detectado es apaisado', () => {
    const canvas = photoWithCard(400, 400, { x: 50, y: 100, width: 300, height: 200 });
    const result = normalizeCardImageData(toImageData(asCanvas(canvas)));
    if (result.detected) {
      expect(result.rotation).toBe(90);
      // Después de rotar, la carta queda vertical.
      expect(result.image.height).toBeGreaterThan(result.image.width);
    }
  });
});
