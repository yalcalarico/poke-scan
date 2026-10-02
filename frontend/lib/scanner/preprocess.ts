/**
 * Image pre-processing for OCR.
 *
 * All of the pixel math works on `ImageData` in-place and is DOM-free (it only
 * touches the typed array), so it is unit-testable in Node. The canvas helpers
 * at the bottom are the only part that needs a browser canvas.
 */

export type ImageInput = ImageData | HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;

export const DEFAULT_BLOCK_SIZE = 25;
export const DEFAULT_C = 8;

function isImageData(value: ImageInput): value is ImageData {
  return (
    typeof ImageData !== 'undefined'
    ? value instanceof ImageData
    : typeof (value as ImageData).data !== 'undefined' &&
        typeof (value as ImageData).width === 'number' &&
        typeof (value as ImageData).height === 'number'
  );
}

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

function isCanvasLike(value: ImageInput): value is CanvasLike {
  return typeof (value as CanvasLike).getContext === 'function';
}

function getContext2d(source: CanvasLike): CanvasRenderingContext2D {
  const ctx = source.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('No se pudo obtener el contexto 2D de la imagen.');
  return ctx;
}

function createCanvas(width: number, height: number): CanvasLike {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  throw new Error('No hay canvas disponible en este entorno.');
}

/** Normalizes any supported input into an `ImageData` (canvas/image: read, ImageData: cloned). */
export function toImageData(source: ImageInput): ImageData {
  if (isImageData(source)) {
    return new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
  }
  if (isCanvasLike(source)) {
    return getContext2d(source).getImageData(0, 0, source.width, source.height);
  }

  const image = source as HTMLImageElement;
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('La imagen todavía no está cargada.');

  const canvas = createCanvas(width, height);
  getContext2d(canvas).drawImage(image, 0, 0, width, height);
  return getContext2d(canvas).getImageData(0, 0, width, height);
}

export function toGrayscale(imageData: ImageData): void {
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    // Rec. 601 luma, the weighting Tesseract's binarizer is happiest with.
    const gray = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    const value = gray < 0 ? 0 : gray > 255 ? 255 : gray;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
}

/** `factor` > 1 increases contrast around the mid grey pivot. */
export function increaseContrast(imageData: ImageData, factor: number): void {
  if (!Number.isFinite(factor) || factor <= 0) return;
  const { data } = imageData;
  const pivot = 127.5;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      const value = (data[i + c] - pivot) * factor + pivot;
      data[i + c] = value < 0 ? 0 : value > 255 ? 255 : value;
    }
  }
}

/** Stretches the histogram to the full 0..255 range (per channel, in place). */
export function autoContrast(imageData: ImageData): void {
  const { data } = imageData;

  for (let channel = 0; channel < 3; channel += 1) {
    let min = 255;
    let max = 0;
    for (let i = channel; i < data.length; i += 4) {
      const value = data[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (max <= min) continue;
    const scale = 255 / (max - min);
    for (let i = channel; i < data.length; i += 4) {
      data[i] = (data[i] - min) * scale;
    }
  }
}

function toLuminance(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData;
  const lum = new Float32Array(width * height);
  for (let p = 0, i = 0; p < lum.length; p += 1, i += 4) {
    lum[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  return lum;
}

/** Local mean and standard deviation per block, computed with integral images. */
function localStats(
  lum: Float32Array,
  width: number,
  height: number,
  blockSize: number,
): { means: Float32Array; stdDevs: Float32Array } {
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  const integralSq = new Float64Array(stride * (height + 1));

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    let rowSumSq = 0;
    for (let x = 0; x < width; x += 1) {
      const value = lum[y * width + x];
      rowSum += value;
      rowSumSq += value * value;
      integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum;
      integralSq[(y + 1) * stride + (x + 1)] = integralSq[y * stride + (x + 1)] + rowSumSq;
    }
  }

  const half = Math.max(1, Math.floor(blockSize / 2));
  const means = new Float32Array(width * height);
  const stdDevs = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width - 1, x + half);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * stride + (x1 + 1)] -
        integral[y0 * stride + (x1 + 1)] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0];
      const sumSq =
        integralSq[(y1 + 1) * stride + (x1 + 1)] -
        integralSq[y0 * stride + (x1 + 1)] -
        integralSq[(y1 + 1) * stride + x0] +
        integralSq[y0 * stride + x0];

      const mean = sum / area;
      const varianceValue = Math.max(0, sumSq / area - mean * mean);
      means[y * width + x] = mean;
      stdDevs[y * width + x] = Math.sqrt(varianceValue);
    }
  }

  return { means, stdDevs };
}

