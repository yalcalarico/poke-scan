# 07: Integración, riesgos y límites

Para el coordinador. El orden de las cosas y lo que hay que vigilar.

## 1. Orden de trabajo

| Paso | Qué | Rol | Verificación |
|---|---|---|---|
| 0 | Dataset de fotos reales + línea base del OCR | QA | `pnpm eval` con top-1/top-3 y reporte |
| 1 | Spike de embeddings (`02-EMBEDDINGS-spike.md`) | Embeddings | Los 3 criterios de `00-README §6` |
| 2 | **Puerta**: decidir con los números de arriba | coordinador | Ola 2 u Ola 2' |
| 3 | `card_embeddings` + backfill + carga en memoria | Embeddings | Auto-recuperación: la referencia de cada carta se encuentra a sí misma |
| 4 | `identify()` con prefiltrado visual | Embeddings | `pnpm eval:diff` contra la línea base |
| 5 | `status` + `hints` + `timings` en el response | Embeddings | Top-1 no baja; la UI cambia de estados |
| 6 | UI: `confident` / `ambiguous` / `low` / `not_in_catalog` | Escaneo/UX | Los 4 escenarios navegables |
| 7 | Feedback con consentimiento para guardar imagen | Escaneo/UX | `allowStoreImage` falso ⇒ nada persistido |

**Regla del repo, aplicada acá:** ninguna calibración sin un `eval:diff` que
muestre que mejora. Si un cambio no se puede medir, no entra.

### La línea base es lo primero de todo

Sin ella no hay forma de saber si un cambio ayudó o empeoró. Ya existe una
versión chica y real: `frontend/scripts/scan-diagnostic.e2e.ts` corre el pipeline
completo con OCR real de Tesseract contra la API real, e imprime por foto qué leyó
cada pasada y por qué ganó ese candidato. Es el esqueleto de `pnpm eval`.

```
pnpm exec vitest run --config vitest.e2e.config.mts   # las 5 fotos
SCAN_E2E_PHOTOS=IMG_4987 pnpm exec vitest run --config vitest.e2e.config.mts
```

Dos cosas que aprendimos usándolo y que hay que conservar:

- El OCR **no** corre en Node con el shim de `window` puesto: tesseract toma el
  camino de browser y se cuelga. El mock del módulo mantiene la lógica pero
  invoca tesseract en modo Node, sin `workerPath`.
- El `worker` de Tesseract es un singleton y `setParameters` es estado
  persistente: cada pasada declara su PSM explícitamente, o la segunda carta
  escaneada en la misma sesión hereda el modo de la banda de la anterior. Ya
  pasó.

## 2. Riesgos

| Riesgo | Prob. | Impacto | Mitigación | Quién |
|---|---|---|---|---|
| El embedding no discrimina fotos reales | Media | **Alto** | Es la puerta: se mide antes de invertir. Si falla, Ola 2' |
| La referencia correcta cae fuera del top-200 | Media | Alto | `visual.poolSize` en la response; el eval lo detecta; subir pool o intersectar |
| `not_in_catalog` falso bloquea al usuario | Media | Alto | Piso conservador, nunca terminal, siempre con búsqueda manual |
| Preprocesado de embedding distinto indexer vs runtime | Baja | **Crítico** | Hash del preprocesado en `meta`, API se niega a arrancar si no coincide |
| `onnxruntime-node` nativo rompe el build ESM de Nest | Media | Medio | Probarlo en una rama chica **antes** de la Ola 2, no en la integración |
| Doble fuente de verdad indexer/query | Media | Crítico | Un solo módulo, como hoy con `pg_trgm`. Test de paridad |
| Imágenes de referencia: términos de uso | Media | **Alto** | Ver §3. Decisión del usuario, con alternativa ya en uso |
| Ingesta de 20k imágenes contra la fuente | Alta | Medio | Pacing + caché en disco + reanudable. No es un script de una tarde |
| Carta nueva no indexada | Alta | Medio | Backfill incremental semanal; `not_in_catalog` como respuesta honesta |
| OCR roto en carta full-art | Alta | Bajo | El visual lo cubre; mientras tanto, búsqueda manual |
| Browser sin decodificación HEIC | Alta | Bajo | Convertir en cliente ( Safari sí, Chrome no). Es el caso de las fotos del usuario |
| Falsos `confident` | Baja | Alto | `MARGIN` y `T_HIGH` calibrados con el eval; el eval lista los falsos confiados uno a uno |

