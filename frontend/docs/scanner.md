# El pipeline de OCR

Cómo una foto de una carta termina siendo una lista de cartas del catálogo. Todo
esto corre **en el navegador**: ni una imagen de la cámara sale del dispositivo
hasta que el usuario pide guardar la carta.

```
getUserMedia ──▶ captureFrame (recorte a la carta, ≤1200px, JPEG 0.92)
                     │
                     ▼
    ┌── renderVariant × 3 ──▶ Tesseract × 3
    │   (original, grayscale,   (worker singleton, eng, self-hosted)
    │    threshold)                    │
    │         │                         ▼
    │         │                 toOcrResult (lines + confidence)
    │         │                         │
    │         ▼                         │
    └── pickBestAttempt ◀────────────────┘   (gana el que SAÓ nombre)
                     │
                     ▼
      renderNameBand × 3 ──▶ Tesseract × 6  (la franja del nombre, y 2-13% de
                     │                    la carta, con los 3 pre-procesados
                     │                    × los 2 modos de segmentación)
                     ▼
      mergeBandAttempts (une las líneas de las 6 pasadas)
                     │
                     ▼
      mergeParsed ──▶ ParsedScan { lines, nameGuess, numberGuess, setHint }
                     │     (nombre de la franja, número/set de la carta entera)
                     ▼
        POST /api/cards/identify ──▶ backend matchea contra 20.670 cartas
                     │                (nombre + HP + número impreso + artista + rareza)
                     ▼
        IdentifyResponseDto { candidates[8], extracted, totalCandidates }
```

| Archivo | Etapa | Node-compatible |
|---|---|---|
| [`lib/scanner/camera.ts`](../lib/scanner/camera.ts) | Cámara, marco, recorte | partially (la geometría sí) |
| [`lib/scanner/preprocess.ts`](../lib/scanner/preprocess.ts) | 3 variantes de imagen + la franja del nombre | sí (la matemática de píxeles) |
| [`lib/scanner/ocr.ts`](../lib/scanner/ocr.ts) | Worker de Tesseract | no |
| [`lib/scanner/parser.ts`](../lib/scanner/parser.ts) | Candidatos de nombre/número/set | **sí, y sin DOM** |
| [`lib/scanner/pipeline.ts`](../lib/scanner/pipeline.ts) | Orquesta y elige ganador | no |
| [`lib/scanner/types.ts`](../lib/scanner/types.ts) | Tipos compartidos | sí |
| `app/(app)/escanear/page.tsx` | Máquina de estados de la UI | no |
| `POST /api/cards/identify` | Matching contra el catálogo | backend |

---

## 1. `lib/scanner/camera.ts` — cámara, marco y recorte

### `startCamera(video)`

```ts
const IDEAL_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: 'environment' },   // cámara trasera
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};
```

`ideal` y no `exact`: en un iPhone sin sensor de 1920×1080 el navegador baja de
resolución en vez de fallar. Después asigna el stream, setea `playsinline` + `muted`
(necesario para que iOS no pause el video) y hace `await video.play()`.

`assertCameraUsable()` corre antes: sin `window.isSecureContext` lanza
`CameraErrorException('insecure-context')`. `localhost` cuenta como seguro, así que
`next dev` funciona por http; en producción hace falta https.

`getCameraErrorKind(err)` traduce la `DOMException` a los 5 `CameraError`:
`NotAllowedError`/`PermissionDeniedError`/`SecurityError` → `permission-denied`;
`NotFoundError`/`OverconstrainedError`/… → `no-camera`; `NotReadableError`/
`TrackStartError` → `camera-busy`.

### `waitForVideoFrames(video, timeoutMs = 8000)`

Espera a que el `<video>` tenga `videoWidth > 0`. Escucha `loadeddata` y `resize`, y
tiene un timeout de 8 s que resuelve con el estado real en vez de colgarse.

Existe por el doble montaje de StrictMode: `play()` rechaza con
`AbortError: interrupted by a new load request` cuando el elemento todavía no cargó
metadata, y en desarrollo eso pasa **siempre**. Reintentar cuando ya hay frames
resuelve el caso sin pedirle permiso al usuario ni mostrar un error falso. Todo el
contexto en [`gotchas.md`](gotchas.md).

### `frameMargin(w, h)` y `fitCardFrame(w, h, margin, aspect)`

`CARD_ASPECT = 63 / 88` — las medidas reales de una carta Pokémon en milímetros.

```ts
export function frameMargin(containerWidth: number, containerHeight: number): number {
  const smaller = Math.min(containerWidth, containerHeight);
  if (smaller <= 0) return 0;
  return Math.round(Math.min(56, Math.max(10, smaller * 0.045)));
}
```

El margen es **porcentual respecto de la pantalla** (4,5%, con piso 10 px y techo
56 px): en un teléfono alcanza con un margen chico, mientras que en un monitor
un margen fijo dejaría el marco pegado al borde.

`fitCardFrame` devuelve el mayor rectángulo con proporción de carta que entra en el
contenedor, centrado, y `null` si no hay lugar (o si queda de menos de 16×16 px).

**Por qué se calcula en JS y no con CSS.** La versión anterior era
`h-[68%] max-h-[520px]`. El tope fijo en píxeles recortaba el marco en monitores:
1920×900 daba un marco de ~340 px de ancho, el usuario tenía que alejar la carta
hasta que entrara, y al perder nitidez el OCR no la leía. El test
`card-frame.test.ts` cubre exactamente eso y verifica 6 tamaños (iPhone, Android
chico, laptop, monitor grande, 4K, portrait).