const SAUVOLA_K = 0.2;
const SAUVOLA_R = 128;

/**
 * Sauvola local thresholding: every pixel is thresholded against the mean and
 * the standard deviation of its neighbourhood, minus the `c` bias.
 *
 * Flat neighbourhoods (any absolute brightness) turn white, while text
 * neighbourhoods (high local deviation) threshold close to their own mean. That
 * is what makes holo cards work: their specular glare moves the background
 * brightness by 100+ levels, which destroys a single global threshold, but it
 * barely changes the local deviation.
 */
export function adaptiveThreshold(
  imageData: ImageData,
  blockSize: number = DEFAULT_BLOCK_SIZE,
  c: number = DEFAULT_C,
): void {
  const { data, width, height } = imageData;
  if (!width || !height) return;

  const lum = toLuminance(imageData);
  const { means, stdDevs } = localStats(lum, width, height, blockSize);

  for (let p = 0, i = 0; p < lum.length; p += 1, i += 4) {
    const localThreshold = Math.max(0, means[p] * (1 + SAUVOLA_K * (stdDevs[p] / SAUVOLA_R - 1)) - c);
    const value = lum[p] > localThreshold ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
}

/** Mean of the per-channel variance of the colour image (0 for a flat image). */
export function variance(imageData: ImageData): number {
  const { data, width, height } = imageData;
  const pixels = width * height;
  if (!pixels) return 0;

  let total = 0;
  for (let c = 0; c < 3; c += 1) {
    let sum = 0;
    let sumSq = 0;
    for (let i = c; i < data.length; i += 4) {
      const value = data[i];
      sum += value;
      sumSq += value * value;
    }
    total += sumSq / pixels - (sum / pixels) ** 2;
  }
  return total / 3;
}

/**
 * Sum of absolute horizontal + vertical luminance differences, normalised by
 * pixel count. Higher = crisper edges.
 *
 * Caveat: this is *not* comparable across variants with different dynamic
 * range. A binarized image maximises it by construction (every transition jumps
 * the full 0-255), so it always wins the comparison. Use
 * `normalizedEdgeSharpness` to compare variants.
 */
export function edgeSharpness(imageData: ImageData): number {
  const { width, height } = imageData;
  if (width < 2 || height < 2) return 0;
  const lum = toLuminance(imageData);

  let total = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 1; x < width; x += 1) {
      total += Math.abs(lum[row + x] - lum[row + x - 1]);
    }
  }
  for (let y = 1; y < height; y += 1) {
    const row = y * width;
    const prev = row - width;
    for (let x = 0; x < width; x += 1) {
      total += Math.abs(lum[row + x] - lum[prev + x]);
    }
  }
  return total / (width * height);
}

function luminanceStdDev(imageData: ImageData): number {
  const lum = toLuminance(imageData);
  let sum = 0;
  for (let i = 0; i < lum.length; i += 1) sum += lum[i];
  const mean = sum / (lum.length || 1);
  let sumSq = 0;
  for (let i = 0; i < lum.length; i += 1) sumSq += (lum[i] - mean) ** 2;
  return Math.sqrt(sumSq / (lum.length || 1));
}

/**
 * Edge energy relative to the contrast actually available in the image, i.e.
 * the fraction of the dynamic range that each pixel step crosses. This is the
 * only version of the metric that can rank variants of different contrast
 * against each other.
 */
