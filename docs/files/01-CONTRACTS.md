# 01: Contratos (extensión compatible de `POST /api/cards/identify`)

> Fuente de verdad de la forma de request y response. Todo lo que no está en este
> documento sigue igual que hoy: si un campo nuevo es opcional y el cliente viejo
> no lo manda, la respuesta vieja tiene que seguir siendo válida.

## 0. Lo que ya existe y no se toca

`POST /api/cards/identify` (público, sin auth) hoy acepta y devuelve:

```ts
// Request — IdentifyDto
{
  lines?: string[];    // máx 60, líneas CRUDAS del OCR del cliente
  name?: string;       // mejor guess del cliente
  number?: string;
  setHint?: string;
  limit?: number;      // 1..20, default 8
}

// Response — IdentifyResultDto
{
  candidates: Array<{
    card: CardDto;     // la carta completa, con set
    score: number;     // 0..1
    matchedText: string;
    prices: CardPriceDto[];
    price: CardPriceDto | null;
  }>;
  extracted: { name: string | null; number: string | null; setHint: string | null };
  totalCandidates: number;
}
```

El cliente (`frontend/types/api.ts`) tiene el tipo duplicado a mano, como siempre:
**si tocás un DTO, actualizá los dos lados en el mismo commit.**

## 1. Request: agregar `image`

```ts
export interface IdentifyDto {
  // ... los campos de hoy, sin cambios
  lines?: string[];
  name?: string;
  number?: string;
  setHint?: string;
  limit?: number;

  /** Nuevo, opcional. JPEG/PNG/WebP, máx 1.5 MB (ver §6). */
  image?: string;          // data URL, no multipart: mantiene el endpoint simple
  quality?: ScanQuality;   // calidad medida por el cliente (§5)
}
```

**Por qué data URL y no `multipart`**: cambiar a multipart rompe el cliente, el
DTO de validación y los tests por poco gain — el embedding necesita los bytes de
la imagen, no un archivo. Un `data:image/jpeg;base64,...` de ≤1.5 MB son ~2 MB de
JSON, que es lo que el body parser ya acepta (`useBodyParser('json', { limit:
'10mb' })`).

**`image` es opcional a propósito.** Sin imagen el endpoint se comporta exactamente
como hoy, con el ranking de texto. Eso permite desplegar el backend antes que el
frontend, y sirve de control en el eval para medir el efecto del visual.

## 2. Response: campos nuevos (todos opcionales)

```ts
export type ScanStatus = 'confident' | 'ambiguous' | 'low' | 'not_in_catalog';

export interface IdentifyResultDto {
  candidates: IdentifiedCandidateDto[];   // sin cambios
  extracted: ExtractedDto;                // sin cambios
  totalCandidates: number;                // sin cambios

  /** Nuevo. Ausente si el request no trajo `image`. */
  status?: ScanStatus;
  hints?: ScanHint[];

  /** Nuevo. Por etapa, en ms. */
  timings?: ScanTimings;

  /** Nuevo. Solo para diagnóstico del eval; la UI no lo necesita. */
  visual?: VisualDebug;
}

export interface ScanTimings {
  decodeMs: number;
  embedMs: number;
  searchMs: number;
  matchMs: number;
  totalMs: number;
}

export type ScanHint =
  | 'too_dark'        // el contraste no alcanza (medido en cliente)
  | 'glare'           // % de píxeles saturados alto
  | 'partial_card'    // el recorte toca el borde de la foto
  | 'low_confidence'; // score bajo con foto buena

export interface VisualDebug {
  topScore: number;        // coseno del mejor candidato
  medianDistractor: number; // mediana de los 200
  poolSize: number;        // cuántos entraron al ranking de texto
  calibration: 'unset' | 'calibrated';
}
```

`visual` va en la response pero **no en el contrato público de la UI**: es para
el eval y para calibrar. Se puede apagar con un flag de server.

## 3. `status`: reglas exactas

```
si no viene `image`                                  → status ausente (comportamiento de hoy)

si quality.blurred o quality.partialCard             → 'low'
si top1.score < T_LOW                               → 'low'
si top1.score ≥ T_HIGH y (top1 - top2) ≥ MARGIN      → 'confident'
si top1.score ≥ T_LOW                                → 'ambiguous'
resto                                               → 'low'
```

| Constante | Valor inicial | Dónde vive |
|---|---|---|
| `T_HIGH` | 0.85 | env `IDENTIFY_T_HIGH` |
| `T_LOW` | 0.55 | env `IDENTIFY_T_LOW` |
| `MARGIN` | 0.08 | env `IDENTIFY_MARGIN` |
| `NOT_IN_CATALOG_FLOOR` | **sin valor** | se fija después de `02-EMBEDDINGS-spike.md` |

**`not_in_catalog` está deliberadamente sin definir todavía.** Es el estado que
dice "la foto está bien pero no la tenemos". Se define con la distribución real
de cosenos, no antes, y con dos condiciones:

1. `top1.score < NOT_IN_CATALOG_FLOOR`, con un piso **conservador** (por debajo
   del percentil 5 de "misma carta" en el spike).
2. La foto pasó las de calidad: nítida, sin `too_dark`, sin `partial_card`.

Por qué conservador: un `not_in_catalog` falso es **peor que un candidato
equivocado**, porque el usuario se queda sin resultado. Por eso
`not_in_catalog` **nunca es terminal**: la UI siempre ofrece búsqueda manual y
"reportar carta faltante" (`GET /api/cards/search` ya existe).

