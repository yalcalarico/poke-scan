/**
 * Diagnóstico del escaneo, foto por foto, con OCR real.
 *
 *   pnpm exec vitest run --config vitest.e2e.config.mts
 *   SCAN_E2E_PHOTOS=IMG_4987 pnpm exec vitest run --config vitest.e2e.config.mts
 *
 * Para cada foto imprime:
 *   - la foto, la carta recortada y cada banda (en /tmp/pokemon-scanner-captures)
 *   - **qué leyó Tesseract en cada pasada**, separado por pre-procesado y PSM
 *   - qué nombre quedó después del merge
 *   - los candidatos con su score y con qué texto emparejaron
 *
 * Es el que sirve para entender por qué se elige un resultado y no otro.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { expect, it, vi } from 'vitest';

/**
 * `lib/scanner/ocr` se niega a correr fuera del browser y, si se shimea
 * `window`, tesseract.js toma el camino de browser y se cuelga buscando el
 * worker. La salida es mockear ese módulo con la MISMA lógica pero llamando a
 * tesseract.js en modo Node: el OCR es real, solo cambia quién lo invoca.
 */
vi.mock('../lib/scanner/ocr', async () => {
  const actual = await vi.importActual<typeof import('../lib/scanner/ocr')>(
    '../lib/scanner/ocr',
  );
  const { createWorker } = await import('tesseract.js');
  // Sin `workerPath`: en Node tesseract usa su worker propio, y darle el del
  // public/ lo deja colgado esperando un bundle de browser.
  const assets = join(process.cwd(), 'public', 'tesseract');

  let workerPromise: Promise<{
    setParameters: (params: Record<string, unknown>) => Promise<unknown>;
    recognize: (
      image: Buffer,
      o?: Record<string, unknown>,
      out?: Record<string, boolean>,
    ) => Promise<{ data: unknown }>;
  }> | null = null;
  const getWorker = () => {
    workerPromise ??= createWorker('eng', 1, {
      corePath: join(assets, 'core'),
      langPath: join(assets, 'lang'),
    }) as never;
    return workerPromise;
  };

  return {
    ...actual,
    recognize: async (image: unknown, logger?: unknown, pageSegMode?: string) => {
      const worker = await getWorker();
      await worker.setParameters({ tessedit_pageseg_mode: pageSegMode ?? actual.OCR_FULL_CARD_PAGE_SEG_MODE });
      // tesseract en Node no entiende un canvas: necesita los bytes, y el shim
      // ya sabe producir un PNG.
      const bytes =
        typeof image === 'object' && image !== null && 'toBuffer' in image
          ? (image as { toBuffer(): Buffer }).toBuffer()
          : Buffer.from(await (image as Blob).arrayBuffer());
      const { data } = await worker.recognize(bytes, {}, { text: true, blocks: true });
      return actual.toOcrResult(data as never);
    },
  };
});

process.env.NEXT_PUBLIC_SCAN_CAPTURE = '1';

const { installCanvasShim, ShimImageData } = await import(
  '../lib/scanner/__tests__/helpers/canvas-shim'
);
const { scanCardImage } = await import('../lib/scanner/pipeline');

installCanvasShim();

/**
 * Lee la foto como la ve el browser, que es lo que importa acá.
 *
 * `decodePng` devuelve los píxeles crudos y las fotos del celular traen la
 * orientación en EXIF: el browser la aplica (`image-orientation: from-image`) y
 * la carta llega vertical. Sin aplicarla se mide un caso que el producto nunca
 * ve, y el resultado es peor: la banda del nombre sale vacía. `sips` sí aplica
 * el EXIF, por eso el passthrough por BMP.
 *
 * `--out` es obligatorio: sin él `sips` reescribe el archivo de entrada.
 */
function loadImage(path: string): ImageData {
  const tmp = join(tmpdir(), `diag-${basename(path)}.bmp`);
  execFileSync('sips', ['-s', 'format', 'bmp', path, '--out', tmp], { stdio: 'ignore' });
  try {
    const bmp = readFileSync(tmp);
    const offset = bmp.readUInt32LE(10);
    const width = bmp.readInt32LE(18);
    const rawHeight = bmp.readInt32LE(22);
    const height = Math.abs(rawHeight);
    const bpp = bmp.readUInt16LE(28);
    if (bpp !== 24 && bpp !== 32) throw new Error(`BMP de ${bpp} bits`);

    const bytes = bpp / 8;
    const rowSize = Math.ceil((bpp * width) / 32) * 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const srcRow = rawHeight < 0 ? y : height - 1 - y;
      for (let x = 0; x < width; x += 1) {
        const src = offset + srcRow * rowSize + x * bytes;
        const dst = (y * width + x) * 4;
        data[dst] = bmp[src + 2]!;
        data[dst + 1] = bmp[src + 1]!;
        data[dst + 2] = bmp[src]!;
        data[dst + 3] = 255;
      }
    }
    return new ShimImageData(data, width, height) as unknown as ImageData;
  } finally {
    rmSync(tmp, { force: true });
  }
}