export function normalizedEdgeSharpness(imageData: ImageData): number {
  const stdDev = luminanceStdDev(imageData);
  if (stdDev < 1e-6) return 0;
  return edgeSharpness(imageData) / stdDev;
}

export type PreprocessVariant = 'original' | 'grayscale' | 'threshold';

export const VARIANT_ORDER: PreprocessVariant[] = ['original', 'grayscale', 'threshold'];

/** Variant used when no other one wins by a clear margin. */
export const DEFAULT_VARIANT: PreprocessVariant = 'grayscale';

/**
 * Dónde vive el nombre de la carta, en fracciones del ancho y del alto.
 *
 * No es una variante de píxeles sino una región, por eso vive aparte de
 * `VARIANT_ORDER`: `applyVariant` transforma la imagen entera del mismo tamaño.
 *
 * Medido en las 8 cartas de la muestra (Base, HGSS, BW, PL, Neo, XY, SM) con
 * Tesseract real: OCRear **solo esta franja** lee el nombre correcto 8/8,
 * mientras que la carta completa lo pierde. La causa es la segmentación
 * automática de página de Tesseract sobre el layout de una carta: los bloques
 * grandes de texto (poder, ataques, flavor) se leen perfecto y se comen la
 * línea chica del nombre, que va en tipografía estilizada sobre el arte. Por eso
 * ampliar la carta entera no arregla nada y recortarla sí.
 *
 * El margen de 2% es para no cortar la línea: el borde superior de la carta es
 * suele ser del mismo color que el marco.
 */
export const NAME_BAND_BOX = {
  x: 0.02,
  y: 0.02,
  width: 0.58,
  height: 0.11,
} as const;

/**
 * Relative edge-energy gain a variant needs over the default to be selected.
 *
 * Tuned on the 8-card sample: with a 5% margin the selector abandons the safe
 * default for the binarized variant on 7/8 cards and only reads 4/8 names
 * right; at 25% it keeps the default and reads 7/8. Small sample, so treat it
 * as a starting point, not a law.
 */
export const VARIANT_MARGIN = 0.25;

/** Applies a pre-processing variant in place. Pure pixel math, no DOM. */
export function applyVariant(imageData: ImageData, variant: PreprocessVariant): ImageData {
  switch (variant) {
    case 'original':
      return imageData;
    case 'grayscale':
      toGrayscale(imageData);
      autoContrast(imageData);
      increaseContrast(imageData, 1.4);
      return imageData;
    case 'threshold':
      toGrayscale(imageData);
      adaptiveThreshold(imageData);
      return imageData;
  }
}

function copyCanvas(source: CanvasLike): CanvasLike {
  const canvas = createCanvas(source.width, source.height);
  getContext2d(canvas).drawImage(source, 0, 0);
  return canvas;
}

/** Applies a variant to any supported input and returns a new canvas with it. */
export function renderVariant(source: ImageInput, variant: PreprocessVariant): HTMLCanvasElement {
  const base = toImageData(source);
  const data = new ImageData(
    new Uint8ClampedArray(base.data),
    base.width,
    base.height,
  );
  applyVariant(data, variant);
  const canvas = createCanvas(base.width, base.height) as HTMLCanvasElement;
  getContext2d(canvas).putImageData(data, 0, 0);
  return canvas;
}

/**
 * Recorta una región de la imagen. Pixel math puro, sin DOM, para poder
 * testearlo en node.
 *
 * El recorte se acota a los bordes de la imagen: una caja más grande que la
 * fuente no debe inventar píxeles ni desbordar los índices.
 */
export function cropImageData(
  imageData: ImageData,
  box: { x: number; y: number; width: number; height: number },
): ImageData {
  const sx = Math.max(0, Math.min(imageData.width - 1, Math.round(imageData.width * box.x)));
  const sy = Math.max(0, Math.min(imageData.height - 1, Math.round(imageData.height * box.y)));
  const width = Math.max(
    1,
    Math.min(imageData.width - sx, Math.round(imageData.width * box.width)),
  );
  const height = Math.max(
    1,
    Math.min(imageData.height - sy, Math.round(imageData.height * box.height)),
  );

  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const source = ((sy + y) * imageData.width + sx) * 4;
    data.set(imageData.data.subarray(source, source + width * 4), y * width * 4);
  }
  return new ImageData(data, width, height);
}

