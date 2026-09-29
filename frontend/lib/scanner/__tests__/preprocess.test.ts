import { describe, expect, it } from 'vitest';

import {
  adaptiveThreshold,
  autoContrast,
  edgeSharpness,
  increaseContrast,
  toGrayscale,
  variance,
} from '../preprocess';

/** `ImageData` is a browser global; the pixel math only needs this shape. */
function makeImageData(width: number, height: number, paint: (x: number, y: number) => number[]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a = 255] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData;
}

const pixelAt = (img: ImageData, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

describe('toGrayscale', () => {
  it('collapses the channels using Rec. 601 luma', () => {
    const img = makeImageData(1, 1, () => [255, 0, 0]);
    toGrayscale(img);
    expect(pixelAt(img, 0, 0)[0]).toBe(pixelAt(img, 0, 0)[1]);
    expect(pixelAt(img, 0, 0)[0]).toBe(pixelAt(img, 0, 0)[2]);
    expect(pixelAt(img, 0, 0)[0]).toBe(76); // 255 * 0.299
  });

  it('maps pure white and pure black to the extremes', () => {
    const white = makeImageData(1, 1, () => [255, 255, 255]);
    const black = makeImageData(1, 1, () => [0, 0, 0]);
    toGrayscale(white);
    toGrayscale(black);
    expect(pixelAt(white, 0, 0)[0]).toBe(255);
    expect(pixelAt(black, 0, 0)[0]).toBe(0);
  });

  it('mutates in place and does not throw on a large image', () => {
    const img = makeImageData(40, 40, (x, y) => [x * 6, y * 6, 128]);
    toGrayscale(img);
    expect(img.data.length).toBe(40 * 40 * 4);
  });
});

describe('increaseContrast', () => {
  it('pushes values away from the mid grey pivot', () => {
    const img = makeImageData(2, 1, (x) => (x === 0 ? [200, 200, 200] : [55, 55, 55]));
    increaseContrast(img, 2);
    expect(pixelAt(img, 0, 0)[0]).toBe(255); // 200 -> 272.5 -> clipped
    expect(pixelAt(img, 1, 0)[0]).toBe(0); // 55 -> -17.5 -> clipped
  });

  it('is a no-op with factor 1', () => {
    const img = makeImageData(1, 1, () => [120, 130, 140]);
    increaseContrast(img, 1);
    expect(pixelAt(img, 0, 0)).toEqual([120, 130, 140]);
  });

  it('keeps pure black and pure white anchored', () => {
    const img = makeImageData(2, 1, (x) => (x === 0 ? [0, 0, 0] : [255, 255, 255]));
    increaseContrast(img, 3);
    expect(pixelAt(img, 0, 0)[0]).toBe(0);
    expect(pixelAt(img, 1, 0)[0]).toBe(255);
  });
});

describe('autoContrast', () => {
  it('stretches the histogram to the full range', () => {
    const img = makeImageData(3, 1, (x) => [100 + x * 20, 100 + x * 20, 100 + x * 20]);
    autoContrast(img);
    expect(pixelAt(img, 0, 0)[0]).toBe(0);
    expect(pixelAt(img, 2, 0)[0]).toBe(255);
    // Monotonic: no channel inversion.
    expect(pixelAt(img, 1, 0)[0]).toBeGreaterThan(pixelAt(img, 0, 0)[0]);
  });

  it('is a no-op for a flat image', () => {
    const img = makeImageData(4, 4, () => [77, 77, 77]);
    autoContrast(img);
    expect(pixelAt(img, 0, 0)[0]).toBe(77);
  });

  it('increases the variance of a low-contrast image', () => {
    const paint = (x: number, y: number) => {
      const v = 120 + ((x + y) % 5);
      return [v, v, v];
    };
    const before = makeImageData(20, 20, paint);
    const after = makeImageData(20, 20, paint);
    const beforeVariance = variance(before);
    autoContrast(after);
    expect(variance(after)).toBeGreaterThan(beforeVariance);
  });
});

describe('variance', () => {
  it('is 0 for a flat image and positive for a textured one', () => {
    const flat = makeImageData(8, 8, () => [10, 10, 10]);
    const noisy = makeImageData(8, 8, (x, y) => [(x * 30) % 255, (y * 30) % 255, 128]);
    expect(variance(flat)).toBe(0);
    expect(variance(noisy)).toBeGreaterThan(0);
  });
});

describe('edgeSharpness', () => {
  it('scales with the contrast of the edges (total gradient energy)', () => {
    const step = (jump: number) =>
      makeImageData(32, 32, (x) => (x < 16 ? [0, 0, 0] : [jump, jump, jump]));

    // A washed-out / out-of-focus frame has far less gradient energy than a
    // properly contrasted one, which is what the variant picker relies on.
    expect(edgeSharpness(step(255))).toBeGreaterThan(edgeSharpness(step(40)));
    expect(edgeSharpness(step(40))).toBeGreaterThan(edgeSharpness(step(10)));
  });

  it('is 0 for a flat image and for degenerate sizes', () => {
    const flat = makeImageData(8, 8, () => [50, 50, 50]);
    expect(edgeSharpness(flat)).toBe(0);
    const tiny = makeImageData(1, 1, () => [0, 0, 0]);
    expect(edgeSharpness(tiny)).toBe(0);
  });

  it('is symmetric under horizontal mirroring', () => {
    const paint = (x: number) => [(x * 17) % 256, (x * 31) % 256, (x * 7) % 256];
    const a = makeImageData(24, 24, (x, y) => paint(x + y));
    const b = makeImageData(24, 24, (x, y) => paint(23 - x + y));
    expect(edgeSharpness(a)).toBeCloseTo(edgeSharpness(b), 5);
  });

  it('binarization of a low-contrast frame increases the measured sharpness', () => {
    const paint = (x: number, y: number) => {
      const v = 90 + ((x > 12 ? 45 : 0) + ((y * 3) % 20));
      return [v, v, v];
    };
    const raw = makeImageData(32, 32, paint);
    const binary = makeImageData(32, 32, paint);
    toGrayscale(binary);
    adaptiveThreshold(binary, 9, 6);
    expect(edgeSharpness(binary)).toBeGreaterThan(edgeSharpness(raw));
  });
});

describe('adaptiveThreshold', () => {
  it('produces a fully binarized image (only 0 and 255)', () => {
    const img = makeImageData(40, 40, (x, y) => {
      const v = 60 + ((x * y) % 180);
      return [v, v, v];
    });
    adaptiveThreshold(img, 8, 10);
    for (let i = 0; i < img.data.length; i += 4) {
      expect([0, 255]).toContain(img.data[i]);
      expect(img.data[i]).toBe(img.data[i + 1]);
      expect(img.data[i + 1]).toBe(img.data[i + 2]);
    }
  });

  it('is immune to an illumination gradient that a global threshold would fall for', () => {
    // Background ramps 40 -> 120 (glare), with dark "text" strokes and a
    // uniform bright square. A global threshold at 128 would erase every
    // stroke on the bright half of the ramp; local thresholding must not.
    const width = 60;
    const height = 40;
    const ramp = (x: number) => 40 + (x / (width - 1)) * 160;
    const isStroke = (x: number, y: number) => y % 6 === 0 && x % 3 === 0;
    const isSquare = (x: number, y: number) => x >= 20 && x <= 30 && y >= 25 && y <= 35;

    const local = makeImageData(width, height, (x, y) => {
      let v = isSquare(x, y) ? 210 : ramp(x);
      if (isStroke(x, y)) v -= 45;
      return [v, v, v];
    });
    adaptiveThreshold(local, 9, 6);

    // Strokes become black on both ends of the gradient. At x=54 the background
    // is ~186 and the stroke ~141, so a global threshold at 128 would have lost
    // the stroke entirely: exactly the failure we are avoiding.
    expect(pixelAt(local, 3, 6)[0]).toBe(0);
    expect(pixelAt(local, 54, 6)[0]).toBe(0);
    // Flat background becomes white regardless of its absolute brightness.
    expect(pixelAt(local, 2, 20)[0]).toBe(255);
    expect(pixelAt(local, 57, 20)[0]).toBe(255);
    // A uniform bright square stays white (a plain mean threshold would turn it
    // into a black blob).
    expect(pixelAt(local, 25, 30)[0]).toBe(255);
  });

  it('does not throw on an empty or tiny image', () => {
    const img = makeImageData(0, 0, () => [0, 0, 0]);
    expect(() => adaptiveThreshold(img)).not.toThrow();
    const tiny = makeImageData(2, 2, () => [120, 120, 120]);
    expect(() => adaptiveThreshold(tiny, 25, 8)).not.toThrow();
  });
});
