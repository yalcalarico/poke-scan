# Tests

Vitest 5. El entorno **depende del archivo**: la mayoría son lógica pura y
corren en `node`; los de componente declaran `// @vitest-environment jsdom` en su
primera línea.

## Estado actual

**25 archivos · 336 tests** (más 2 skipped y 1 `todo`).

| Grupo | Qué cubre | Entorno |
|---|---|---|
| `lib/scanner/__tests__/` | El pipeline de OCR completo: parser, preprocesado, PNG, selección de variante | `node` |
| `lib/__tests__/` | `cn()` y los helpers del `Select` | `node` |
| `components/ui/__tests__/` | Las primitivas a11y-sensitive: focus trap del `Sheet`, `aria-activedescendant` del `Select`, `aria-labelledby` del `Field`, estados de `Button`/`Switch`/`Divider`/`SegmentedControl` | `jsdom` |
| `components/cards/__tests__/` | `CardGrid` (el `role="list"` que ya salió una vez) y la señal de rareza | `jsdom` |
| `components/collections/__tests__/` | El mosaico de portada de `CollectionCard` | `jsdom` |
| `components/scanner/__tests__/` | `session-storage`: recorte del tope, validación y corrupción | `jsdom` |
| `components/prices/__tests__/` | Sparkline, `PriceDelta` y la honestidad del caption | `jsdom` |
| `app/__tests__/` | El guard de contraste sobre `globals.css` | `node` |

## Por qué el setup está condicionado a `document`

`environment` default es `node` y la mayoría de los tests no tienen DOM.
Importar `@testing-library/react` o `jest-dom` sin `document` revienta, así que
`vitest.setup.ts` pregunta primero: los tests de `node` no pagan nada, y los que
declaran `jsdom` reciben los matchers, el `cleanup` y los shims
(`scrollIntoView`, `matchMedia`, Pointer Events) enteros.

El `cleanup` está **explícito** porque el auto-cleanup de Testing Library solo se
registra si encuentra un `afterEach` global, y Vitest no expone ninguno con
`globals: false`.

## Correr

```bash
pnpm run test           # vitest run (lo que corre pnpm run check)
pnpm run test:watch     # vitest

# un archivo puntual
pnpm exec vitest run components/scanner/__tests__/session-storage.test.ts
```

## Qué falta

- Tests de integración de las **pantallas** (no de las primitivas): scanner de
  punta a punta, colección con filtros combinados, refresh 401.
- `CardTile`, `EmptyState`, `Alert` y `Toast` no tienen cobertura propia.
- La E2E real vive en el backend y hoy solo verifica health.

---

## Los helpers

### `helpers/png.ts` — encoder y decoder PNG propios

Un lector/escritor de PNG mínimo (8-bit RGB/RGBA/grayscale, no entrelazado) hecho a
mano con `node:zlib`, **sin dependencias**:

```ts
import { deflateSync, inflateSync } from 'node:zlib';

export interface DecodedImage { width: number; height: number; data: Uint8ClampedArray }
export function decodePng(buffer: Buffer): DecodedImage
export function encodePng(image: DecodedImage): Buffer
```

- `decodePng` recorre los chunks, junta los `IDAT`, los descomprime con
  `inflateSync` y **deshace los 5 filtros de fila** (None / Sub / Up / Average /
  Paeth, con el predictor de Paeth implementado a mano). Después convierte a RGBA.
- `encodePng` solo escribe RGB (color type 2), filtro 0, con `deflateSync`. Hay un
  `crc32` propio.
- Tira con error claro si el bit depth no es 8 o si el PNG está entrelazado.

**Por qué existe:** para pasarle a Tesseract imágenes de carta reales en un test de
Node sin instalar `canvas` ni `sharp` (que son nativos y rompen la instalación).
Además sirve de scrap para escribir el resultado de cada variante a disco y mirarlo.

### `helpers/canvas-shim.ts` — canvas falso

Lo mínimo que `lib/scanner/preprocess` necesita: un buffer de píxeles con los cuatro
llamados de contexto 2D que hace el preprocesado.

```ts
export class ShimCanvas { getContext(): ShimContext2D; toImageData(): DecodedImage }
export class ShimImageData { data; width; height; colorSpace }
export function installCanvasShim(): void
```

`ShimContext2D` implementa `getImageData`, `putImageData`, `createImageData` y
`drawImage` (solo `(source, x, y)`, sin escalado) y un `clearRect()` vacío.
`installCanvasShim()` instala los globales `ImageData` y
`document.createElement('canvas')` **solo si no existen**, así que no pisa nada si
corrieran en un entorno con DOM real.

Esto permite correr el **preprocesado real** (`renderVariant`, `analyzeVariants`,
`adaptiveThreshold` de verdad, con las imágenes integrales de Sauvola) en Node plano.

---

## Qué está testeado