/**
 * Canvas con solo la franja del nombre.
 *
 * `variant` es el pre-procesado de los píxeles de la franja (no su recorte). La
 * banda se pasa más de una vez porque **no hay un pre-procesado que sirva para
 * todas las cartas**: medido sobre 5 fotos reales de la colección 30th
 * Celebration, la banda cruda lee "Umbreon" y no "Chandelure"; la banda con
 * threshold lee "Chandelure" y no "Umbreon". Son la misma banda, distinto
 * pre-procesado, y el nombre cambia. Ver `NAME_BAND_VARIANTS` en ./pipeline.
 */
export function renderNameBand(
  source: ImageInput,
  variant: PreprocessVariant = 'original',
): HTMLCanvasElement {
  const band = cropImageData(toImageData(source), NAME_BAND_BOX);
  applyVariant(band, variant);
  const canvas = createCanvas(band.width, band.height) as HTMLCanvasElement;
  getContext2d(canvas).putImageData(band, 0, 0);
  return canvas;
}

// ─── Detección de la carta ────────────────────────────────────────────────

/** 63 × 88 mm: la proporción de una carta Pokémon. */
export const CARD_ASPECT = 63 / 88;
/** Margen de error aceptable sobre esa proporción antes de rechazar el rect. */
const ASPECT_TOLERANCE = 0.3;
/**
 * Un rect que cubre más de esto es la propia imagen: no hay nada que recortar.
 * Sirve para no romper el camino de la cámara (donde `captureFrame` ya cortó al
 * marco guía) ni los fixtures, que ya son la carta entera.
 */
const MAX_COVERAGE = 0.88;
const MIN_COVERAGE = 0.08;
/** Ancho al que se reduce la imagen para buscar el rectángulo. */
const SEARCH_WIDTH = 180;
const EDGE_THRESHOLD = 24;
const PEAK_COUNT = 7;
const PEAK_MIN_SEPARATION = 0.04;
/** Fracción mínima del lado que tiene que ser borde recto para contar como tal. */
const MIN_SIDE_COHERENCE = 0.5;
/** Cuánto se agranda el rectángulo en horizontal, para no cortar el nombre. */
const RECT_MARGIN = 0.06;

export interface CardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedCard {
  image: ImageData;
  /** `null` cuando no se encontró una carta y la imagen se usa como está. */
  rect: CardRect | null;
  /** Grados de rotación aplicados para dejar la carta en vertical. */
  rotation: 0 | 90 | 180 | 270;
  detected: boolean;
}

/** Luminancia de cada píxel, en un array de la misma área. */
function luminance(imageData: ImageData): Float32Array {
  const out = new Float32Array(imageData.width * imageData.height);
  const { data } = imageData;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    // Rec. 601, el mismo peso que usa toGrayscale.
    out[p] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }
  return out;
}

/** Reduce la imagen a `width` con promediado por caja (sin dependencias). */
function downscale(imageData: ImageData, width: number): ImageData {
  const scale = width / imageData.width;
  const height = Math.max(1, Math.round(imageData.height * scale));
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor((y * imageData.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * imageData.height) / height));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor((x * imageData.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * imageData.width) / width));
      let sum = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * imageData.width + sx) * 4;
          sum += 0.299 * imageData.data[i]! + 0.587 * imageData.data[i + 1]! + 0.114 * imageData.data[i + 2]!;
          count += 1;
        }
      }
      const value = sum / count;
      const i = (y * width + x) * 4;
      out[i] = value;
      out[i + 1] = value;
      out[i + 2] = value;
      out[i + 3] = 255;
    }
  }
  return new ImageData(out, width, height);
}