## 3. Licencia de las imágenes de referencia (decisión del usuario)

El plan viejo lo mentions en una línea: "usar solo para indexado interno". No
alcanza, porque **la app muestra esas imágenes al usuario** en el resultado y en
el top-3. Es una decisión, no un detalle.

Estado actual: las **fichas** vienen de pokemontcg.io (rate limit 1000/día,
30/min) y los **precios** de TCGdex. Para las imágenes hay dos caminos:

| Fuente | Estado | A favor | En contra |
|---|---|---|---|
| `images.pokemontcg.io` | ya se usa para las fotos en la UI | URL estable, ya en uso | Términos de la API; 20k descargas |
| TCGdex (`images.tcgdex.net`) | **ya se usa para precios** | Términos que suelen admitir uso con atribución, y la atribución ya se da | Hay que verificar la atribución exacta |

Lo razonable: mirar los términos de TCGdex primero, porque ya es fuente de
precios y evita abrir un problema nuevo. Y en cualquier caso, la ingesta de 20k
imágenes va con pacing, caché en disco y reanudable, porque la API tiene límites
y el CDN también tiene cola de espera.

## 4. Límites conocidos y honestos

- **Graded/slab**: fuera de alcance. La proporción no es 63/88.
- **Cartas en_COREANO/JAPONÉS**: el OCR no ayuda; manda visual + número + set.
- **Trainer/Energy**: layout distinto; los ROIs por era no las cubren. Búsqueda
  manual.
- **Idiomas**: el índice es en inglés. Una carta en español tiene otro nombre y
  otra ilustración de texto; indexar por idioma es trabajo extra, no gratis.
- **Precios**: los embeddings no los tocan. Es un pipeline separado, con su
  propio rate limit.
- **El brute force en memoria son 32 MB** y se recalcula al arrancar. Con
  aumentaciones x4 son 127 MB, todavía bien; la decisión se revisitaba con el
  número, no por defecto.

## 5. Qué queda fuera de este plan

- Escanear **varias cartas por foto**.
- Estimar el **estado** de la carta (centrado, bordes).
- **Modo offline** completo en el cliente.
- Sustituir Tesseract por otro OCR. Se probaron 3 pre-procesados y 2 modos de
  segmentación porque **no hay un ganador único**: el PSM de bloque lee
  "Shining Celebi" donde el de línea lee basura, y al revés en Umbreon. Esa
  matriz de 9 pasadas es el resultado, no un capricho.
- Reindexado con **fine-tuning** del modelo. Solo si el eval muestra que el
  problema es el modelo y no el preprocesado.

## 6. Checklist de v1

- [ ] `pnpm eval` corre y hay línea base con dataset anotado.
- [ ] Los 3 criterios del spike decididos, con los números escritos.
- [ ] `card_embeddings` con backfill completo y test de paridad.
- [ ] Top-1 del eval **no baja** respecto de la línea base.
- [ ] `not_in_catalog` definido con datos y con piso conservador.
- [ ] Los 4 estados de UI navegables.
- [ ] Nada se persiste sin consentimiento.
- [ ] `pnpm run check` en verde.

## 7. Cómo revisar una decisión técnica

Si algo se propone sin número, la respuesta es "pasame el `eval:diff`". Ya
pasó en esta sesión: casi se sube un umbral de coherencia a 0.45 (que
**empeoraba** las detecciones, y hacía rotar cartas 90° al revés) y casi se
justifica un cap de tamaño de imagen con una inferencia que después se midió al
revés (4/5 con cap contra 2/5 sin cap). Las dos casi se mandan sin medir. Con el
`eval` delante, no se pueden argumentar.