const API = 'http://localhost:3001/api';
/** Las fotos a resolución completa, que es lo que llega del celular. */
const DIR = process.env.SCAN_E2E_DIR ?? '/tmp/cards-full';
const HIGH_RES_DIR = process.env.SCAN_HIGH_RES_DIR;
const EXPECTED: Record<string, { cardId: string; name: string; number: string }> = {
  IMG_4985: { cardId: 'me55c-106', name: 'Shining Celebi', number: '106' },
  IMG_4986: { cardId: 'me55-23', name: 'Pikachu', number: '23' },
  IMG_4987: { cardId: 'me55-92', name: 'Umbreon ex', number: '92' },
  IMG_4988: { cardId: 'me55-137', name: 'Chandelure', number: '137' },
  IMG_4989: { cardId: 'me55-145', name: 'Hisuian Zorua', number: '145' },
};

interface Candidate {
  card: { id: string; name: string; number: string | null };
  set: { name: string } | null;
  score: number;
  matchedText: string | null;
}

const clean = (text: string): string => text.replace(/\s+/g, ' ').trim();
const percentile = (values: number[], fraction: number): number | null => {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(fraction * ordered.length) - 1] ?? null;
};

it('diagnostica cada foto: qué leyó el OCR y por qué ganó ese resultado', async () => {
  const only = process.env.SCAN_E2E_PHOTOS;
  const files = Object.keys(EXPECTED).filter((f) => !only || f.includes(only));

  const progressive = process.env.SCAN_PROGRESSIVE === '1';
  const skipApi = process.env.SCAN_SKIP_API === '1';
  const config = !skipApi && (progressive || process.env.SCAN_COLLECTOR !== '0') ? await fetch(`${API}/cards/scanner-config`).then((r) => r.json()) as { setCodes: string[]; setNames: string[] } : { setCodes: [], setNames: [] };
  const report: unknown[] = [];
  const latencies: number[] = [];

  let aciertos = 0;

  for (const [fileIndex, file] of files.entries()) {
    const run = `diag-${file}`;
    rmSync(join('/tmp/pokemon-scanner-captures', run), { recursive: true, force: true });

    const started = performance.now();
    const seen: string[] = [];
    const ocrAttempts: Array<{ text: string; lineConfidences: number[]; lines: Array<{ text: string; confidence: number; words: Array<{ text: string; confidence: number }> }> }> = [];
    const sourceImage = loadImage(`${DIR}/${file}.png`);
    const result = await scanCardImage(sourceImage, {
      captureRun: run,
      highResolutionSource: HIGH_RES_DIR ? loadImage(`${HIGH_RES_DIR}/${file}.png`) : undefined,
      progressive,
      readCollector: process.env.SCAN_COLLECTOR !== '0',
      setCodes: config.setCodes,
      setNames: config.setNames,
      onAttempt: (attempt) => {
        const tag = attempt.variant === 'nameband' ? 'BANDA' : `CARTA ${attempt.variant}`;
        seen.push(`${tag.padEnd(16)} ${JSON.stringify(clean(attempt.ocr.text).slice(0, 180))}`);
        ocrAttempts.push({
          text: clean(attempt.ocr.text),
          lineConfidences: attempt.ocr.lines.map((line) => Math.round(line.confidence)),
          lines: attempt.ocr.lines.map((line) => ({
            text: line.text,
            confidence: Math.round(line.confidence),
            words: (line.words ?? []).map((word) => ({ text: word.text, confidence: Math.round(word.confidence) })),
          })),
        });
      },
    });
    expect(result, `el pipeline no devolvió nada para ${file}`).not.toBeNull();
    if (!result) continue;

    const data = skipApi ? { candidates: [] as Candidate[] } : (await fetch(`${API}/cards/identify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        lines: result.parsed.lines.slice(0, 60),
        name: result.parsed.nameGuess ?? undefined,
        number: result.parsed.numberGuess ?? undefined,
        setHint: result.parsed.setHint ?? undefined,
        setCode: result.parsed.setCode ?? undefined,
        limit: 10,
      }),
    }).then((r) => r.json())) as { candidates?: Candidate[]; timings?: { matchMs: number; totalMs: number }; status?: string };

    const n = result.normalized;
    const expected = EXPECTED[file]!;
    const cands = data.candidates ?? [];
    const ok = cands[0]?.card.name.startsWith(expected.name);
    const exactTop1 = cands[0]?.card.id === expected.cardId;
    const exactTop8 = cands.slice(0, 8).some((c) => c.card.id === expected.cardId);
    const exactTop10 = cands.length >= 10
      ? cands.slice(0, 10).some((c) => c.card.id === expected.cardId)
      : null;
    const totalMs = Math.round(performance.now() - started);
    latencies.push(totalMs);
    report.push({ photo: file, sourceWidth: sourceImage.width, sourceHeight: sourceImage.height,
      latencyScope: 'node-total', coldWorkerRun: fileIndex === 0,
      expected: expected.name, expectedCardId: expected.cardId, ocrAttempts,
      exactTop1,
      exactTop8,
      exactTop10,
      numberGuess: result.parsed.numberGuess,
      numberCovered: result.parsed.numberGuess !== null,
      numberCorrect: result.parsed.numberGuess?.split('/')[0] === expected.number,
      setCodeGuess: result.parsed.setCode,
      setCodeCovered: result.parsed.setCode !== null,
      acceptanceStatus: data.status ?? null,
      accepted: data.status === 'confident',
      top1: Boolean(ok),
      top3: cands.slice(0, 3).some((c) => c.card.name.startsWith(expected.name)),
      totalMs, matchTimings: data.timings, status: data.status, parsed: result.parsed,
      candidates: cands.map((c) => ({ id: c.card.id, name: c.card.name, number: c.card.number, score: c.score })),
    });
    if (ok) aciertos += 1;

    console.log(`\n${'═'.repeat(72)}`);
    console.log(`${file}  esperado: ${expected.name} (${expected.cardId})   ${exactTop1 ? '✔ ID exacto' : '✘ ID distinto'}`);
    console.log(
      n.detected
        ? `carta recortada ${n.rect?.width}x${n.rect?.height}  rot=${n.rotation}  retina ${n.image.width}x${n.image.height}`
        : `SIN RECORTAR (detección falló)  rot=${n.rotation}  retina ${n.image.width}x${n.image.height}`,
    );
    console.log(`capturas: /tmp/pokemon-scanner-captures/${run}/`);

    console.log(`\n  lo que leyó Tesseract en cada pasada:`);
    for (const line of seen) console.log(`    ${line}`);

    console.log(`\n  después del merge:`);
    console.log(`    nameGuess   = ${JSON.stringify(result.parsed.nameGuess)}`);
    console.log(`    numberGuess = ${JSON.stringify(result.parsed.numberGuess)}`);
    console.log(`    setHint     = ${JSON.stringify(result.parsed.setHint)}`);
    console.log(`    lines       = ${JSON.stringify(result.parsed.lines.slice(0, 10))}`);

    console.log(`\n  candidatos (los 5 primeros):`);
    for (const c of cands.slice(0, 5)) {
      console.log(
        `    ${c.score.toFixed(2)}  ${c.card.name.padEnd(18)} ${(c.set?.name ?? '?').padEnd(16)} match=${JSON.stringify(c.matchedText)}`,
      );
    }
  }

  console.log(`\n${'═'.repeat(72)}`);
  if (process.env.SCAN_REPORT_FILE) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.env.SCAN_REPORT_FILE, JSON.stringify(report, null, 2));
  }
  console.log(`TOTAL: ${aciertos}/${files.length} con el nombre correcto en el top-1`);
  const exactHits = report.filter((row) => typeof row === 'object' && row !== null && 'exactTop1' in row && row.exactTop1 === true).length;
  const numberHits = report.filter((row) => typeof row === 'object' && row !== null && 'numberCorrect' in row && row.numberCorrect === true).length;
  const numberCoverage = report.filter((row) => typeof row === 'object' && row !== null && 'numberCovered' in row && row.numberCovered === true).length;
  const codeCoverage = report.filter((row) => typeof row === 'object' && row !== null && 'setCodeCovered' in row && row.setCodeCovered === true).length;
  const accepted = report.filter((row) => typeof row === 'object' && row !== null && 'accepted' in row && row.accepted === true).length;
  const top8Hits = report.filter((row) => typeof row === 'object' && row !== null && 'exactTop8' in row && row.exactTop8 === true).length;
  const top10Measured = report.filter((row) => typeof row === 'object' && row !== null && 'exactTop10' in row && row.exactTop10 !== null).length;
  const top10Hits = report.filter((row) => typeof row === 'object' && row !== null && 'exactTop10' in row && row.exactTop10 === true).length;
  console.log(`ID exacto top-1: ${exactHits}/${files.length}; top-8: ${top8Hits}/${files.length}; top-10: ${top10Hits}/${top10Measured} medibles; número correcto: ${numberHits}/${files.length} (cobertura ${numberCoverage}/${files.length}); código detectado: ${codeCoverage}/${files.length}; confident: ${accepted}/${files.length}`);
  console.log(`Latencia Node total: p50=${percentile(latencies, 0.5) ?? 'n/d'} ms, p95=${percentile(latencies, 0.95) ?? 'n/d'} ms (primera foto identificada como worker frío; sin umbral de aceptación configurado)`);
  console.log('capturas en /tmp/pokemon-scanner-captures/diag-*');
}, 40 * 60_000);