/**
 * Fuerza y coherencia de los bordes de la imagen: dos proyecciones.
 *
 * - `columns[x]`: bordes **verticales** en la columna x. Son los lados
 *   izquierdo y derecho de la carta.
 * - `rows[y]`: bordes **horizontales** en la fila y. Son los bordes superior e
 *   inferior.
 *
 * Cada proyección viene en dos partes: la suma de intensidades y cuántas filas (o
 * columnas) superaron el umbral. La **coherencia** (la proporción del lado que
 * tiene borde) es lo que separa una funda de carta de las rayas curvas de una
 * frazada: un borde recto está a lo largo de todo el lado, una curva de la tela
 * solo en un tramo.
 */
function edgeProjections(imageData: ImageData): {
  columns: Float32Array;
  rows: Float32Array;
  columnCoherence: Float32Array;
  rowCoherence: Float32Array;
} {
  const { width, height } = imageData;
  const gray = luminance(imageData);
  const columns = new Float32Array(width);
  const rows = new Float32Array(height);
  const columnCount = new Float32Array(width);
  const rowCount = new Float32Array(height);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const dx = Math.abs(gray[i + 1]! - gray[i - 1]!);
      const dy = Math.abs(gray[i + width]! - gray[i - width]!);
      if (dx > EDGE_THRESHOLD) {
        columns[x] = columns[x]! + dx;
        columnCount[x] = columnCount[x]! + 1;
      }
      if (dy > EDGE_THRESHOLD) {
        rows[y] = rows[y]! + dy;
        rowCount[y] = rowCount[y]! + 1;
      }
    }
  }

  // Coherencia 0..1 de cada línea candidata.
  const columnCoherence = new Float32Array(width);
  const rowCoherence = new Float32Array(height);
  for (let x = 0; x < width; x += 1) columnCoherence[x] = columnCount[x]! / (height - 2);
  for (let y = 0; y < height; y += 1) rowCoherence[y] = rowCount[y]! / (width - 2);

  return { columns, rows, columnCoherence, rowCoherence };
}

/**
 * Promedia los 3 valores más altos de 4, ignorando el peor.
 *
 * Se usa para la coherencia de los lados del rectángulo de la carta: sobre una
 * superficie oscura siempre hay un lado sin contraste, y que ese lado solo
 * sozpe la media hundía la detección de cartas que se detectan bien.
 */
function bestThree(values: number[]): number {
  const sorted = [...values].sort((a, b) => b - a);
  return (sorted[0]! + sorted[1]! + sorted[2]!) / 3;
}

/** Índices de los picos más altos, con separación mínima entre ellos. */
function topPeaks(values: Float32Array, count: number, minSeparation: number): number[] {
  const order = [...values.keys()].sort((a, b) => values[b]! - values[a]!);
  const peaks: number[] = [];
  for (const index of order) {
    if (values[index]! <= 0) break;
    if (peaks.some((p) => Math.abs(p - index) < minSeparation)) continue;
    peaks.push(index);
    if (peaks.length >= count) break;
  }
  return peaks;
}

/** Qué tan parejo es un rect a la proporción de una carta (1 = perfecto). */
function aspectFactor(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0;
  const aspect = width / height;
  const nearPortrait = Math.abs(aspect - CARD_ASPECT) / CARD_ASPECT;
  const nearLandscape = Math.abs(aspect - 1 / CARD_ASPECT) * CARD_ASPECT;
  const deviation = Math.min(nearPortrait, nearLandscape);
  if (deviation > ASPECT_TOLERANCE) return 0;
  return 1 - deviation / ASPECT_TOLERANCE;
}

/**
 * Busca el rectángulo de la carta en la foto.
 *
 * La carta es un rectángulo de bordes nítidos con una proporción conocida, así
 * que el método es de puro clásico: se proyectan los bordes, se toman los picos
 * más fuertes de cada eje y se prueba cada combinación como candidato. Gana el
 * que tiene los cuatro lados más "lisos" y la proporción más cercana a la de una
 * carta.
 *
 * No es ML ni magic: son 4 líneas y una restricción de proporción. Y es
 * opcional —si no encuentra nada con confianza, `normalizeCardImageData`
 * devuelve la imagen sin tocar, que es lo que pasa con las fotos de estudio y
 * con la cámara (donde el recorte ya lo hizo `captureFrame`).
 */