## 4. Cómo se combinan visual y texto (la decisión de diseño)

**El embedding pre-filtra; no se fusionan scores.** En `identify()`:

```
1. EmbedderService.embed(image)              → Float32Array(384) L2-normalizado
2. top-200 por producto punto contra card_embeddings (en memoria)
3. Si topScore < NOT_IN_CATALOG_FLOOR → not_in_catalog, sin tocar el SQL
4. El ranking de texto corre SOLO sobre esos 200
```

Por qué así y no `fused = wV*visual + wT*texto`:

| | Pre-filtrado | Fusión ponderada |
|---|---|---|
| Reutiliza el ranking actual | Sí, sin cambios | No, hay que reescribir la fórmula |
| SQL | 200 filas en vez de 20.670 | Igual que ahora |
| Pesos a calibrar | 3 (umbrales) | 4 (más la escala del coseno) |
| Riesgo | Se pierde la carta correcta si el visual la excluye | Más difícil de debuggear |

**El riesgo del pre-filtrado es real y hay que medirlo**: si el visual pone la
carta correcta en el top-200, el texto la rescata; si no, se pierde para
siempre. Por eso el pool es 200 y no 20, y por eso `visual.poolSize` está en la
response. Si el eval muestra que el top-200 pierde cartas que el ranking de texto
encontraba, se sube el pool o se cae a intersección.

### Escala del coseno

**No hay escala fija.** El plan viejo proposer `clamp((cos-0.5)/0.5, 0, 1)` y es
una suposición: la distribución de cosenos de DINOv2 depende del modelo, de si
indexamos aumentaciones y de la base. Se mide en el spike y se guarda en
`embeddings.meta` (JSON en la tabla de settings):

```json
{ "model": "dinov2-small-int8", "dim": 384, "sameP05": 0.71, "sameP50": 0.86,
  "diffP50": 0.42, "n": 200, "date": "2026-09-28" }
```

Mientras `calibration: 'unset'`, `not_in_catalog` **no se emite nunca**: es
preferible devolver candidatos poco seguros antes que decir "no la tenemos".

## 5. `quality`: lo mide el cliente

```ts
export interface ScanQuality {
  /** Luminancia media 0..255. Ya se puede calcular en el canvas. */
  luminance: number;
  /** % de píxeles con V > 250 en el recorte. */
  glareRatio: number;
  /** Varianza Laplaciano normalizada, la misma de `edgeSharpness()`. */
  sharpness: number;
  /** El recorte toca el borde de la foto. */
  partialCard: boolean;
}
```

Los cuatro ya son cheaply calculables en el cliente con lo que hay
(`preprocess.ts` tiene `edgeSharpness`/`normalizedEdgeSharpness` y el pipeline ya
mide la carta detectada). `quality` es **informativo**: el backend lo usa para
`status` y `hints`, nunca para descartar una carta.

`too_dark` y `glare` tienen motivo concreto: la foto de Umbreon del usuario es
una funda blanca sobre una frazada oscura, con el borde de abajo fundido con la
sombra. Es el caso donde menos contraste hay, y es justo donde el hint le
dice al usuario "buscá más luz" en vez de "no pudimos leer la carta".

## 6. Límites de tamaño (dos constantes, no una)

| Constante | Valor | Quién la aplica | Para qué |
|---|---|---|---|
| `UPLOAD_MAX_BYTES` | 1.500.000 | Server: rechaza con 413 | Tope duro |
| `CLIENT_TARGET_BYTES` | 300.000 | Cliente: baja calidad si puede | Objetivo de la UI |

No es redundante: el cliente **intenta** llegar a 300 KB, y si no puede (foto
ruidosa) manda hasta 1.5 MB. El server nunca acepta más de 1.5 MB.

## 7. Datos nuevos

```sql
CREATE TABLE card_embeddings (
  cardId      TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  model       TEXT NOT NULL,        -- 'dinov2-small-int8'
  dim         INTEGER NOT NULL,     -- 384
  vector      REAL[] NOT NULL,      -- 384 floats
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Tablas: snake_case. Las columnas camelCase (AGENTS.md §3.4).
CREATE INDEX card_embeddings_model_idx ON card_embeddings (model);
```

En memoria, al arrancar: un `Float32Array` de `20.670 × 384 × 4 B = 32 MB` con un
`Map<string, number>` de cardId → índice. Búsqueda por producto punto: **4-8 ms**.

**Reevaluar brute force** si el índice pasa de **300k vectores** (por ejemplo, si
las aumentaciones se multiplican x4 → 82k, todavía bien; x16 → 331k, ahí sí
conviene HNSW o pgvector). La decisión se toma con el número delante, no por
defecto.

## 8. Lo que se mantiene igual

- El OCR **no** se mueve al backend. `tesseract.js` fuera del grafo del server
  (AGENTS.md §3.6).
- El matcher de texto: token + penalización de cobertura, tal cual. **No** se
  reemplaza por `1 - levenshtein/maxLen`, que penaliza justo los casos que
  importan ("far Celebi" vs "Shining Celebi" da ~0.5 y hunde la carta correcta).
- La tolerancia de aspecto de `detectCardRect` sigue en 0.3. Con 0.08 se
  rechazan fotos reales; se baja solo si el eval muestra falsos positivos.
- La banda del nombre: 2%–13% del alto y 58% del ancho, que es lo medido, con
  los 3 pre-procesados × 2 modos de segmentación.
- Los precios, las colecciones, el share y los amigos: sin cambios.
