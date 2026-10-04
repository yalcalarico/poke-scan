/** Detección, recorte y orientación de cartas para el reconocimiento visual. */

export type ImageInput = ImageData | HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;

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
const PEAK_COUNT = 12;
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
function sideCoherence(gray: Float32Array, stride: number, edge: number, start: number, length: number, vertical: boolean): number {
  let count = 0;
  for (let offset = 1; offset < length; offset += 1) {
    const x = vertical ? edge : start + offset;
    const y = vertical ? start + offset : edge;
    const i = y * stride + x;
    const step = vertical ? 1 : stride;
    if (Math.abs(gray[i + step]! - gray[i - step]!) > EDGE_THRESHOLD) count += 1;
  }
  // El fondo ajeno a la carta no debe penalizar sus bordes completos.
  return count / Math.max(1, length - 1);
}

export function detectCardRect(imageData: ImageData): CardRect | null {
  const scale = Math.min(1, SEARCH_WIDTH / imageData.width);
  if (scale <= 0) return null;
  const small = scale < 1 ? downscale(imageData, SEARCH_WIDTH) : { ...imageData, data: imageData.data };
  const { columns, rows } = edgeProjections(small);
  const gray = luminance(small);
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
            sideCoherence(gray, small.width, left, top, height, true),
            sideCoherence(gray, small.width, right, top, height, true),
            sideCoherence(gray, small.width, top, left, width, false),
            sideCoherence(gray, small.width, bottom, left, width, false),
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

/** Limita el recorte a 1400 px para acotar el payload sin perder detalles. */
const MAX_CARD_EDGE = 1400;

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