export function detectCardRect(imageData: ImageData): CardRect | null {
  const scale = Math.min(1, SEARCH_WIDTH / imageData.width);
  if (scale <= 0) return null;
  const small = scale < 1 ? downscale(imageData, SEARCH_WIDTH) : { ...imageData, data: imageData.data };
  const { columns, rows, columnCoherence, rowCoherence } = edgeProjections(small);
  const colPeaks = topPeaks(columns, PEAK_COUNT, small.width * PEAK_MIN_SEPARATION);
  const rowPeaks = topPeaks(rows, PEAK_COUNT, small.height * PEAK_MIN_SEPARATION);
  if (colPeaks.length < 2 || rowPeaks.length < 2) return null;

  let best: { rect: CardRect; score: number } | null = null;

  for (let ci = 0; ci < colPeaks.length; ci += 1) {
    for (let cj = ci + 1; cj < colPeaks.length; cj += 1) {
      const left = Math.min(colPeaks[ci]!, colPeaks[cj]!);
      const right = Math.max(colPeaks[ci]!, colPeaks[cj]!);
      const width = right - left;
      if (width < small.width * 0.1) continue;

      for (let ri = 0; ri < rowPeaks.length; ri += 1) {
        for (let rj = ri + 1; rj < rowPeaks.length; rj += 1) {
          const top = Math.min(rowPeaks[ri]!, rowPeaks[rj]!);
          const bottom = Math.max(rowPeaks[ri]!, rowPeaks[rj]!);
          const height = bottom - top;
          if (height < small.height * 0.1) continue;

          const shape = aspectFactor(width, height);
          if (shape === 0) continue;

          const area = (width * height) / (small.width * small.height);
          if (area < MIN_COVERAGE || area > MAX_COVERAGE) continue;

          // Los cuatro lados tienen que ser líneas rectas y completas: la
          // coherencia de cada lado (qué fracción de él tiene borde) es lo que
          // descarta las rayas curvas de una frazada de fondo.
          //
          // Se promedian **los 3 mejores**, no los 4: una funda apoyada sobre
          // una surface oscura siempre pierde uno o dos lados (el de abajo se
          // funde con la sombra), y con la media de los 4 esa carta no se
          // detectaba nunca. Exigir 3 de 4 sigue descartando el ruido —un pliegue
          // de la frazada es parejo en 0-2 lados, no en 3— sin bajar el umbral.
          const sides = bestThree([
            columnCoherence[left]!,
            columnCoherence[right]!,
            rowCoherence[top]!,
            rowCoherence[bottom]!,
          ]);
          if (sides < MIN_SIDE_COHERENCE) continue;

          // Intensidad del borde, normalizada, para desempatar candidatos con la
          // misma coherencia.
          const strength = Math.min(
            1,
            ((columns[left]! + columns[right]! + rows[top]! + rows[bottom]!) /
              (2 * (width + height))) /
              EDGE_THRESHOLD,
          );

          // El término de área es el que hace que gane la carta entera y no un
          // sub-rectángulo de ella: el marco interno del arte también es un
          // rectángulo recto de proporción parecida, solo que más chico.
          const score = sides * strength * shape * Math.sqrt(area);

          if (best === null || score > best.score) {
            best = { rect: { x: left, y: top, width, height }, score };
          }
        }
      }
    }
  }

  if (best === null) return null;
  // De vuelta a la resolución original.
  return {
    x: Math.round(best.rect.x / scale),
    y: Math.round(best.rect.y / scale),
    width: Math.round(best.rect.width / scale),
    height: Math.round(best.rect.height / scale),
  };
}

