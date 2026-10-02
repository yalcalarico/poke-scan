/**
 * Capture → pre-process → OCR → parse orchestration.
 *
 * Why this exists: the pre-processing variant that produces the best OCR result
 * genuinely varies per card (foil glare, focus, exposure). Measured on 8 real
 * cards, no image statistic predicts it — the "sharpest" variant by edge energy
 * was the *worst* one 3 times out of 8. The only reliable tie-breaker is the OCR
 * engine itself, so we OCR a couple of variants and keep the parse with the
 * best confidence.
 *
 * On top of that there is a dedicated pass over the name band (see
 * `NAME_BAND_BOX`): the full card is read fine except for the name line, which
 * Tesseract's page segmentation drops. See `scoreAttempt` for why the winner is
 * chosen by "has a name" and not by confidence.
 */
import { captureStep } from './debug-capture';
import { recognize, type OcrLogger } from './ocr';
import { parseOcrText } from './parser';
import {
  normalizeCardImageData,
  renderNameBand,
  renderVariant,
  toImageData,
  VARIANT_ORDER,
  type ImageInput,
  type NormalizedCard,
  type PreprocessVariant,
} from './preprocess';
import type { OcrResult, ParsedScan, ScannedCapture } from './types';
import { extractFooterCode, extractFooterNumber, renderCollectorBand, renderFooter } from './regions';

export interface ScanAttempt {
  variant: PreprocessVariant | 'nameband';
  parsed: ParsedScan;
  ocr: OcrResult;
}

export interface ScanResult {
  /** The attempt that won among the full-card variants. */
  best: ScanAttempt;
  attempts: ScanAttempt[];
  /** The name-band pass, when it ran. */
  band: ScanAttempt | null;
  /**
   * Merged parse: name from the band, number/set hints from the full card.
   * This is what goes to the backend — the band alone has no card number.
   */
  parsed: ParsedScan;
  /** Merged OCR lines, band first so the name is never truncated away. */
  lines: string[];
  /** Card detection + rotation, for diagnostics. */
  normalized: NormalizedCard;
}

function mapRectToSource(rect: NonNullable<NormalizedCard['rect']>, from: ImageData, to: ImageInput) {
  const toWidth = 'naturalWidth' in to && to.naturalWidth > 0 ? to.naturalWidth : to.width;
  const toHeight = 'naturalHeight' in to && to.naturalHeight > 0 ? to.naturalHeight : to.height;
  const scaleX = toWidth / from.width;
  const scaleY = toHeight / from.height;
  return {
    x: Math.round(rect.x * scaleX),
    y: Math.round(rect.y * scaleY),
    width: Math.round(rect.width * scaleX),
    height: Math.round(rect.height * scaleY),
  };
}

/**
 * Pre-procesados con los que se pasa la franja del nombre, y por qué son tres.
 *
 * Medido sobre las 5 fotos reales que motivaron esto (colección 30th
 * Celebration, cartas en funda sobre una frazada): la franja **cruda** lee
 * "Umbreon" pero no "Chandelure"; con **grayscale** lee "Shining Celebi" pero no
 * "Umbreon"; con **threshold** lee "Chandelure" pero no "Umbreon". Mismo recorte,
 * distinto pre-procesado, nombre distinto — es el mismo caso que las variantes de
 * la carta entera, y se resuelve igual: se prueban todas y el backend hace el
 * match difuso sobre la unión de las líneas.
 *
 * Invertir la banda se probó y no aporta (0 netas sobre 5), así que no está.
 */
const BAND_VARIANT_LABELS: Record<PreprocessVariant, string> = {
  original: 'crudo',
  grayscale: 'grises',
  threshold: 'contraste',
};

export const NAME_BAND_VARIANTS: PreprocessVariant[] = [
  'original',
  'grayscale',
  'threshold',
];

/**
 * Modos de segmentación con los que se pasa la banda del nombre.
 *
 * Medido sobre las 5 fotos reales: cada uno gana en un caso distinto y no hay
 * uno que sirva para todas.
 *
 * |            | `6` (bloque)         | `7` (línea)        |
 * |------------|---------------------|--------------------|
 * | Shining Celebi | "Shining Celebi" ✅ | "far Celebi"       |
 * | Umbreon        | "CTY EE - Ls Sy n" ❌ | "=X Umbreon €X" ✅ |
 * | Chandelure     | "Chandelure!" ✅     | "Chapdeidl"        |
 *
 * El `3` (AUTO, el default de Tesseract) se descarta: en la banda de Umbreon
 * devuelve cadena vacía, y por eso antes el identify se quedaba con la basura
 * de la carta entera ("nbreon", "preon") y ganaba "Pokémon Park" con 0.87.
 */