### `mapFrameToSourcePixels(frame, videoCssSize, videoIntrinsic)` — la matemática de `object-cover`

El `<video>` se muestra con `object-cover`: la imagen se escala para **cubrir** la
caja y se recorta por el centro. Sin compensar ese escalado, un recorte tomado de la
pantalla saldría corrido.

```ts
// object-cover: escala = max(cw/vw, ch/vh), contenido centrado.
const scale = Math.max(cw / vw, ch / vh);
const renderedW = vw * scale;
const renderedH = vh * scale;
const offsetX = (cw - renderedW) / 2;   // negativo si sobra contenido
const offsetY = (ch - renderedH) / 2;

const sourceX = (frame.x - offsetX) / scale;
const sourceY = (frame.y - offsetY) / scale;
const sourceW = frame.width / scale;
const sourceH = frame.height / scale;
```

Después recorta a los límites reales de la imagen y devuelve `null` (nunca `NaN`,
nunca negativo) si el rectángulo es degenerado. Con un video 1920×1080 en una caja
400×600, `scale = 0.5555`, el contenido renderizado mide 1066×600 y se recorta por
los dos lados: el marco `{x:20, y:0, w:360, h:600}` se traduce a
`{x:636, y:0, w:648, h:1080}`.

### `captureFrame(video, { maxWidth = 1200, crop })`

1. Normaliza el crop con `normalizeCrop` (clamp a los límites de la imagen, `null` si
   queda de menos de 16×16).
2. Escala a `maxWidth` (1200 px) para noándole megapíxeles al worker.
3. `ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height)` — el
   recorte va en el `drawImage`, así que **recortar y escalar son la misma operación**.
4. `canvasToBlob(canvas, JPEG_QUALITY = 0.92)`. Si `toBlob` devuelve `null` (Safari en
   modo privado), cae a `toDataURL('image/jpeg', quality)` y decodifica el base64 a
   bytes a mano.

Devuelve `ScannedCapture { blob, width, height, cropped }`.

### Por qué se recorta al rectángulo de la carta

El fondo —mesa, mano, la habitación— es **ruido puro para el OCR**. No aporta
ninguna señal y lo único que hace es degradar la lectura del nombre: Tesseract
agrega líneas basura que compiten con el texto real. Recortar a la carta es la
optimización de mayor impacto de todo el pipeline.

Además, se usa **el mismo rectángulo que se dibuja en pantalla** (`frameRect` →
`mapFrameToSourcePixels` → `crop`), así que la guía y el recorte no pueden
desincronizarse: no hay dos fuentes de verdad.

---

## 2. `lib/scanner/preprocess.ts` — tres variantes

La matemática de píxeles trabaja **in-place sobre `ImageData`** y no toca el DOM, así
que es testeable en Node. Los helpers de canvas son la única parte que necesita
navegador.

| Variante | Qué hace |
|---|---|
| `original` | No toca la imagen. |
| `grayscale` | `toGrayscale` → `autoContrast` → `increaseContrast(1.4)`. **Es la variante por defecto.** |
| `threshold` | `toGrayscale` → `adaptiveThreshold` (Sauvola). |

```ts
export const VARIANT_ORDER: PreprocessVariant[] = ['original', 'grayscale', 'threshold'];
export const DEFAULT_VARIANT: PreprocessVariant = 'grayscale';
export const VARIANT_MARGIN = 0.25;
```

- `toGrayscale` usa luma **Rec. 601** (`0.299 R + 0.587 G + 0.114 B`), que es con la
  que el binarizador de Tesseract se siente mejor.
- `autoContrast` estira el histograma al rango 0..255 por canal.
- `adaptiveThreshold` es **Sauvola local** (`K = 0.2`, `R = 128`, `blockSize = 25`,
  `c = 8`), con la media y la desviación local calculadas por **imágenes integrales**
  (O(1) por píxel en vez de O(blockSize²)).

  ```ts
  const localThreshold = Math.max(
    0,
    means[p] * (1 + SAUVOLA_K * (stdDevs[p] / SAUVOLA_R - 1)) - c,
  );
  const value = lum[p] > localThreshold ? 255 : 0;
  ```

  Esto es lo que hace que las cartas holo funcionen: el reflejo especular mueve el
  brillo de fondo más de 100 niveles, lo que destruye un threshold global, pero
  apenas cambia la **desviación local**, que es lo que Sauvola mira.

### `sharpestOfVariants` y el por qué existe (y el por qué no alcanza)

`renderVariants` calcula las 3 y puntúa cada una con `normalizedEdgeSharpness`, que
es `edgeSharpness / desvíoEstándarDeLuminancia`. La normalización importa: la
energía de borde **cruda** siempre elige `threshold` (8/8) porque una imagen
binarizada la maximiza por construcción (cada transición salta los 255 niveles
completos), y esa es justamente la variante que rompe más lecturas de nombre. Con
margen 0,05 el selector abandonaba el default seguro y leía 4/8; con
`VARIANT_MARGIN = 0.25` se queda en el default y lee 7/8.

**Pero igual no se usa para elegir en el pipeline.** El comentario del archivo lo
dice: una estadística de imagen es un predictor débil de la calidad del OCR. Por eso
`pipeline.ts` corre el OCR de verdad y desempata con la confianza. `sharpestOfVariants`
quedó como API de diagnóstico, usada por `analyzeVariants` en los tests.

---

## 3. `lib/scanner/ocr.ts` — el worker de Tesseract

### Los assets son self-hosted