| Archivo | Qué cubre |
|---|---|
| `parser.test.ts` | `extractNameCandidates`, `extractNumberCandidates`, `extractSetHints`, `parseOcrText` contra las 8 fixtures de OCR real. |
| `ocr.test.ts` | `toOcrResult` con las dos formas de salida de Tesseract (plana y anidada) y `isOcrWorkerReady`. |
| `preprocess.test.ts` | La matemática de píxeles con `ImageData` sintéticos: `toGrayscale`, `increaseContrast`, `autoContrast`, `adaptiveThreshold`, `variance`, `edgeSharpness`. |
| `preprocess-canvas.test.ts` | Lo mismo pero a nivel canvas, vía el shim: `normalizedEdgeSharpness`, `analyzeVariants`, `sharpestOfVariants`, `renderVariant`. |
| `pipeline.test.ts` | `scoreAttempt` y `pickBestAttempt`, incluida la regla de desempate. |
| `camera-crop.test.ts` | `mapFrameToSourcePixels`: 1:1, recorte a los límites, la matemática de `object-cover`, y que nunca devuelva `NaN` ni negativo. |
| `card-frame.test.ts` | `fitCardFrame` y `frameMargin` en 6 tamaños de pantalla, y que se aproveche casi todo el alto. |
| `identify-e2e.test.ts` | **Opt-in.** Scan → identify completo. |
| `ocr-integration.test.ts` | **Opt-in.** Las 3 variantes contra OCR real. |

### El ground truth del parser

`parser.test.ts` no prueba con texto inventado: usa
[`lib/scanner/__fixtures__/ocr-samples.json`](../lib/scanner/__fixtures__/ocr-samples.json),
que es la **salida real** de Tesseract 7 sobre las imágenes de pokemontcg.io. El
comentario del test lo dice: *"Ground truth from the real OCR run"*.

La lista de acierto es de 7 cartas, con `sm4-12` aparte:

```ts
const NAME_TRUTH = [
  { id: 'base1-4',  name: 'Charizard' },
  { id: 'base1-1',  name: 'Alakazam' },
  { id: 'xy5-1',    name: 'Weedle' },
  { id: 'bw10-26',  name: 'Abomasnow' },
  { id: 'hgss4-1',  name: 'Aggron' },
  { id: 'pl1-1',    name: 'Ampharos' },
  { id: 'neo1-10',  name: 'Meganium' },
];
```

Y el caso conocido queda como `it.todo`, no como test verde:

```ts
// Known limitation: on sm4-12 (Alolan Marowak) Tesseract reads the name as
// "Bone Keeper", the flavour-text heading. No client-side heuristic can recover
// "Marowak" from that string; only a catalog lookup on the backend can.
it.todo('sm4-12 (Alolan Marowak) is OCR’d as "Bone Keeper" — needs backend matching');
```

### La regresión de tesseract 7

`ocr.test.ts` tiene un test que existe **por un bug concreto**:

```ts
it('flattens the block/paragraph structure returned by tesseract v6+', () => {
  // Regression: tesseract only returns `data.lines` when explicitly asked;
  // with `{ text: true, blocks: true }` the lines live inside the blocks.
  const result = toOcrResult(nestedData);
  expect(result.lines.map((line) => line.text)).toEqual(['a', 'b', 'c']);
});
```

Si alguien saca el `blocks: true` de `recognize()` y rompe el aplanado, este test
avisa. Ver [`gotchas.md`](gotchas.md).

### La regresión de la selection de variante

`preprocess-canvas.test.ts` verifica que la energía de borde **cruda** elige siempre
la binarizada y que `analyzeVariants` **no** la elige, y que `renderVariant` produce
exactamente los mismos números que `analyzeVariants` puntúa:

```ts
expect(edgeSharpness(binary)).toBeGreaterThan(edgeSharpness(original));
const { variant } = await analyzeVariants(asCanvas(canvas));
expect(variant).not.toBe('threshold');
```

---

## Tests opt-in

Los dos tests caros están apagados por defecto con `describe.skipIf(!ENABLED)`, y
dependen de variables de entorno.

### `SCANNER_IDENTIFY_E2E=1` — `identify-e2e.test.ts`

Corre **el pipeline completo** contra el backend real:

```
PNG de /tmp/ocr-fixtures ──▶ downscale a 1200px
   ──▶ renderVariant ×3 ──▶ Tesseract ──▶ parseOcrText
   ──▶ pickBestAttempt
   ──▶ POST {API}/cards/identify
   ──▶ ¿el top-1 es la carta correcta?
```

Requiere:

- Los 8 PNG en `/tmp/ocr-fixtures/<cardId>.png` (o `OCR_FIXTURE_DIR`):
  `base1-4`, `base1-1`, `xy5-1`, `sm4-12`, `bw10-26`, `hgss4-1`, `pl1-1`, `neo1-10`.
- El backend levantado en `:3001` (o `NEXT_PUBLIC_API_URL`).
- `eng.traineddata` (lo baja tesseract.js solo la primera vez).

`beforeAll` tiene timeout de **600 s** (el boot del worker) y el test **900 s**, así
que el primer run se ve congelado: es normal.

