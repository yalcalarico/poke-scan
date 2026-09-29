/**
 * Real end-to-end OCR check: the actual card images downloaded from
 * pokemontcg.io are run through every pre-processing variant and then through
 * Tesseract, to check whether pre-processing actually helps name extraction.
 *
 * Opt-in (needs the PNGs and the eng traineddata):
 *   SCANNER_OCR_INTEGRATION=1 pnpm test
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorker } from 'tesseract.js';

import { installCanvasShim, ShimCanvas } from './helpers/canvas-shim';
import { decodePng, encodePng } from './helpers/png';
import { pickBestAttempt, type ScanAttempt } from '../pipeline';
import { toOcrResult } from '../ocr';
import { analyzeVariants, renderVariant, VARIANT_ORDER } from '../preprocess';
import { parseOcrText } from '../parser';

installCanvasShim();

const FIXTURE_DIR = process.env.OCR_FIXTURE_DIR ?? '/tmp/ocr-fixtures';
const OUT_DIR = join(tmpdir(), 'ocr-variant-probe');
const ENABLED = process.env.SCANNER_OCR_INTEGRATION === '1';

/** `sm4-12` is the documented OCR failure: Tesseract reads it as "Bone Keeper". */
const CARDS: { id: string; name: string; known?: boolean }[] = [
  { id: 'base1-4', name: 'Charizard' },
  { id: 'base1-1', name: 'Alakazam' },
  { id: 'xy5-1', name: 'Weedle' },
  { id: 'sm4-12', name: 'Marowak' },
  { id: 'bw10-26', name: 'Abomasnow' },
  { id: 'hgss4-1', name: 'Aggron' },
  { id: 'pl1-1', name: 'Ampharos' },
  { id: 'neo1-10', name: 'Meganium' },
];

let worker: Awaited<ReturnType<typeof createWorker>>;
const perVariantHits: Record<string, number> = { original: 0, grayscale: 0, threshold: 0 };
let pipelineHits = 0;
let sharpestHits = 0;

async function recognizeImage(image: { width: number; height: number; data: Uint8ClampedArray }) {
  const file = join(OUT_DIR, `probe-${Math.random().toString(36).slice(2)}.png`);
  writeFileSync(file, encodePng(image));
  const { data } = await worker.recognize(file, {}, { text: true, blocks: true });
  return data;
}

beforeAll(async () => {
  if (!ENABLED) return;
  mkdirSync(OUT_DIR, { recursive: true });
  worker = await createWorker('eng', 1, { logger: () => {} });
}, 600_000);

afterAll(async () => {
  if (worker) await worker.terminate();
});

describe.skipIf(!ENABLED)('pre-processing + real OCR', () => {
  it('runs every variant on every fixture', async () => {
    for (const card of CARDS) {
      const file = join(FIXTURE_DIR, `${card.id}.png`);
      expect(existsSync(file), `missing fixture ${file}`).toBe(true);

      const decoded = decodePng(readFileSync(file));
      const canvas = new ShimCanvas(decoded.width, decoded.height, decoded);
      const asCanvas = canvas as unknown as HTMLCanvasElement;

      const { variant: sharpest, scores } = await analyzeVariants(asCanvas);
      const attempts: ScanAttempt[] = [];

      for (const variant of VARIANT_ORDER) {
        const data = await recognizeImage(
          toImageDataShim(renderVariant(asCanvas, variant)),
        );
        // Same normalization the app uses in the browser.
        const ocr = toOcrResult(data as never);
        const attempt: ScanAttempt = {
          variant,
          ocr,
          parsed: parseOcrText(ocr.text, ocr.lines),
        };
        attempts.push(attempt);
        if (attempt.parsed.nameGuess === card.name) perVariantHits[variant] += 1;
      }

      const best = pickBestAttempt(attempts);
      const bestBySharpest = attempts.find((a) => a.variant === sharpest) ?? attempts[0];
      const pipelineOk = best?.parsed.nameGuess === card.name;
      const sharpestOk = bestBySharpest.parsed.nameGuess === card.name;
      if (pipelineOk) pipelineHits += 1;
      if (sharpestOk) sharpestHits += 1;

      const row = attempts
        .map(
          (a) =>
            `${a.variant}=${a.parsed.nameGuess ?? '∅'}(${(a.ocr.confidence * 100).toFixed(0)}%)`,
        )
        .join('  ');
      console.log(
        `${card.id.padEnd(9)} want=${card.name.padEnd(10)} | ${row} | ` +
          `sharpest=${sharpest} sharpestOk=${sharpestOk} pipelinePick=${best?.variant}(${best?.parsed.nameGuess}) ok=${pipelineOk}`,
      );
      void scores;
    }

    const total = CARDS.length;
    console.log(
      `\nTOTALS (${total} cards): per-variant hits ${JSON.stringify(perVariantHits)} | ` +
        `sharpestOfVariants ${sharpestHits}/${total} | best-of-3-by-confidence ${pipelineHits}/${total}`,
    );

    expect(pipelineHits).toBeGreaterThan(perVariantHits.original);
  }, 900_000);
});

function toImageDataShim(canvas: HTMLCanvasElement): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const data = (canvas as unknown as ShimCanvas).getContext().getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return { width: canvas.width, height: canvas.height, data: data.data };
}