```ts
export const TESSERACT_SELF_HOSTED = {
  workerPath: '/tesseract/worker.min.js',
  corePath: '/tesseract/core',       // es un DIRECTORIO
  langPath: '/tesseract/lang',
} as const;

const useSelfHostedAssets = process.env.NEXT_PUBLIC_TESSERACT_CDN !== '1';
export const TESSERACT_ASSETS = useSelfHostedAssets ? TESSERACT_SELF_HOSTED : TESSERACT_CDN;
```

`public/tesseract/` pesa **~14 MB**:

| Archivo | Origen |
|---|---|
| `worker.min.js` | copia de `tesseract.js@7.0.0/dist/worker.min.js` |
| `core/tesseract-core-{simd,relaxedsimd,}-lstm.wasm.js` | `tesseract.js-core@7.0.0` |
| `lang/eng.traineddata.gz` (~2,9 MB) | `@tesseract.js-data/eng@4.0.0_best_int` |

Solo las variantes `-lstm` (el `createWorker('eng', 1, …)` usa `oem = LSTM_ONLY`) y
solo las `.wasm.js`, que ya traen el wasm embebido. `corePath` es un directorio a
propósito: tesseract.js elige la variante según el soporte de SIMD / relaxed SIMD
del dispositivo. Con `NEXT_PUBLIC_TESSERACT_CDN=1` se vuelve al jsDelivr.

Auto-hostear es lo que permite que **el escáner funcione sin internet** (y por eso
`public/sw.js` cachea `/tesseract/` con estrategia cache-first).

### Singleton

```ts
let workerPromise: Promise<TesseractWorker> | null = null;

export async function createOcrWorker(logger?: OcrLogger): Promise<TesseractWorker> {
  if (logger) activeLogger = logger;
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const { createWorker } = await import('tesseract.js');   // ← import DINÁMICO
    return await createWorker('eng', 1, { workerPath, corePath, langPath, logger });
  })().catch((err) => {
    workerPromise = null;                                     // permite reintentar
    throw new OcrUnavailableError(...);
  });
  return workerPromise;
}
```

Crear el worker cuesta 2-5 s (wasm + traineddata), así que todas las capturas
reusan la misma instancia hasta que se llame a `terminateOcrWorker()`. Si el boot
falla, `workerPromise` se resetea para que el próximo intento pueda reintentar.