Imprime una tabla por consola con, por carta: fixture, nombre esperado, `nameGuess`,
`setHint`, variante ganadora, confidence, top-1 con set, score, precio, y las
latencias de OCR / identify / total. El encabezado lo arma el propio test:

```
fixture  esperada  nameGuess   setHint    best       conf  top-1            score  precio     ocr     api  total  ok
```

Cierra con un resumen de acierto por variante ganadora, latencias (promedio y
máximo) y el conteo de candidatos por carta:

```
TOP-1 correcto: N/8 | en el top-3: N/8 | variantes ganadoras: original=N grayscale=N threshold=N
Latencia OCR (3 variantes): avg Nms, max Nms | identify: avg Nms, max Nms | total avg Nms, max Nms
base1-4: 8 candidatos (2130 totales) score=0.87
```

Y **falla si el top-1 baja de 7**:

```ts
expect(top1).toBeGreaterThanOrEqual(7);
```

Es un test de regresión de producto, no un test unitario: si alguien toca el parser,
el preprocesado o el matching del backend, este es el que avisa que se rompió la
identificación.

Reimplementa a mano el `downscale` de `captureToImageData` (box filter con promedio,
a 1200 px) porque en Node no hay canvas real, y escribe cada variante a disco con
`encodePng` para poder mirarla.

### `SCANNER_OCR_INTEGRATION=1` — `ocr-integration.test.ts`

Mismo corpus, pero **sin backend**: pasa cada variante por Tesseract y cuenta
aciertos. Compara tres estrategias:

- **hits por variante**: cuántas de las 8 cartas leyó bien cada una.
- **`sharpestOfVariants`**: qué habría elegido la métrica de nitidez.
- **`best-of-3-by-confidence`**: qué elige el pipeline real.

```ts
expect(pipelineHits).toBeGreaterThan(perVariantHits.original);
```

Mismo setup (fixtures + traineddata), mismos timeouts largos.

### Cómo correrlos (importante)

Las variables de entorno **no pasan por `pnpm run test`**, porque el script del
`package.json` es un `vitest run` plano y la env se inyecta con el prefijo
`VAR=valor comando`, que necesita llegar al proceso hijo. Hay que ir con
`pnpm exec`:

```bash
# NO: la variable no llega
pnpm run test

# SÍ
SCANNER_IDENTIFY_E2E=1 pnpm exec vitest run lib/scanner/__tests__/identify-e2e.test.ts
SCANNER_OCR_INTEGRATION=1 pnpm exec vitest run lib/scanner/__tests__/ocr-integration.test.ts

# con el backend y las fixtures listas, a secas:
SCANNER_IDENTIFY_E2E=1 pnpm exec vitest run
```

Variables que los tests leen:

| Variable | Default | Para qué |
|---|---|---|
| `SCANNER_IDENTIFY_E2E` | — | Habilita el E2E contra `/cards/identify`. |
| `SCANNER_OCR_INTEGRATION` | — | Habilita el probe de variantes con OCR real. |
| `OCR_FIXTURE_DIR` | `/tmp/ocr-fixtures` | Dónde están los PNG de las cartas. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api` | Backend para el E2E. |

> **Nota (deuda).** Los tests arman `createWorker('eng', 1, { logger: () => {} })`
> **sin `workerPath`/`corePath`/`langPath`**: van al CDN de tesseract.js, no a
> `public/tesseract/`. Para correrlos offline hay que bajar el `eng.traineddata` al
> cache de tesseract.js o pasar los paths. No es lo que hace la app en producción.

---

## Qué NO está testeado

- **Las pantallas completas.** Hay tests de `CardPriceSection` y del hook
  `useInfiniteList`, pero no de `AppShell`, `CatalogSearch`, `CameraView`, `Sheet`,
  `Select` ni de navegación real entre rutas.
- **La mayoría de los hooks.** `useAuth`, `useCurrency`, `useTheme` y `useAsync`
  siguen sin tests.
- **Los skeletons en general.** `CardGridSkeleton` y `Skeleton` no se renderizan
  directamente en tests.
- **`lib/format.ts`** sin tests, siendo el módulo del que depende que un precio se
  lea bien.
- **`lib/api/*`** sin tests. El single-flight del refresh, que es lo más crítico
  del cliente, está verificado **a mano** en la app, no por tests.
- **`public/sw.js`** tiene tests de routing para asegurar que RSC y rutas dinámicas
  no entren a Cache Storage; las estrategias completas offline/cache-first no
  tienen tests de integración en un navegador.
- **`getUserMedia` / `captureFrame`**: la geometría sí (`camera-crop.test.ts`,
  `card-frame.test.ts`), pero la cámara real no se puede testear en Node.
- **`layout.tsx`, `next.config.ts` y `manifest.json`**: nada.

**Nota (deuda técnica).** `vitest.config.ts` incluye `lib/**`, `hooks/**`,
`components/**` y tests `.tsx`; los de componentes declaran jsdom por archivo para
no pagarlo en toda la suite. La limitación actual es la falta de tests de
integración en navegador para navegación, Service Worker y pantallas completas.
