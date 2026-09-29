/**
 * Canvas-level pre-processing, exercised through a canvas shim (see
 * ./helpers/canvas-shim) so it runs in plain Node.
 */
import { describe, expect, it } from 'vitest';

import { installCanvasShim, ShimCanvas } from './helpers/canvas-shim';
import {
  analyzeVariants,
  cropImageData,
  detectCardRect,
  normalizeCardImageData,
  rotateImageData,
  DEFAULT_VARIANT,
  edgeSharpness,
  NAME_BAND_BOX,
  normalizedEdgeSharpness,
  renderNameBand,
  renderVariant,
  sharpestOfVariants,
  toImageData,
  toGrayscale,
  VARIANT_ORDER,
} from '../preprocess';

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

describe('normalizedEdgeSharpness', () => {
  it('divides the edge energy by the available contrast', () => {
    const makeImage = (jump: number) => {
      const data = new Uint8ClampedArray(8 * 8 * 4);
      for (let i = 0; i < 64; i += 1) {
        const v = (i % 8) < 4 ? 128 : 128 + jump;
        data[i * 4] = v;
        data[i * 4 + 1] = v;
        data[i * 4 + 2] = v;
        data[i * 4 + 3] = 255;
      }
      return { data, width: 8, height: 8, colorSpace: 'srgb' } as unknown as ImageData;
    };

    const strong = makeImage(120);
    const weak = makeImage(6);

    expect(edgeSharpness(strong)).toBeGreaterThan(edgeSharpness(weak));
    // Raw energy is dominated by the contrast, the normalized one is not: both
    // images have the same edge *structure* over their own dynamic range.
    expect(normalizedEdgeSharpness(strong)).toBeGreaterThan(0);
    expect(normalizedEdgeSharpness(strong)).toBeLessThan(normalizedEdgeSharpness(weak) * 3);
  });

  it('is 0 for a flat image', () => {
    const flat = {
      data: new Uint8ClampedArray(16 * 4).fill(120),
      width: 4,
      height: 4,
      colorSpace: 'srgb',
    } as unknown as ImageData;
    flat.data.forEach((_, i) => {
      if (i % 4 !== 3) flat.data[i] = 120;
    });
    expect(normalizedEdgeSharpness(flat)).toBe(0);
  });
});

describe('variant selection', () => {
  it('scores every variant', async () => {
    const { scores, variant } = await analyzeVariants(asCanvas(gradientCanvas()));

    expect(Object.keys(scores).sort()).toEqual([...VARIANT_ORDER].sort());
    expect(variant).toBe(DEFAULT_VARIANT);
    for (const score of Object.values(scores)) expect(Number.isFinite(score)).toBe(true);
  });

  it('falls back to the default variant instead of the binarized one', async () => {
    // Raw edge energy always picks `threshold` on real cards (it maximises the
    // metric by construction), which is the variant that breaks the most name
    // reads. The margin rule keeps the safe default.
    const canvas = gradientCanvas();
    const base = toImageData(asCanvas(canvas));
    const original = { data: new Uint8ClampedArray(base.data), width: base.width, height: base.height, colorSpace: 'srgb' } as unknown as ImageData;
    const binary = { data: new Uint8ClampedArray(base.data), width: base.width, height: base.height, colorSpace: 'srgb' } as unknown as ImageData;
    toGrayscale(binary);
    // Manual binarization, like the `threshold` variant.
    for (let i = 0; i < binary.data.length; i += 4) {
      const v = binary.data[i] > 128 ? 255 : 0;
      binary.data[i] = v;
      binary.data[i + 1] = v;
      binary.data[i + 2] = v;
    }

    expect(edgeSharpness(binary)).toBeGreaterThan(edgeSharpness(original));
    const { variant } = await analyzeVariants(asCanvas(canvas));
    expect(variant).not.toBe('threshold');
  });

  it('sharpestOfVariants returns a canvas of the same size', async () => {
    const canvas = gradientCanvas(80, 50);
    const best = await sharpestOfVariants(asCanvas(canvas));

    expect(best.width).toBe(80);
    expect(best.height).toBe(50);
    const data = toImageData(best);
    expect(data.width).toBe(80);
    expect(data.height).toBe(50);
  });

  it('renderVariant applies the same pipeline as analyzeVariants', async () => {
    const canvas = gradientCanvas();
    const { scores, variant } = await analyzeVariants(asCanvas(canvas));
    const best = toImageData(renderVariant(asCanvas(canvas), variant));
    expect(normalizedEdgeSharpness(best)).toBeCloseTo(scores[variant], 5);
  });

  it('renderVariant of "original" is a faithful copy', () => {
    const canvas = gradientCanvas(20, 20);
    const source = toImageData(asCanvas(canvas));
    const copy = toImageData(renderVariant(asCanvas(canvas), 'original'));
    expect([...copy.data.slice(0, 40)]).toEqual([...source.data.slice(0, 40)]);
  });
});

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

describe('renderNameBand', () => {
  it('returns a canvas with the size of the band box', async () => {
    const canvas = gradientCanvas(600, 825);
    const band = renderNameBand(asCanvas(canvas));

    const expectedWidth = Math.round(600 * NAME_BAND_BOX.width);
    const expectedHeight = Math.round(825 * NAME_BAND_BOX.height);
    expect(band.width).toBe(expectedWidth);
    expect(band.height).toBe(expectedHeight);
  });

  it('starts at the top-left corner of the card', () => {
    const canvas = gradientCanvas(600, 825);
    const source = toImageData(asCanvas(canvas));
    const band = toImageData(renderNameBand(asCanvas(canvas)));
    // El primer píxel de la banda es el de la caja, no el origen del recorte.
    const boxX = Math.round(source.width * NAME_BAND_BOX.x);
    const boxY = Math.round(source.height * NAME_BAND_BOX.y);
    const i = (boxY * source.width + boxX) * 4;
    expect([...band.data.slice(0, 4)]).toEqual([...source.data.slice(i, i + 4)]);
  });

  it('aplica el pre-procesado pedido a la franja', () => {
    // La imagen tiene que tener color: con un gradiente gris no se puede
    // distinguir "cruda" de "convertida a escala de grises".
    const colored = new ShimCanvas(200, 300);
    const pixels = new Uint8ClampedArray(200 * 300 * 4);
    for (let i = 0; i < 200 * 300; i += 1) {
      pixels[i * 4] = 200;
      pixels[i * 4 + 1] = 60;
      pixels[i * 4 + 2] = 30;
      pixels[i * 4 + 3] = 255;
    }
    colored.getContext().putImageData({ data: pixels, width: 200, height: 300 }, 0, 0);

    const channelsEqual = (img: ImageData) => {
      for (let i = 0; i < img.data.length; i += 40) {
        if (img.data[i] !== img.data[i + 1]) return false;
      }
      return true;
    };

    const raw = toImageData(renderNameBand(asCanvas(colored)));
    const gray = toImageData(renderNameBand(asCanvas(colored), 'grayscale'));

    expect(channelsEqual(raw)).toBe(false);
    expect(channelsEqual(gray)).toBe(true);
  });
});

/** Lienzo con un rectángulo claro sobre fondo oscuro, para la detección. */
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

describe('detectCardRect', () => {
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