El `import('tesseract.js')` es **dinámico y está dentro de una función**: es lo que
mantiene a tesseract fuera del grafo del server. Ver
[`gotchas.md`](gotchas.md#tesseractjs-nunca-en-el-server).

### `blocks: true` es obligatorio

```ts
const { data } = await worker.recognize(blobOrCanvas, {}, { text: true, blocks: true });
```

Sin `blocks: true`, en tesseract.js 6/7 **`data.lines` viene `undefined`**: el output
por defecto solo trae `text`. Las líneas viven anidadas en
`data.blocks[].paragraphs[].lines`, y sin ellas se pierde la confidence por línea,
que es justamente el número con el que `pickBestAttempt` decide.

`extractLines()` maneja las dos formas (plana y anidada) y `toOcrResult()` normaliza
todo a nuestro `OcrResult { text, lines, confidence }`, con la confianza en escala
0..1.

---

## 4. `lib/scanner/parser.ts` — candidatos, sin DOM

Puro y sin DOM a propósito: corre en Node, se testea contra fixtures reales y no
sabe nada del catálogo de 20.670 cartas (el cliente no lo tiene). El trabajo del
parser es entregar **candidatos limpios** al backend y un `nameGuess` razonable
para el feedback instantáneo de la UI.

El comentario del archivo lo resume: el OCR de una carta Pokémon es casi todo ruido.
El nombre se lee, el número casi nunca, y los dos llegan pegados a basura.

### Nombres: ventanas de 1 a 3 palabras con scoring

`collectNameCandidates(lines, lineConfidence?)` genera **toda ventana de 1..3 tokens
consecutivos usables** de cada línea y las puntúa:

| Señal | Peso |
|---|---|
| Ventana de 1 / 2 / 3 palabras | +0.45 / +0.5 / +0.2 |
| Largo del nombre (1 palabra) | <4 chars: **−0.2**; ≤4: +0.02; ≤14: +0.12; >14: −0.05 |
| Posición en el texto (`positionScore`) | `1 / (1 + línea * 0.12)` |
| Todo Title Case | +0.15 |
| Todo minúscula | **−0.3** |
| Le sigue "… on the Stage" (`STAGE_FOLLOWER`) | +0.25 |
| Posición dentro de la línea | −0.02 por token |
| El token aparece en >1 línea (eco en el texto de la carta) | hasta +0.3 |
| Confidence de la línea | `(conf/100 − 0.5) * 0.1` |

Tres filtros de base: `NOISE_TOKENS` (~250 entradas: boilerplate de carta, tipos,
textos de ataque, nombres de ilustradores, palabras en español) más
`CARD_WORD_BLOCKLIST`, longitud mínima 3, y rechazo de tokens puramente numéricos.

El `STAGE_FOLLOWER` es la señal más valiosa y no es obvia: el boilerplate de una carta
Base es `Evolves from X. Put <NOMBRE> on the Stage 1`. El nombre real casi siempre
está pegado a "on the Stage", así que una ventana con un follower de ese tipo es
muy probablemente el nombre.

### Números: deliberadamente conservador

```ts
// "25/203" → score 1    (número sobre total del set: la forma más confiable)
for (const match of text.matchAll(/\b(\d{1,3})\s*[\/／]\s*(\d{2,4})\b/g)) push(match[1], 1, 'slash');
// "NO.105", "N0.18" (OCR ama el 0 por la O) → 0.7
for (const match of text.matchAll(/\bN[oO0Q][.\s]*(\d{1,3})\b/g)) push(match[1], 0.7, 'no');
// "#65" suele ser el número de Pokédex al lado de LV.42 → 0.4
for (const match of text.matchAll(/(?:^|[^\w])#\s*(\d{1,3})\b/g)) push(match[1], 0.4, 'hash');
// números sueltos, opt-in (por defecto NO) → 0.1
```

Los números sueltos están **desactivados por defecto** (`includeBareNumbers`), porque
en una carta un número desnudo es casi siempre daño, HP o un número de Pokédex.

### Sets

`SET_HINTS` es una lista de ~70 nombres de set conocidos, y el regex se arma
**del más largo al más corto** para que la alternancia del regex pruebe
`Sword & Shield` antes que `Sword`.

Es una lista **hardcodeada y vieja**: llega hasta "Surprising Fates" y "Stellar
Crown", así que un set nuevo (30th Celebration, y) no llega nunca como hint. Es
la razón por la que el ranking no sabe de qué set es una carta nueva aunque el
nombre y el HP sí los lea bien.

### `setCode`: por qué está en `ParsedScan` y vale `null`

`ParsedScan.setCode` es el código de 3 caracteres que la carta imprime en la
esquina inferior izquierda (`"30C"`), y el backend ya lo bonusifica contra
`card_sets.ptcgoCode`. Es la señal de set más barata que existe: texto contra
vocabulario cerrado, sin comparar imágenes.

Volvió `null` a propósito, y **no** se deduce de `lines`. Medido sobre las 8
fixtures de `__fixtures__/ocr-samples.json`: buscar cualquier token de 3
caracteres que sea un código de set dio **22 falsos positivos y 0 verdaderos**.

| Código | De dónde sale el falso positivo | Set real |
|---|---|---|
| `EVO` | "**Evo**lves from Eevee" | xy12 (Evolutions) |
| `PAR` `CRE` `FLI` `MEG` | basura del OCR en el cuerpo de la carta | varios |
| `MEW` | la carta se llama **MEW** y va en mayúsculas | sv3pt5 (151) |

El problema es que el backend no sabe dónde está esa caja: `identify` recibe
`lines: string[]` sin coordenadas, así que cualquier token de 3 letras es
candidato. La señal es válida **con una banda medida**, que es la fase 8.1 de
`docs/files/08-VERSION-DISAMBIGUATION.md`, igual que `NAME_BAND_BOX`. Cuando
exista, se lee en el `mergeParsed` y se manda; hasta entonces, `null`.

### `parseOcrText(text, lines?)`

Arma el `ParsedScan`:

```ts
export interface ParsedScan {
  lines: string[];        // líneas CRUDAS: las que matchea el backend
  nameGuess: string | null;
  numberGuess: string | null;
  setHint: string | null;
  confidence: number;     // 0..1
}
```

`confidence` sale de la confidence promedio de las líneas de las que salió el
nombre (si hay confidences), o del score del mejor candidato normalizado por 2.2
(`MAX_SCORE_FOR_CONFIDENCE`) si no las hay.

---

## 5. `lib/scanner/pipeline.ts` — orquesta y elige

```ts
export function scoreAttempt(attempt: ScanAttempt): number {
  return (attempt.parsed.nameGuess ? 1 : 0) + attempt.ocr.confidence / 10;
}
```

**Un intento que sacó nombre le gana SIEMPRE a uno que no**, y la confianza solo
ordena entre los que lo sacaron.

Antes era al revés (`confidence + 0.05` por nombre) y estaba mal, con medición de
por medio: la confianza de la carta entera la domina el **cuerpo** de texto —poder,
ataques, flavor, autor— que se lee perfecto, y no el **nombre**, que es la línea
que Tesseract se come. Una variante con el nombre corrupto y el cuerpo impecable
ganaba con confianza alta, que es exactamente el síntoma de "no leyó el nombre".

`scanCardImage(source, options)` corre las 3 variantes **más la franja del
nombre**, OCR a cada una, y devuelve `{ best, attempts, band, parsed, lines }`,
donde `parsed` es el resultado de `mergeParsed`. Cada `recognize` reusa el mismo
worker, así que el costo real son 4 OCR, no 4 boots.

**El por qué de las 3 variantes.** Está en el comentario del archivo y es
medible: la variante que da mejor OCR **varía por carta** (reflejo del foil, foco,
exposición). Medido en 8 cartas reales, ninguna estadística de imagen predice cuál
va a ganar — la "más nítida" por energía de borde fue la **peor** 3 veces de 8. El
único desempate confiable es el propio motor de OCR.

## 5b. La franja del nombre (`NAME_BAND_BOX`)

Es la parte que hizo que la app funcionara. No es una variante de píxeles: es una
**región** de la imagen, y por eso vive en `preprocess.ts` pero fuera de
`VARIANT_ORDER` (`applyVariant` transforma la imagen entera del mismo tamaño).

```ts
export const NAME_BAND_BOX = { x: 0.02, y: 0.02, width: 0.58, height: 0.11 } as const;
```

**Por qué existe.** Con Tesseract real sobre las 8 cartas de la muestra, OCRear la
carta **entera** da:

| | Charizard | Weedle | Alolan Marowak | Aggron |
|---|---|---|---|---|
| Carta completa | `sthce` ❌ | `a TY \AZ` ❌ | `z STAGE] J)` ❌ | `& = ii ag` ❌ |
| Carta completa ×2 | `STAGE 2…` ⚠️ | `4 \| TN` ❌ | `re STAGE]` ❌ | `Aggron` ⚠️ |
| **Solo la franja** | `Charizard` ✅ | `Weedle` ✅ | `Alolan Marowak` ✅ | `Aggron` ✅ |

El cuerpo de la carta se lee **perfecto** ("Pokémon Power: Energy Burn", "Spits
fire that is hot enough to melt boulders") y el nombre sale como basura. La causa
es la **segmentación automática de página** de Tesseract sobre el layout de una
carta: muchos bloques, y la línea del nombre es chica y va en tipografía
estilizada sobre el arte, así que no la segmenta. Ampliar la imagen **no** lo
arregla; recortarla sí.

Se probaron 3 geometrías y esta es la mejor: **8/8**. Las otras dos (más anchas o
más bajas) dan 7/8 y 6/8.

`mergeParsed` después combina lo mejor de las dos pasadas: el **nombre** sale de
la franja y el **número de carta y el set hint** de la carta entera, que es donde
están. Las líneas van con la franja primero para que el nombre no se caiga por
`MAX_LINES`.

## 5c. Detección de la carta y rotación (`detectCardRect`)

Esto vino de las fotos reales del usuario, y es lo que faltaba para el flujo de
**subir un archivo**: la cámara ya recorta al marco guía (`captureFrame`), pero una
foto subida mandaba la imagen entera, con la carta de costado y la frazada de
fondo alrededor.

```ts
export const CARD_ASPECT = 63 / 88;      // proporción de una carta
export function detectCardRect(imageData: ImageData): CardRect | null
export function normalizeCardImageData(imageData: ImageData): NormalizedCard
```

**La rotación no es un detalle: Tesseract no lee texto rotado 90°.** Y el caso de
tener que rotar es más raro de lo que parece: el browser aplica el EXIF de la
foto (`image-orientation: from-image`) antes de que la veamos, así que las cartas
de un celular llegan **verticales**. Medido: con el EXIF ya aplicado la banda del
nombre lee "Umbreon"; forzando el caso de carta de costado (los píxeles crutos) la
misma banda sale vacía y el escaneo pasa de 4/5 a 2/5. La rotación es la red de
seguridad, no el camino común. En las 5
fotos que motivaron esto la carta estaba siempre de costado, y con el texto
girado no se leía ni el nombre ni el cuerpo. Como la proporción de una carta es
conocida, la orientación sale gratis del rectángulo detectado: si el rect es más
ancho que alto, la foto está rotada.

**Cómo se detecta** (todo en `preprocess.ts`, pixel math puro, sin ML):

1. Se reduce la imagen a 180 px de ancho.
2. Se proyectan los bordes en los dos ejes: `columns[x]` (bordes verticales =
   los lados de la carta) y `rows[y]` (bordes horizontales).
3. Se toman los 7 picos más fuertes de cada eje y se prueba cada combinación
   (~1500 candidatos) como rectángulo.
4. Gana el que mejor combina **coherencia** (qué fracción de cada lado es una
   línea recta y completa), **intensidad**, **proporción** (±30% de 63/88) y
   **área**.

El término de coherencia es el que descarta las rayas curvas de una frazada: un
borde recto está a lo largo de todo el lado, una curva de la tela solo en un
tramo. Y el término de área es el que hace que gane la carta entera y no un
sub-rectángulo de ella (el marco interno del arte también es un rectángulo recto
de proporción parecida, solo que más chico).

**La coherencia promedia los 3 mejores lados de los 4, no los 4.** Una funda
apoyada sobre una superficie oscura siempre pierde un lado —el de abajo se funde
con la sombra—, y con el promedio de los 4 esa carta no se detectaba nunca: la
banda del nombre se calculaba sobre la foto entera y salía un pedazo de frazada.
Exigir 3 de 4 sigue descartando el ruido (un pliegue de la frazada es parejo en
0-2 lados, no en 3) sin bajar `MIN_SIDE_COHERENCE`.

**El rectángulo se agranda 6% solo en horizontal** (`RECT_MARGIN`), y en
horizontal a propósito: cuando el borde de la funda no se ve, el detector se
engancha al marco interior del arte y el recorte salía apretado, partiendo el
nombre por la izquierda. En vertical no se toca nunca porque la banda del nombre
se ancla en el borde superior de la carta (2% a 13% del alto del recorte):
agrandarlo también arriba corría la banda hacia la funda y el nombre salía de
las tres pasadas, que es peor que un carácter clipped.

Si no encuentra nada con confianza devuelve la imagen **sin tocar** — que es lo
que pasa con las fotos de estudio y con la cámara, donde el recorte ya lo hizo
`captureFrame`. `MAX_COVERAGE` además impide que devuelva "la carta es toda la
imagen", que es el caso de los fixtures y de las fotos ya recortadas.

**Medido sobre las 5 fotos reales** (colección 30th Celebration, cartas en funda
sobre una frazada): detección **5/5** y recorte correcto, con la foto tal como
llega sin orientar. Con la orientación ya aplicada —que es lo que hace el
browser, porque el HEIC trae EXIF— la carta entra vertical, la detección acierta
5/5 y no hace falta rotar. Verificado con las capturas: la banda del nombre sale
con "Umbreon ex" y "Pikachu" completos.

Bajar `MIN_SIDE_COHERENCE` a 0.45 hace que las 5 "detecten" en el caso de
orientación ya aplicada, pero en la foto oscura encuentra un rectángulo falso y
la rota 90°: peor que no detectar, porque Tesseract no lee texto rotado. El
umbral queda en 0.5 a propósito, con la detección fallando hacia "usar la foto
entera" y no hacia "recortar mal".

## 5d. La banda se pasa 6 veces: 3 pre-procesados × 2 segmentaciones

Medido sobre esas mismas 5 fotos, **no hay un pre-procesado que sirva para
todas**: la franja cruda lee "Umbreon" y no "Chandelure"; con grayscale lee
"Shining Celebi" y no "Umbreon"; con threshold lee "Chandelure" y no "Umbreon".
Mismo recorte, distinto pre-procesado, nombre distinto.

Y tampoco hay **un modo de segmentación** que sirva para todas
(`NAME_BAND_PAGE_SEG_MODES`). El default de Tesseract (AUTO, PSM 3) hace análisis
de layout de página completa, y sobre una tira ancha y baja se equivoca de
bloque. Lo medido banda por banda:

| | `6` (bloque) | `7` (línea) | `3` (AUTO, default) |
|---|---|---|---|
| Shining Celebi | **"Shining Celebi"** ✅ | "far Celebi" | "Ee { {i Celebi." |
| Pikachu | "pikachu" | **"Pikachu"** ✅ | "" |
| Umbreon | "CTY EE - Ls Sy n…" ❌ | **"=X Umbreon €X"** ✅ | **"" (vacío)** |
| Chandelure | **"Chandelure!"** ✅ (umbral) | "Chapdeidl" | "" |
| Hisuian Zorua | "nn fifa C010" | "pie Zeus" | "RE LZ Loe RE" |

El `3` se descarta por una razón muy concreta: en la banda de Umbreon devuelve
**cadena vacía**, y sin nombre el identify se quedaba con la basura de la carta
entera —el OCR leía "nbreon" y "preon", nunca "Umbreon"— y ganaba **Pokémon
Park** (que es una carta real, Aquapolis 131) con 0.87, emparejando el token
"Pokémon" que aparece en el texto del cuerpo de la carta. Ese fue el bug que
reportó el usuario al subirla desde el frontend.

Los 3 pre-procesados × los 2 modos son 6 pasadas de la banda, y
`mergeBandAttempts` **une las líneas** de todas (el backend matchea difuso sobre
la unión) y se queda con el nombre de la pasada con más confianza del parser.
Invertir la banda se probó y no aporta (0 netas sobre 5), así que no está.

## 5d-bis. La imagen se achica a 1400px antes del OCR (`MAX_CARD_EDGE`)

Las fotos de un celular llegan en 4032×3024, y **a ese tamaño Tesseract lee
peor**: la banda de Umbreon a resolución completa daba "IVR" y la misma banda a
1400px da "Umbreon". Es el tamaño de letra que Tesseract espera —una carta a
~1400px tiene el nombre a ~30px de alto—; con 3000px la segmentación automática
se equivoca de bloque. De paso abarata el OCR: medido sobre una foto a
resolución completa, 6 pasadas sin cap dan 12.0s y 9 pasadas con cap dan 8.6s,
O sea el costo por pasada se reduce a menos de la mitad.

El recorte es con caja (promedio por canal) y **conserva el color**: la función
`downscale` que ya existía para la detección promedia la luminancia y servía
para buscar bordes, no para OCRear.

Ojo con `mergeBandAttempts`: si **ninguna** de las tres pasadas saca nombre
(carta full-art con el nombre en contorno blanco) la lista de las que tienen
nombre queda vacía, y un `reduce` sin valor inicial reventaba con "reduce of
empty array with no initial value" matando el escaneo entero. Se cae a la lista
completa en ese caso, y hay un test que lo cubre.

## 5e. Ver los recortes intermedios (capturas a disco)

Con `NEXT_PUBLIC_SCAN_CAPTURE=1` en el `.env`, cada corte que hace el pipeline
se manda como PNG a `POST /api/jobs/scan-capture` y el backend lo escribe en
`/tmp/pokemon-scanner-captures/<run>/`. El `<run>` es `run-N` con el contador de
la corrida, así que escanear dos veces la misma foto no pisa la anterior.

```
/tmp/pokemon-scanner-captures/run-3/
├── 01-foto-original.png                 la foto tal cual la subió el usuario
├── 02-carta-detectada-rot0.png          la carta recortada y enderezada
├── 03-variante-0-original.png           la carta entera, sin transformar
├── 03-variante-1-grayscale.png
├── 03-variante-2-threshold.png          la misma, en blanco y negro
├── 04-banda-0-original-psm6.png         el recorte del nombre, que es el que
├── 04-banda-0-original-psm7.png             más se nota cuando algo falla
├── ...                                    (3 pre-procesados × 2 segmentaciones)
└── 04-banda-2-threshold-psm7.png
```

Las capturas se achican a 1000px de ancho antes de mandarse. Para correr el
pipeline completo con **OCR real** contra la API real:

```bash
# Las fotos a resolución completa, que es lo que llega del celular. Con copias
# de 1400px los resultados dan distintos y no reproducen lo que ve el usuario.
for i in 4985 4986 4987 4988 4989; do
  sips -s format png ~/Downloads/IMG_$i.HEIC --out /tmp/cards-full/IMG_$i.png
done

pnpm exec vitest run --config vitest.e2e.config.mts      # las 5
SCAN_E2E_PHOTOS=IMG_4987 pnpm exec vitest run --config vitest.e2e.config.mts
```

El script mockea `lib/scanner/ocr` (que se niega a correr fuera del browser)
manteniendo la misma lógica pero llamando a tesseract.js en modo Node: **el OCR
es real**, solo cambia quién lo invoca. Ojo: en Node no se le pasa `workerPath`,
tesseract usa su worker propio y darle el del `public/` lo deja colgado.

---

## 6. `POST /api/cards/identify` — el backend matchea

El cliente manda las **líneas crudas** y el backend hace el fuzzy matching. La idea
es explícita: el backend tiene las 20.670 cartas y el cliente no, así que no tiene
sentido que el cliente adivine el nombre.

```ts
export const IDENTIFY_PATH = '/cards/identify';
export const IDENTIFY_LIMIT = 8;

await identifyCard({
  lines: parsed.lines.slice(0, 60),
  name: parsed.nameGuess ?? undefined,
  number: parsed.numberGuess ?? undefined,
  setHint: parsed.setHint ?? undefined,
  setCode: parsed.setCode ?? undefined,   // siempre undefined por ahora
  limit: IDENTIFY_LIMIT,
});
```

`lines` es la señal principal; `name`/`number`/`setHint`/`setCode` son candidatos
extra con bonuses chicos. El DTO (`IdentifyDto`) valida con `class-validator`:
`@ArrayMaxSize(60)` en `lines`, `@MaxLength(80)` en `name` y `setHint`,
`@MaxLength(20)` en `number`, `@MaxLength(8)` + `@Matches(/^[A-Za-z0-9-]+$/)` en
`setCode`, y `limit` entre 1 y 20 (default 8).

La respuesta trae dos cosas nuevas que hacen falta para depurar:

- **`rawScore`**: `score` viene saturado en 1, así que el top-1 y el top-2 salen
  los dos en `1.00` y no se ve el margen. `rawScore` lo expone (con `setCode` un
  match bueno da 1.17-1.29).
- **`signals`**: por señal, si votó a favor (`true`), si se leyó y no coincidió
  (`false`) o si no votó porque no se pudo leer (`null`). Es lo que separa "el
  ranking se equivocó" de "el OCR no leyó esto", que antes se adivinaba desde el
  síntoma en pantalla.

Del lado del backend (`identify.service.ts`) lo fuerte del matching:

- Reusa la estrategia en capas de `CardsService.search()`: `ILIKE` + trigram con
  `TRIGRAM_THRESHOLD = 0.2` sobre los índices GIN de `cards.name` / `card_sets.name`.
- `NUMBER_BONUS = 0.06` a propósito: el número impreso es una señal **muy débil**.
- `WORD_COUNT_BONUS = 0.18`: si el OCR leyó una ventana de 2-3 palabras
  (`"polan Marowak"`) tiene que preferir un nombre de 2-3 palabras
  (`"Alolan Marowak"`) por sobre el match parcial de una sola (`"Marowak"`).
- `SHORT_NAME_FACTOR = 0.2`: hunde las cartas de energía, que se llaman `"N"`,
  `"F"`, `"W"`, `"C"`… con esos nombres cualquier ruido de OCR matchea perfecto.
- `MIN_SCORE = 0.25` y `MAX_CANDIDATES = 200` de candidatos intermedios.

---

## Hallazgos empíricos

Salieron de correr el pipeline real (Tesseract 7) contra las imágenes de carta de
pokemontcg.io. Las 8 fixtures viven en
[`lib/scanner/__fixtures__/ocr-samples.json`](../lib/scanner/__fixtures__/ocr-samples.json)
y los resultados se reproducen con los tests opt-in de
[`testing.md`](testing.md).

### El nombre se lee bien; el número, casi nunca

**El nombre de la carta sí se lee.** Es la señal más fuerte del OCR.

**El número de carta casi nunca se lee.** Lo que aparece en la posición del número
suele ser otra cosa:

| Carta | Lectura real del OCR | Qué es en realidad |
|---|---|---|
| `sm4-12` Alolan Marowak | `NO. 105` | **105 es el número de Pokédex** de Alolan Marowak. El número de carta es 12. |
| `pl1-1` Ampharos | `I NO.18 Light Pokémon` | **18 es el Pokédex** de Ampharos. El número de carta es 1. |
| `base1-1` Alakazam | `LV.42 #65` | **65 es el Pokédex** de Alakazam. El número real, `1/102`, aparece al final de la línea de copyright. |
| `neo1-10` Meganium | `LV. 54. #154` | **154 es el Pokédex** de Nidoran. |
| `bw10-26` Abomasnow | `7 1208` | Ruido. |
| `xy5-1` Weedle | `"AD 11 Cua` / `c/Weedle ~~ ,508@` | Ruido. |

O sea: la forma `#65` es **sistemáticamente** el número de Pokédex (la Pokédex
impresa al lado de `LV.42`), y la forma `NO. 105` es la entrada de la línea de
estadísticas. Por eso el parser le da 0.4 al `#` y 0.7 al `NO.`, y por eso el
backend le da `NUMBER_BONUS = 0.06`.

Hay un caso donde el número sale bien **por casualidad**: `base1-4` da
`numberGuess === '4'` y Charizard *es* la 4/102, pero viene de la línea
`115% 4 Charizard &` — el `4` está ahí de milagro, no porque se haya leído el
número de carta.

### El nombre viene mezclado con ruido

Líneas reales de las fixtures:

```
base1-4:  "115% 4 Charizard &"                    ← el nombre, con 3 piezas de basura alrededor
xy5-1:    "“AD 11 Cua"  /  "c/Weedle ~~ ,508@"     ← dos líneas, el nombre en la segunda
bw10-26:  "| /Abomasnow 7 1208"
hgss4-1:  "Aggron "a0 @"
pl1-1:    "Ampharos.s7 »130 4)"
neo1-10:  "STAGE 2 Evolves from Bayleef Put Meganium Oh the Stage | card"
```

Es decir: el parser **no puede** buscar el nombre exacto, tiene que generar
candidatos y dejar que el backend los matchee. De ahí las ventanas de 1..3 palabras
con scoring en vez de un `includes()`.

Un detalle de OCR que confirma que el preprocesado funciona: la línea del boilerplate
Base 1 sale casi perfecta (`Evolves from Kadabra Put Alakazam on the Stage | card`),
mientras que la línea de stats sale destruida (`SE 30`, `y A +N`, `a PA k-`).

### El preprocesado sirve, y qué variante gana varía por carta

Aciertos en el nombre con las 8 fixtures, por variante:

| Variante | Nombres leídos |
|---|---|
| `original` | 6/8 |
| `grayscale` | **7/8** ← la mejor, y la que está de default |
| `threshold` | 4/8 |

Y **la variante ganadora cambia según la carta**. No hay una que siempre gane: por
eso se prueban las 3 y se gana por **confidence del OCR**, no por nitidez de la
imagen. Elegir por nitidez con una métrica de imagen es exactamente el error que
documenta `preprocess.ts` (la "más nítida" por energía de borde cruda gana 8/8 y
lee 4/8).

Costo: **3-Decode por escaneo**, y el tiempo total depende de la máquina. El test
E2E lo mide e imprime por consola (`ocrMs`, `identifyMs`, `totalMs`, con promedio y
máximo) justamente para que el número real se vea en cada corrida en vez de quedar
hardcodeado acá. Para tener una referencia, el timeout del cliente es
`SCAN_TIMEOUT_MS = 90_000` para el OCR y `IDENTIFY_TIMEOUT_MS = 30_000` para el
`identify`: por debajo de esos valores se considera que algo se colgó.

### La limitación conocida: `sm4-12`, Alolan Marowak

Es la única carta de la muestra que no entra en el top-1, y **ya no es por el
nombre**: la franja del nombre ahora lo lee bien ("Alolan Marowak"). El problema
es que en esa carta **no hay nada más que leer**:

```
 0 | z
 1 | STAGE] J)
 2 | 85 " EEvolves from Cabone Wai iz: :
…
19 | NO. 105 Bone Keeper Pokémon HT: 3'03" WT. 75.0 Ibs.
```

- No hay HP, ni numeración impresa "N/M", ni artista, ni rareza, ni nombre de set:
  el foil oscuro se come todo. Lo único legible es `"NO. 105"`, que es el
  **número de Pokédex** de Alolan Marowak, no el número de carta (12), y
  `"Bone Keeper"`, que es el encabezado del flavor de abajo.
- Como no hay atributos que extraer, las señales de desempate del backend no
  aportan nada y el ranking queda para la palabra suelta "Marowak", que matchea
  perfecto contra cartas reales de otros sets (Base, Jungle, Stellar Crown…).

Lo que **sí** mejoró con los atributos: la carta correcta pasó de estar **fuera
del top-3** a estar **3ra**, así que el usuario la elige de la lista. Y cuando el
score es bajo, la UI ofrece la búsqueda manual, que es el fallback para esto.

**Tope real medido: 7/8 en top-1 y 8/8 en top-3**
(`expect(top1).toBeGreaterThanOrEqual(7)` y `expect(top3).toBeGreaterThanOrEqual(8)`
en `identify-e2e.test.ts`). Ningún ranking puede resolver una carta de la que no
se leyó un solo atributo: el problema es de información, no de scoring.

### Limitaciones secundarias que vale conocer

- **El OCR es `eng`.** Las cartas japonesas no se leen, y el español entra en
  `NOISE_TOKENS` justamente para que el parser no lo confunda con un nombre.
- **`MAX_LINES = 60`.** Las 60 primeras líneas del OCR. En una carta el nombre está
  siempre arriba, así que no se pierde nada útil.
- **La franja del nombre asume que la carta llena el marco.** Con la detección de
  carta (§5c) esto ya no aplica al flujo de archivo: la carta se recorta y se rota
  antes de cualquier OCR, así que la banda es siempre de la carta. Solo queda el
  caso de que la detección falle, y ahí se usan las 3 variantes de la foto
  entera como siempre.
- **Una carta full-art con el nombre en contorno blanco puede no leerse.** Es el
  caso de `Hisuian Zorua` (30th Celebration, ilustración completa): el OCR parte
  el nombre en fragmentos ("ZO RUA", "Hisia") y ningún candidato del backend llega
  al nombre real. Ningún pre-procesado de los 4 que se prueban lo arregla. Con una
  carta de las 5 fotos testeadas es 1/5, y la UI cae en la búsqueda manual.
- **El `identify` puede tardar.** Por eso `/escanear` lo envuelve en
  `IDENTIFY_TIMEOUT_MS = 30_000` y el OCR en `SCAN_TIMEOUT_MS = 90_000` (por si el
  worker se cuelga, la app no queda trabada).
- **El ranking del backend es contra el catálogo espejado.** Si pokemontcg.io
  agrega una carta y el sync no corrió, no hay forma de encontrarla desde el
  escáner.
