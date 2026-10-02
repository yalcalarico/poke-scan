import type { OcrResult } from './types';
import { applyVariant, cropImageData, toImageData, type CardRect, type ImageInput, type PreprocessVariant } from './preprocess';

/** El pie completo evita asumir que todas las eras ubican el código a la izquierda. */
export const FOOTER_BOX = { x: 0.015, y: 0.82, width: 0.97, height: 0.175 } as const;
type RegionBox = { x: number; y: number; width: number; height: number };

function sourceDimensions(source: ImageInput): { width: number; height: number } {
  if ('naturalWidth' in source && source.naturalWidth > 0 && source.naturalHeight > 0) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

function isPixelData(source: ImageInput): source is ImageData {
  return 'data' in source && source.data instanceof Uint8ClampedArray;
}

/** Dibuja sólo la zona pedida para no copiar los 12 MP de la foto original. */
function cropSourceRegion(source: ImageInput, rect: CardRect | null | undefined, region: RegionBox): ImageData {
  const { width, height } = sourceDimensions(source);
  const x = rect ? rect.x + rect.width * region.x : width * region.x;
  const y = rect ? rect.y + rect.height * region.y : height * region.y;
  const regionWidth = rect ? rect.width * region.width : width * region.width;
  const regionHeight = rect ? rect.height * region.height : height * region.height;
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(width, Math.ceil(x + regionWidth));
  const bottom = Math.min(height, Math.ceil(y + regionHeight));
  const cropWidth = Math.max(1, right - left);
  const cropHeight = Math.max(1, bottom - top);

  if (isPixelData(source)) {
    return cropImageData(source, {
      x: left / width,
      y: top / height,
      width: cropWidth / width,
      height: cropHeight / height,
    });
  }

  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar el recorte de la carta.');
  context.drawImage(source as CanvasImageSource, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return context.getImageData(0, 0, cropWidth, cropHeight);
}

export function renderFooter(source: ImageInput, variant: PreprocessVariant, rect?: CardRect | null): HTMLCanvasElement {
  // El texto pequeño pierde detalle al reducir la carta para las demás pasadas.
  // En galería, `source` puede ser el bitmap original aunque el resto del OCR use 1200 px.
  const band = cropSourceRegion(source, rect, FOOTER_BOX);
  applyVariant(band, variant);
  const canvas = document.createElement('canvas');
  canvas.width = band.width;
  canvas.height = band.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar el pie de la carta.');
  ctx.putImageData(band, 0, 0);
  return canvas;
}

/** Sólo acepta códigos exactos del catálogo y leídos dentro del pie. */
export function extractFooterCode(ocr: OcrResult, codes: readonly string[]): string | null {
  const allowed = new Set(codes.map((code) => code.toUpperCase()));
  const found = new Set<string>();
  for (const line of footerTokens(ocr)) {
    if (line.confidence < 70) continue;
    for (const token of line.text.toUpperCase().match(/\b[A-Z0-9-]{2,8}\b/g) ?? []) {
      if (allowed.has(token)) found.add(token);
    }
  }
  return found.size === 1 ? [...found][0]! : null;
}

export type FooterReading = 'number-left' | 'number-right' | 'code';

/** Quita sólo el fondo oscuro conectado al borde, conservando dígitos contorneados. */
export function cleanOutlinedText(image: ImageData, threshold = 80): ImageData {
  const count = image.width * image.height;
  const mask = new Uint8Array(count);
  const seen = new Uint8Array(count);
  const queue = new Int32Array(count);
  let tail = 0;
  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    mask[p] = (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3 > threshold ? 255 : 0;
  }
  const visit = (p: number): void => {
    if (!seen[p] && mask[p] === 0) { seen[p] = 1; queue[tail++] = p; }
  };
  for (let x = 0; x < image.width; x += 1) { visit(x); visit((image.height - 1) * image.width + x); }
  for (let y = 0; y < image.height; y += 1) { visit(y * image.width); visit(y * image.width + image.width - 1); }
  for (let head = 0; head < tail; head += 1) {
    const p = queue[head];
    if (p % image.width > 0) visit(p - 1);
    if (p % image.width < image.width - 1) visit(p + 1);
    if (p >= image.width) visit(p - image.width);
    if (p < count - image.width) visit(p + image.width);
  }
  const pixels = new Uint8ClampedArray(image.data);
  for (let p = 0; p < count; p += 1) {
    const value = seen[p] ? 255 : mask[p];
    pixels[p * 4] = value; pixels[p * 4 + 1] = value; pixels[p * 4 + 2] = value;
  }
  return new ImageData(pixels, image.width, image.height);
}

export function renderCollectorBand(
  source: ImageInput, rect: CardRect | null, reading: FooterReading, outlined: boolean,
): HTMLCanvasElement {
  const region = {
    x: reading === 'code' ? 0.08 : reading === 'number-left' ? 0.16 : 0.73,
    y: 0.90, width: reading === 'code' ? 0.14 : 0.24, height: 0.095,
  };
  let band = cropSourceRegion(source, rect, region);
  if (outlined) band = cleanOutlinedText(band);
  else applyVariant(band, 'grayscale');
  const canvas = document.createElement('canvas');
  canvas.width = band.width; canvas.height = band.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar el número de la carta.');
  ctx.putImageData(band, 0, 0);
  return canvas;
}

/** La confianza del artista o la regla no debe tapar la del token numérico. */
export function footerTokens(ocr: OcrResult): Array<{ text: string; confidence: number }> {
  return ocr.lines.flatMap((line) => line.words?.length
    ? line.words.map((word) => ({
        text: word.text,
        // Tesseract a veces deja en 0 la confianza de una palabra que sí
        // imprimió; la línea del recorte sigue teniendo una medida útil.
        confidence: word.confidence > 0 ? word.confidence : line.confidence,
      }))
    : [line]);
}

export function extractFooterNumber(
  readings: OcrResult[],
  minimumConfidence = 80,
  acceptIsolatedZeroConfidence = false,
): string | null {
  const found = new Map<string, string>();
  for (const reading of readings) {
    for (const token of footerTokens(reading)) {
      const exactNumberToken = /^[A-Z]{0,4}\d{1,3}\s*[\/／]\s*[A-Z]{0,4}\d{2,3}$/i.test(token.text.trim());
      const hasReadableContext = reading.lines.some((line) => line.confidence >= minimumConfidence && line.text.trim().length > 0);
      const isolatedZeroConfidence = acceptIsolatedZeroConfidence && token.confidence === 0 && exactNumberToken && hasReadableContext;
      if (token.confidence < minimumConfidence && !isolatedZeroConfidence) continue;
      for (const match of token.text.matchAll(/(?<![\w/])([A-Z]{0,4}\d{1,3})\s*[/／]\s*([A-Z]{0,4}\d{2,3})(?![\w/])/gi)) {
        const prefix = match[1].match(/^[A-Z]+/i)?.[0]?.toUpperCase();
        if (prefix && !['TG', 'SV', 'GG', 'RC'].includes(prefix)) continue;
        const total = Number(match[2].replace(/^[A-Z]+/i, ''));
        if (total < 30 || total > 400) continue;
        const number = match[1].toUpperCase().replace(/^([A-Z]*)0+(?=\d)/, '$1');
        const denominator = match[2].toUpperCase().replace(/^([A-Z]*)0+(?=\d)/, '$1');
        found.set(`${number}/${denominator}`, `${match[1].toUpperCase()}/${match[2].toUpperCase()}`);
      }
    }
  }
  return found.size === 1 ? [...found.values()][0]! : null;
}

/** Los códigos modernos suelen estar en un bloque oscuro con letras claras. */
export function renderCodePatches(source: ImageInput, rect: CardRect | null): HTMLCanvasElement[] {
  const image = toImageData(source);
  const card = rect ?? { x: 0, y: 0, width: image.width, height: image.height };
  const band = cropImageData(image, {
    x: (card.x + card.width * 0.04) / image.width,
    y: (card.y + card.height * 0.90) / image.height,
    width: card.width * 0.32 / image.width, height: card.height * 0.095 / image.height,
  });
  const count = band.width * band.height;
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  const dark = (p: number): boolean => (band.data[p * 4] + band.data[p * 4 + 1] + band.data[p * 4 + 2]) / 3 < 80;
  const patches: Array<{ x: number; y: number; width: number; height: number; area: number }> = [];
  for (let start = 0; start < count; start += 1) {
    if (visited[start] || !dark(start)) continue;
    let tail = 1; queue[0] = start; visited[start] = 1;
    let left = start % band.width, right = left, top = Math.floor(start / band.width), bottom = top;
    const visit = (p: number): void => { if (!visited[p] && dark(p)) { visited[p] = 1; queue[tail++] = p; } };
    for (let head = 0; head < tail; head += 1) {
      const p = queue[head], x = p % band.width, y = Math.floor(p / band.width);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      if (x > 0) visit(p - 1); if (x < band.width - 1) visit(p + 1);
      if (y > 0) visit(p - band.width); if (y < band.height - 1) visit(p + band.width);
    }
    const width = right - left + 1, height = bottom - top + 1;
    if (left === 0 || top === 0 || right === band.width - 1 || bottom === band.height - 1) continue;
    if (width < band.width * 0.12 || height < band.height * 0.08 || height > band.height * 0.65) continue;
    if (width / height < 1.2 || width / height > 6 || tail / (width * height) < 0.45) continue;
    patches.push({ x: left, y: top, width, height, area: tail });
  }
  return patches.sort((a, b) => b.area - a.area).slice(0, 2).map((patch) => {
    const pixels = cropImageData(band, {
      x: Math.max(0, patch.x - 4) / band.width, y: Math.max(0, patch.y - 4) / band.height,
      width: (patch.width + 8) / band.width, height: (patch.height + 8) / band.height,
    });
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = 255 - pixels.data[i]; pixels.data[i + 1] = 255 - pixels.data[i + 1]; pixels.data[i + 2] = 255 - pixels.data[i + 2];
    }
    const canvas = document.createElement('canvas'); canvas.width = pixels.width; canvas.height = pixels.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar el código de colección.');
    ctx.putImageData(pixels, 0, 0); return canvas;
  });
}
