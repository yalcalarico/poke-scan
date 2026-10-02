import type { OcrLine, OcrResult } from './types';

/**
 * tesseract.js pulls in a worker bundle, wasm and language data. It must never
 * be part of a server module graph, so it is only ever imported dynamically
 * from inside browser-executed functions.
 */

/**
 * PWA offline: los assets viven en `public/tesseract/` asi el
 * escaner anda sin internet. Para volver al CDN, poné
 * `NEXT_PUBLIC_TESSERACT_CDN=1` en `.env.local`.
 *
 * - `worker.min.js`          -> copia de `tesseract.js@7.0.0/dist/worker.min.js`
 * - `core/`                  -> `tesseract.js-core@7.0.0`; se self-hospeda solo
 *                               las variantes `-lstm` (oem = LSTM_ONLY) y solo
 *                               las `.wasm.js`, que ya traen el wasm embebido
 * - `lang/eng.traineddata.gz`-> `@tesseract.js-data/eng@4.0.0_best_int`
 *
 * `corePath` es un directorio: tesseract.js elige la variante segun soporte
 * de SIMD / relaxed SIMD del dispositivo.
 */
export const TESSERACT_SELF_HOSTED = {
  workerPath: '/tesseract/worker.min.js',
  corePath: '/tesseract/core',
  langPath: '/tesseract/lang',
} as const;

export const TESSERACT_CDN = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',
  langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int',
} as const;

const useSelfHostedAssets = process.env.NEXT_PUBLIC_TESSERACT_CDN !== '1';

export const TESSERACT_ASSETS = useSelfHostedAssets ? TESSERACT_SELF_HOSTED : TESSERACT_CDN;

export type OcrLogger = (status: string, progress: number) => void;

let workerPromise: Promise<TesseractWorker> | null = null;
let activeLogger: OcrLogger | null = null;
let recognitionQueue: Promise<void> = Promise.resolve();

interface TesseractWorker {
  recognize(
    image: Blob | HTMLCanvasElement | string,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ): Promise<{ data: RecognizeData }>;
  setParameters(params: Record<string, unknown>): Promise<unknown>;
  terminate(): Promise<unknown>;
}

interface RawLine {
  text?: string;
  confidence?: number;
  words?: Array<{ text?: string; confidence?: number }>;
}

interface RawParagraph {
  lines?: RawLine[];
}

interface RawBlock {
  paragraphs?: RawParagraph[];
}

interface RecognizeData {
  text: string;
  confidence: number;
  /** Only present if `lines: true` was requested (legacy flat output). */
  lines?: RawLine[];
  blocks?: RawBlock[];
}

/** v6/v7 return the lines nested inside blocks; older/flat shapes have `data.lines`. */
function extractLines(data: RecognizeData): RawLine[] {
  if (data.lines?.length) return data.lines;
  const lines: RawLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) lines.push(line);
    }
  }
  return lines;
}

function toOcrLine(line: RawLine): OcrLine {
  return {
    text: (line.text ?? '').replace(/\s+/g, ' ').trim(),
    confidence: Number.isFinite(line.confidence) ? Number(line.confidence) : 0,
    words: line.words?.map((word) => ({
      text: (word.text ?? '').trim(),
      confidence: Number.isFinite(word.confidence) ? Number(word.confidence) : 0,
    })),
  };
}

function averageConfidence(data: RecognizeData, lines: OcrLine[]): number {
  if (lines.length) {
    const sum = lines.reduce((acc, line) => acc + line.confidence, 0);
    return sum / lines.length;
  }
  return Number.isFinite(data.confidence) ? Number(data.confidence) : 0;
}

export class OcrUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrUnavailableError';
  }
}

function assertBrowser(): void {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    throw new OcrUnavailableError('El OCR solo puede ejecutarse en el navegador.');
  }
}

/**
 * Singleton worker: creating it costs 2-5s (wasm + traineddata download), so
 * every scan reuses the same instance until `terminateOcrWorker()`.
 */
export async function createOcrWorker(logger?: OcrLogger): Promise<TesseractWorker> {
  assertBrowser();
  if (logger) activeLogger = logger;

  if (workerPromise) return workerPromise;

  workerPromise = (async () => {
    const { createWorker } = await import('tesseract.js');
    return (await createWorker('eng', 1, {
      workerPath: TESSERACT_ASSETS.workerPath,
      corePath: TESSERACT_ASSETS.corePath,
      langPath: TESSERACT_ASSETS.langPath,
      logger: (message: { status: string; progress: number }) => {
        activeLogger?.(message.status, message.progress);
      },
    })) as unknown as TesseractWorker;
  })().catch((err: unknown) => {
    workerPromise = null;
    throw new OcrUnavailableError(
      err instanceof Error ? err.message : 'No se pudo iniciar el worker de OCR.',
    );
  });

  return workerPromise;
}

/** Normalizes whatever Tesseract returns into our `OcrResult` shape. */
export function toOcrResult(data: RecognizeData): OcrResult {
  const lines = extractLines(data)
    .map(toOcrLine)
    .filter((line) => line.text.length > 0);

  return {
    text: data.text ?? '',
    lines,
    confidence: averageConfidence(data, lines) / 100,
  };
}

/**
 * Segmentación de página para las pasadas de la **carta entera**: AUTO, el
 * default de Tesseract.
 *
 * Se pone explícita aunque sea el default, y no por redundancia: el worker es
 * un singleton que vive toda la sesión de la página y `setParameters` es estado
 * persistente. Como las pasadas de la banda dejan el PSM en 6/7, la segunda
 * carta que escanea el usuario corría la carta entera con "una sola línea" y
 * salía basura. Cada pasada dice qué modo quiere.
 */
export const OCR_FULL_CARD_PAGE_SEG_MODE = '3';

export async function recognize(
  blobOrCanvas: Blob | HTMLCanvasElement,
  logger?: OcrLogger,
  pageSegMode: string = OCR_FULL_CARD_PAGE_SEG_MODE,
): Promise<OcrResult> {
  // Un timeout de la UI no cancela Tesseract: serializar protege su PSM de la siguiente captura.
  const pending = recognitionQueue.then(async () => {
    const worker = await createOcrWorker(logger);
    await worker.setParameters({ tessedit_pageseg_mode: pageSegMode });
    const { data } = await worker.recognize(blobOrCanvas, {}, { text: true, blocks: true });
    return toOcrResult(data);
  });
  recognitionQueue = pending.then(() => {}, () => {});
  return pending;
}

export async function terminateOcrWorker(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  activeLogger = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // The worker failed to boot; nothing to release.
  }
}

export function isOcrWorkerReady(): boolean {
  return workerPromise !== null;
}

export type { RecognizeData, TesseractWorker };