/** Rota la imagen en pasos de 90°. Pixel math puro. */
export function rotateImageData(imageData: ImageData, degrees: 90 | 180 | 270): ImageData {
  const { width, height } = imageData;
  const swap = degrees === 90 || degrees === 270;
  const outWidth = swap ? height : width;
  const outHeight = swap ? width : height;
  const data = new Uint8ClampedArray(outWidth * outHeight * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let tx: number;
      let ty: number;
      if (degrees === 90) {
        tx = height - 1 - y;
        ty = x;
      } else if (degrees === 180) {
        tx = width - 1 - x;
        ty = height - 1 - y;
      } else {
        tx = y;
        ty = width - 1 - x;
      }
      const source = (y * width + x) * 4;
      const target = (ty * outWidth + tx) * 4;
      data[target] = imageData.data[source]!;
      data[target + 1] = imageData.data[source + 1]!;
      data[target + 2] = imageData.data[source + 2]!;
      data[target + 3] = imageData.data[source + 3]!;
    }
  }
  return new ImageData(data, outWidth, outHeight);
}

/**
 * Deja la imagen lista para el OCR: recorta a la carta y la pone en vertical.
 *
 * La rotación no es un detalle: **Tesseract no lee texto rotado 90°**. En las
 * fotos reales que motivaron esto la carta estaba siempre de costado, y con el
 * texto girado el OCR no lee ni el nombre ni el cuerpo. Como la proporción de
 * una carta es conocida, la orientación sale gratis del rectángulo detectado:
 * si el rect es más ancho que alto, la foto está rotada.
 */
/** Lado más largo con el que se le pasa una imagen al OCR. */
const MAX_CARD_EDGE = 1400;

/**
 * Achica la imagen para el OCR conservando el color.
 *
 * No es una optimización: es lo que hace que el OCR funcione. Las fotos de un
 * celular llegan en 4032×3024, y a ese tamaño Tesseract lee **peor**: la banda
 * del nombre de Umbreon salía "IVR" en vez de "Umbreon". Medido con las mismas
 * fotos: la misma banda leída a 1400px da el nombre perfecto. Es el tamaño de
 * letra que Tesseract espera (una carta a ~1400px tiene el nombre a ~30px de
 * alto); con 3000px la segmentación automática de página se equivoca de bloque.
 *
 * De paso las 6 pasadas del escaneo bajan de ~12s a ~2s.
 */
function capWorkingSize(imageData: ImageData): ImageData {
  const longEdge = Math.max(imageData.width, imageData.height);
  if (longEdge <= MAX_CARD_EDGE) return imageData;
  const scale = MAX_CARD_EDGE / longEdge;
  return downscaleColor(imageData, Math.max(1, Math.round(imageData.width * scale)));
}

/** Caja de 2×2 o más, por canal: promedia sin pasar a gris. */
function downscaleColor(imageData: ImageData, targetWidth: number): ImageData {
  const scale = targetWidth / imageData.width;
  const width = Math.max(1, targetWidth);
  const height = Math.max(1, Math.round(imageData.height * scale));
  const out = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor((y * imageData.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * imageData.height) / height));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor((x * imageData.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * imageData.width) / width));
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * imageData.width + sx) * 4;
          r += imageData.data[i]!;
          g += imageData.data[i + 1]!;
          b += imageData.data[i + 2]!;
          count += 1;
        }
      }
      const i = (y * width + x) * 4;
      out[i] = r / count;
      out[i + 1] = g / count;
      out[i + 2] = b / count;
      out[i + 3] = 255;
    }
  }
  return new ImageData(out, width, height);
}

export function normalizeCardImageData(imageData: ImageData): NormalizedCard {
  const found = detectCardRect(imageData);
  if (found === null) {
    return { image: capWorkingSize(imageData), rect: null, rotation: 0, detected: false };
  }
  const rect = expandRect(found, imageData);
  const cropped = cropImageData(imageData, {
    x: rect.x / imageData.width,
    y: rect.y / imageData.height,
    width: rect.width / imageData.width,
    height: rect.height / imageData.height,
  });
  const rotation = rect.width > rect.height ? 90 : 0;
  return {
    image: capWorkingSize(rotation === 0 ? cropped : rotateImageData(cropped, rotation)),
    rect,
    rotation,
    detected: true,
  };
}

