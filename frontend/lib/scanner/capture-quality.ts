/** Señales orientativas sobre el recorte; nunca aceptan ni rechazan una carta. */
export interface CaptureQuality {
  schemaVersion: 1;
  analysisWidth: number;
  analysisHeight: number;
  laplacianVariance: number;
  brightFraction: number;
  largestBrightRegionFraction: number;
  warnings: Array<'blur' | 'glare'>;
}

export const CAPTURE_QUALITY_HEURISTICS = {
  maxEdge: 256,
  blurVariance: 80,
  brightChannel: 240,
  brightLuminance: 245,
  brightFraction: 0.025,
  brightRegionFraction: 0.012,
} as const;

export function analyzeCaptureQuality(image: ImageData): CaptureQuality | undefined {
  if (image.width < 8 || image.height < 8) return undefined;
  const scale = Math.min(1, CAPTURE_QUALITY_HEURISTICS.maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));
  if (Math.min(width, height) < 8) return undefined;
  const gray = new Float32Array(width * height), bright = new Uint8Array(width * height);
  // Promediar cada caja evita que el ruido/aliasing de la resolución original
  // parezca detalle. La escala de análisis queda registrada en el diagnóstico.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const x0 = Math.floor(x * image.width / width), x1 = Math.max(x0 + 1, Math.floor((x + 1) * image.width / width));
    const y0 = Math.floor(y * image.height / height), y1 = Math.max(y0 + 1, Math.floor((y + 1) * image.height / height));
    let red = 0, green = 0, blue = 0, count = 0;
    for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
      const i = (sy * image.width + sx) * 4;
      red += image.data[i]!; green += image.data[i + 1]!; blue += image.data[i + 2]!; count++;
    }
    red /= count; green /= count; blue /= count;
    const i = y * width + x, value = .299 * red + .587 * green + .114 * blue;
    gray[i] = value;
    if (Math.min(red, green, blue) >= CAPTURE_QUALITY_HEURISTICS.brightChannel && value >= CAPTURE_QUALITY_HEURISTICS.brightLuminance) bright[i] = 1;
  }
  // Ignorar el margen evita confundir el fondo o el borde blanco de la carta
  // con un reflejo y que el contraste de su silueta oculte una foto borrosa.
  const margin = Math.max(1, Math.round(Math.min(width, height) * .05));
  const left = margin, right = width - margin, top = margin, bottom = height - margin;
  const area = (right - left) * (bottom - top);
  let sum = 0, squared = 0, brightCount = 0, largest = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const i = y * width + x;
    const laplacian = gray[i - 1]! + gray[i + 1]! + gray[i - width]! + gray[i + width]! - 4 * gray[i]!;
    sum += laplacian; squared += laplacian * laplacian;
    brightCount += bright[i]!;
  }
  const visited = new Uint8Array(width * height), queue = new Int32Array(width * height);
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const start = y * width + x;
    if (!bright[start] || visited[start]) continue;
    let head = 0, tail = 1;
    queue[0] = start; visited[start] = 1;
    while (head < tail) {
      const i = queue[head++]!, px = i % width, py = Math.floor(i / width);
      for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
        if (nx! < left || nx! >= right || ny! < top || ny! >= bottom) continue;
        const next = ny! * width + nx!;
        if (bright[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
    }
    largest = Math.max(largest, tail);
  }
  const laplacianVariance = Math.max(0, squared / area - (sum / area) ** 2);
  const brightFraction = brightCount / area, largestBrightRegionFraction = largest / area;
  const warnings: CaptureQuality['warnings'] = [];
  if (laplacianVariance < CAPTURE_QUALITY_HEURISTICS.blurVariance) warnings.push('blur');
  if (brightFraction >= CAPTURE_QUALITY_HEURISTICS.brightFraction && largestBrightRegionFraction >= CAPTURE_QUALITY_HEURISTICS.brightRegionFraction) warnings.push('glare');
  return { schemaVersion: 1, analysisWidth: width, analysisHeight: height, laplacianVariance, brightFraction, largestBrightRegionFraction, warnings };
}