export const NAME_BAND_PAGE_SEG_MODES = ['6', '7'];

/** Etiquetas de la barra de progreso, en el orden en que se ejecutan. */
export const SCAN_PASS_LABELS: string[] = [
  'Foto original',
  'Escala de grises',
  'Contraste alto',
  ...NAME_BAND_VARIANTS.flatMap((variant) => [
    `Nombre (${BAND_VARIANT_LABELS[variant]}, bloque)`,
    `Nombre (${BAND_VARIANT_LABELS[variant]}, línea)`,
  ]),
];

/**
 * Cuántas pasadas de OCR hace un escaneo: 3 variantes de la carta entera + una
 * por pre-procesado de la franja del nombre.
 */
export const SCAN_PASS_COUNT = SCAN_PASS_LABELS.length;
export const PROGRESSIVE_PASS_COUNT = SCAN_PASS_COUNT + 2;

/**
 * Scores an attempt.
 *
 * Un intento que sacó nombre le gana SIEMPRE a uno que no, y la confianza solo
 * ordena entre los que lo sacaron.
 *
 * Antes era al revés (confianza + 0.05 por nombre) y eso estaba mal: la
 * confianza de la carta entera la domina el cuerpo de texto —poder, ataques,
 * flavor, que se leen perfecto— y no el nombre. Una variante con el nombre
 * corrupto y el cuerpo impeccable ganaba con confianza alta, que es
 * exactamente el síntoma de "no leyó el nombre". Medido en las 8 cartas de la
 * muestra: 7/8 antes, 8/8 con la franja.
 */
export function scoreAttempt(attempt: ScanAttempt): number {
  return (attempt.parsed.nameGuess ? 1 : 0) + attempt.ocr.confidence / 10;
}

export function pickBestAttempt(attempts: ScanAttempt[]): ScanAttempt | null {
  let best: ScanAttempt | null = null;
  let bestScore = -Infinity;
  for (const attempt of attempts) {
    const score = scoreAttempt(attempt);
    if (score > bestScore) {
      bestScore = score;
      best = attempt;
    }
  }
  return best;
}

/** Une las líneas de dos pasadas sin repetir, preservando el orden. */
export function mergeLines(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const line of groups.flat()) {
    const text = line.trim();
    if (text.length === 0) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(text);
  }
  return merged;
}

/**
 * Parseo final: el nombre sale de la banda del nombre y el número/set hint de
 * la carta entera (que es donde están). Si la banda no sacó nombre, se usa el
 * de la mejor variante completa.
 */
export function mergeParsed(band: ParsedScan | null, full: ParsedScan): ParsedScan {
  if (band === null) return full;
  return {
    lines: mergeLines(band.lines, full.lines),
    nameGuess: band.nameGuess ?? full.nameGuess,
    numberGuess: full.numberGuess ?? band.numberGuess,
    setHint: full.setHint ?? band.setHint,
    setCode: full.setCode ?? band.setCode,
    confidence: Math.max(band.confidence, full.confidence),
  };
}

/**
 * Fusiona las pasadas de la banda del nombre en una sola.
 *
 * Las líneas van unidas (el backend matchea sobre todas). Para el nombre se
 * prioriza acuerdo entre pasadas y luego confianza; no garantiza que la
 * lectura compartida sea correcta.
 */