/**
 * Amplía los costados y recupera un pie corto, sin salirse de la
 * imagen.
 *
 * El borde de una funda sobre una frazada oscura muchas veces no se ve, y el
 * detector termina enganchándose al marco interior del arte: el recorte salía
 * un poco apretado de los costados y **partía el nombre de la carta por la
 * izquierda**, que es justo lo que la banda del nombre no se puede perder.
 *
 * El borde superior no se mueve: la banda del nombre se ancla
 * en el borde superior de la carta (2% a 13% del alto). Probado: agrandar
 * también arriba corría la banda hacia la funda y el nombre desaparecía de las
 * tres pasadas, que es peor que un caracter clipped.
 */
export function expandRect(rect: CardRect, imageData: Pick<ImageData, 'width' | 'height'>): CardRect {
  const dx = rect.width * RECT_MARGIN;
  const x = Math.max(0, Math.round(rect.x - dx));
  const right = Math.min(imageData.width, Math.round(rect.x + rect.width + dx));
  // Un borde interior puede parecer el borde inferior. Recuperamos el alto
  // esperado sin mover el borde superior que ancla la banda del nombre.
  const expectedHeight = rect.width / CARD_ASPECT;
  const missingHeight = expectedHeight - rect.height;
  const recoverFooter = rect.height > rect.width && missingHeight > 0 &&
    missingHeight <= rect.height * 0.2;
  const height = recoverFooter ? Math.ceil(expectedHeight + rect.height * 0.01) : rect.height;
  return { x, y: rect.y, width: right - x, height: Math.min(height, imageData.height - rect.y) };
}

interface VariantResult {
  variant: PreprocessVariant;
  scores: Record<PreprocessVariant, number>;
  canvases: Map<PreprocessVariant, CanvasLike>;
}

function renderVariants(canvas: HTMLCanvasElement): VariantResult {
  const base = copyCanvas(canvas);
  const baseData = getContext2d(base).getImageData(0, 0, base.width, base.height);

  const scores = {} as Record<PreprocessVariant, number>;
  const canvases = new Map<PreprocessVariant, CanvasLike>();
  let variant: PreprocessVariant = DEFAULT_VARIANT;

  for (const current of VARIANT_ORDER) {
    const data = new ImageData(
      new Uint8ClampedArray(baseData.data),
      baseData.width,
      baseData.height,
    );
    applyVariant(data, current);

    const rendered = createCanvas(base.width, base.height);
    getContext2d(rendered).putImageData(data, 0, 0);

    canvases.set(current, rendered);
    scores[current] = normalizedEdgeSharpness(data);
    // A variant has to beat the default by a real margin, otherwise the
    // differences are just noise in the image statistic.
    if (scores[current] > scores[variant] * (1 + VARIANT_MARGIN)) variant = current;
  }

  return { variant, scores, canvases };
}

/**
 * Picks the pre-processing variant with the best contrast-normalised edge
 * energy, defaulting to `grayscale` unless another variant wins by a clear
 * margin.
 *
 * Measured on 8 real cards: raw edge energy always picks `threshold`
 * (8/8) and that is the variant that breaks the most name reads, so the
 * ranking is done on the normalized metric instead. Even so, an image statistic
 * is a weak predictor of OCR quality — see `scanCardImage` in ./pipeline, which
 * resolves the ambiguity with the OCR confidence of each variant instead.
 */
export async function sharpestOfVariants(
  canvas: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const { variant, canvases } = renderVariants(canvas);
  return canvases.get(variant) as HTMLCanvasElement;
}

/** Same as sharpestOfVariants, but also reports every score (tests/diagnostics). */
export async function analyzeVariants(canvas: HTMLCanvasElement): Promise<{
  variant: PreprocessVariant;
  scores: Record<PreprocessVariant, number>;
}> {
  const { variant, scores } = renderVariants(canvas);
  return { variant, scores };
}