export function mergeBandAttempts(attempts: ScanAttempt[]): ScanAttempt | null {
  if (attempts.length === 0) return null;
  if (attempts.length === 1) return attempts[0]!;

  // Si ninguna pasada sacó nombre —típico de las cartas full-art con el nombre
  // en contorno blanco— hay que quedarse con alguna igual: sin este pool vacío
  // el `reduce` reventaba y el escaneo entero moría con "reduce of empty array".
  const withName = attempts.filter((a) => a.parsed.nameGuess !== null);
  const pool = withName.length > 0 ? withName : attempts;
  const nameKey = (attempt: ScanAttempt): string =>
    attempt.parsed.nameGuess?.toLowerCase().replace(/\s+/g, ' ').trim() ?? '';
  const counts = new Map<string, number>();
  for (const attempt of withName) {
    const key = nameKey(attempt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // La confianza de una pasada también puntúa ruido. Un nombre repetido por
  // varias pasadas tiene prioridad; los empates conservan la confianza.
  const best = pool.reduce((a, b) => {
    const supportA = counts.get(nameKey(a)) ?? 0;
    const supportB = counts.get(nameKey(b)) ?? 0;
    return supportB > supportA || (supportB === supportA && b.parsed.confidence > a.parsed.confidence) ? b : a;
  });

  return {
    variant: 'nameband',
    ocr: best.ocr,
    parsed: {
      lines: mergeLines(...attempts.map((a) => a.parsed.lines)),
      nameGuess: best.parsed.nameGuess,
      numberGuess: best.parsed.numberGuess,
      setHint: best.parsed.setHint,
      setCode: best.parsed.setCode,
      confidence: Math.max(...attempts.map((a) => a.parsed.confidence)),
    },
  };
}

export interface ScanCardOptions {
  /** Original gallery bitmap, used only for small footer text. */
  highResolutionSource?: ImageInput;
  /** Desactivar sólo para comparar el aporte del lector del pie. */
  readCollector?: boolean;
  progressive?: boolean;
  setCodes?: readonly string[];
  setNames?: readonly string[];
  signal?: AbortSignal;
  onPass?: (label: string) => void;
  /** El catálogo decide si hay evidencia suficiente para ahorrar las otras pasadas. */
  onCheckpoint?: (parsed: ParsedScan) => Promise<boolean>;
  /** Pre-processing variants to try, in order. Defaults to all of them. */
  variants?: PreprocessVariant[];
  /** Run the extra name-band pass. Default true. */
  nameBand?: boolean;
  /** Detect the card and rotate it upright before anything else. Default true. */
  detectCard?: boolean;
  logger?: OcrLogger;
  onAttempt?: (attempt: ScanAttempt) => void;
  /** Agrupa los recortes de una corrida en la carpeta de capturas. Solo debug. */
  captureRun?: string;
}

/**
 * Runs OCR over the requested pre-processing variants and the name band, and
 * returns the merged parse. Must run in the browser (it creates canvases and a
 * Tesseract worker).
 */
export async function scanCardImage(
  source: ImageInput,
  options: ScanCardOptions = {},
): Promise<ScanResult | null> {
  const variants = options.variants ?? VARIANT_ORDER;
  const withBand = options.nameBand ?? true;
  const detectCard = options.detectCard ?? true;
  const run = options.captureRun ?? 'scan';

  /**
   * Todo lo que sigue opera sobre la carta normalizada, no sobre la foto.
   *
   * Importa por dos motivos, y los dos son la diferencia entre leer la carta y
   * no leerla con fotos reales: la banda del nombre y el resto de las variantes
   * usan proporciones de la CARTA, y la foto puede tener la carta de costado
   * (Tesseract no lee texto rotado 90°) o rodeada de fondo.
   */
  captureStep(run, '01-foto-original', source);

  const sourceImage = toImageData(source);
  const normalized = detectCard
    ? normalizeCardImageData(sourceImage)
    : { image: sourceImage, rect: null, rotation: 0 as const, detected: false };
  const card: ImageData = normalized.image;
  const canUseHighResolutionFooter = Boolean(
    options.highResolutionSource && normalized.detected && normalized.rect && normalized.rotation === 0,
  );
  const footerSource: ImageInput = canUseHighResolutionFooter
    ? options.highResolutionSource!
    : normalized.rotation === 0 ? source : card;
  const footerRect = canUseHighResolutionFooter
    ? mapRectToSource(normalized.rect!, sourceImage, footerSource)
    : normalized.rotation === 0 ? normalized.rect : null;

  captureStep(run, `02-carta-${normalized.detected ? 'detectada' : 'sin-detectar'}-rot${normalized.rotation}`, card);

  const attempts: ScanAttempt[] = [];
  const bandAttempts: ScanAttempt[] = [];
  const footerAttempts: ScanAttempt[] = [];
  const collectorAttempts: ScanAttempt[] = [];
  let lastOcrError: unknown = null;

  /**
   * Una pasada que revienta no puede matar el escaneo: son 9 llamadas al worker
   * de Tesseract y con que una falle ya perdemos la carta entera. Se saltea esa
   * pasada y, si al final no quedó ninguna lectura, se re-lanza el error para
   * que la UI muestre el mensaje real en vez de un "no pudimos leer la carta"
   * sin pistas.
   */
  const runPass = async (
    into: ScanAttempt[],
    variant: PreprocessVariant | 'nameband',
    canvas: HTMLCanvasElement,
    pageSegMode?: string,
  ): Promise<void> => {
    options.signal?.throwIfAborted();
    try {
      const ocr = await recognize(canvas, options.logger, pageSegMode);
      const attempt: ScanAttempt = {
        variant,
        ocr,
        parsed: parseOcrText(ocr.text, ocr.lines),
      };
      into.push(attempt);
      options.onAttempt?.(attempt);
    } catch {
      lastOcrError = new Error(`Falló la pasada ${String(variant)}${pageSegMode ? ` (psm ${pageSegMode})` : ''}`);
    }
    options.signal?.throwIfAborted();
  };

  const parseCurrent = (): ParsedScan => {
    const best = pickBestAttempt(attempts);
    if (!best) throw lastOcrError ?? new Error('El OCR no devolvió ninguna lectura.');
    const parsed = mergeParsed(mergeBandAttempts(bandAttempts)?.parsed ?? null, best.parsed);
    if (footerAttempts.length || collectorAttempts.length) {
      const printed = extractFooterNumber(footerAttempts.map((attempt) => attempt.ocr))
        ?? extractFooterNumber(collectorAttempts.map((attempt) => attempt.ocr), 30, true);
      if (printed) {
        parsed.printedNumberGuess = printed;
        parsed.numberGuess = parseOcrText(printed).numberGuess;
        // Sólo el token corroborado llega como evidencia; se descarta el ruido de las bandas.
        parsed.lines = mergeLines([printed], parsed.lines).slice(0, 60);
      }
      const codes = footerAttempts.map((a) => extractFooterCode(a.ocr, options.setCodes ?? [])).filter((code) => code !== null);
      parsed.setCode = new Set(codes).size === 1 ? codes[0]! : null;
    }
    const text = parsed.lines.join(' ').toLowerCase();
    parsed.setHint = [...(options.setNames ?? [])].sort((a, b) => b.length - a.length)
      .find((name) => name.length >= 4 && text.includes(name.toLowerCase())) ?? parsed.setHint;
    return parsed;
  };

  if (options.progressive) {
    options.onPass?.('Foto original');
    await runPass(attempts, 'original', renderVariant(card, 'original'));
    if (withBand) {
      options.onPass?.('Nombre');
      await runPass(bandAttempts, 'nameband', renderNameBand(card, 'grayscale'), '7');
    }
    options.onPass?.('Número y colección');
    await runPass(footerAttempts, 'nameband', renderFooter(footerSource, 'original', footerRect), '6');
    if (attempts.length && options.onCheckpoint) {
      try {
        const stop = await options.onCheckpoint(parseCurrent());
        options.signal?.throwIfAborted();
        if (stop) return { best: pickBestAttempt(attempts)!, attempts, band: mergeBandAttempts(bandAttempts), parsed: parseCurrent(), lines: parseCurrent().lines, normalized };
      } catch (error) {
        options.signal?.throwIfAborted();
        // Una búsqueda transitoria fallida no pierde las pasadas de respaldo.
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
      }
    }
  }

  for (const [index, variant] of variants.entries()) {
    if (options.progressive && variant === 'original') continue;
    options.onPass?.(`Carta (${variant})`);
    const canvas = renderVariant(card, variant);
    captureStep(run, `03-variante-${index}-${variant}`, canvas);
    await runPass(attempts, variant, canvas);
  }

  const best = pickBestAttempt(attempts);
  if (!best) throw lastOcrError ?? new Error('El OCR no devolvió ninguna lectura.');

  let band: ScanAttempt | null = null;
  if (withBand) {
    let index = 0;
    for (const variant of NAME_BAND_VARIANTS) {
      const bandCanvas = renderNameBand(card, variant);
      for (const pageSegMode of NAME_BAND_PAGE_SEG_MODES) {
        if (options.progressive && variant === 'grayscale' && pageSegMode === '7') continue;
        options.onPass?.(`Nombre (${BAND_VARIANT_LABELS[variant]})`);
        captureStep(run, `04-banda-${index}-${variant}-psm${pageSegMode}`, bandCanvas);
        await runPass(bandAttempts, 'nameband', bandCanvas, pageSegMode);
        index += 1;
      }
    }
    band = mergeBandAttempts(bandAttempts);
  }

  if (options.progressive) {
    options.onPass?.('Revisando número y colección');
    await runPass(footerAttempts, 'nameband', renderFooter(footerSource, 'grayscale', footerRect), '6');
  }

  for (const reading of options.readCollector === false ? [] : ['number-left', 'number-right'] as const) {
    for (const outlined of [false, true]) {
      options.onPass?.('Leyendo el número de la carta');
      await runPass(
        collectorAttempts,
        'nameband',
        renderCollectorBand(footerSource, footerRect, reading, outlined),
        '6',
      );
    }
  }
  const parsed = parseCurrent();
  return { best, attempts, band, parsed, lines: parsed.lines, normalized };
}

/** Convenience wrapper for a frame grabbed with `captureFrame`. */
export async function scanCapture(
  capture: ScannedCapture,
  options: ScanCardOptions = {},
): Promise<ScanResult | null> {
  return scanCardImage(await blobToCanvas(capture.blob), options);
}

async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo crear el contexto 2D.');
    ctx.drawImage(bitmap, 0, 0);
    return canvas;
  } finally {
    bitmap.close();
  }
}
