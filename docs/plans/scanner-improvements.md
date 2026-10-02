# Mejoras del escáner — 1 de octubre de 2026

## Implementado

- Inicio anticipado del worker al abrir la cámara; Tesseract sigue siendo cliente.
- OCR progresivo experimental (`NEXT_PUBLIC_SCANNER_PROGRESSIVE=1`): original, nombre y pie; consulta temprana al catálogo local.
  Si la edición está corroborada, termina. Si hay dudas, usa las variantes de
  respaldo. Máximo 11 pasadas; la ruta anterior conserva sus 9 pasadas.
- Pie de carta para número y código, validado contra códigos exactos del catálogo
  local (`GET /api/cards/scanner-config`, caché de una hora). No hay proveedor pago.
- Recuperación del nombre por código + número exactos, incluso sin texto legible.
- Números con prefijos (`TG02`, `SV004`) conservados en parser y matching SQL.
- Estado `confident`, `ambiguous` o `low`, separado del score de ordenamiento.
  Sólo se suma automáticamente con evidencia de impresión y margen; las demás
  requieren elección explícita. Los umbrales son reglas conservadoras, no una
  probabilidad calibrada ni una garantía de edición.
- Serialización de Tesseract y cancelación de pasadas posteriores a un timeout,
  una captura nueva o desmontaje. Una pasada WASM ya iniciada puede terminar.
- Correcciones opcionales por usuario/dispositivo: hasta 100 patrones de texto
  normalizado, vigencia de 180 días. No se guardan imágenes. Una lectura exacta
  repetida propone el ID confirmado previamente y pide confirmación otra vez.
  No se aprende automáticamente ni se compara similitud visual. Se pueden borrar.
- Tiempos de matching en respuesta y diagnóstico reproducible con fotos reales.

## Reconocimiento visual: experimento preparado

`backend/scripts/scanner-visual-spike.mjs` genera embeddings DINOv2-small int8
de 384 dimensiones, normalizados, con ONNX Runtime CPU. Descargas de referencias
en background con separación de 2,3 segundos; índice reanudable fuera de Git.
No consulta la API del catálogo ni descarga referencias desde handlers públicos.

Modelo: `onnx-community/dinov2-small`, revisión
`8b1f705a3a7f6f062f6bdd21986c1583d3ef105d`, archivo
`onnx/model_quantized.onnx`. Colocarlo en
`backend/.scanner-models/dinov2-small-int8.onnx` o configurar `SCANNER_MODEL`.

Desde `backend`:

```sh
node --env-file-if-exists=.env scripts/scanner-visual-spike.mjs index 100
node --env-file-if-exists=.env scripts/scanner-visual-spike.mjs evaluate /ruta/manifest.json
```

El manifiesto contiene `[{"path":"/ruta/foto.png","cardId":"ID-exacto"}]`.
Consultar `docs/files/02-EMBEDDINGS-spike.md`: validar top-10, margen contra
distractores y latencia con el catálogo completo antes de integrar. El reporte
marca `productionReady: false` para impedir interpretar un subconjunto como
validación completa. Este modelo todavía no participa del escaneo público.

## Medición y límites

Los resultados resumidos están en `docs/evaluations/scanner-2026-10-01.json`.

El diagnóstico anterior acertó el nombre en 4/5 fotos. Eso **no mide edición**:
las etiquetas previas sólo contenían nombres. Se deben etiquetar IDs exactos
y ampliar a 50–100 fotos, con fundas, reflejos, inclinación e impresiones similares.

```sh
SCAN_PROGRESSIVE=1 SCAN_REPORT_FILE=/tmp/scanner-progressive.json \
  pnpm --dir frontend exec vitest run --config vitest.e2e.config.mts
```

Este diagnóstico necesita la API levantada y `/tmp/cards-full/IMG_4985.png` a
`IMG_4989.png`. Guarda IDs de candidatos para auditar edición. La confianza del
OCR del pie y la caja de recorte siguen necesitando evaluación más amplia.

## Roadmap

Orden de ejecución acordado: primero corregir y validar los flujos actuales;
después avanzar con reconocimiento visual y optimizaciones.

### 1. Estabilizar la app actual — en curso

- [x] Corregir y verificar el fallo reportado `getScannerConfig is not a function`.
  Una pestaña fresca pudo escanear; el export existe. Se elimina la dependencia
  del recurso experimental cuando el experimento está apagado y se recuperan
  errores sincrónicos del loader. Cuatro regresiones de configuración y el check
  completo pasaron (698 tests, tipos, lint y builds).
- [x] Auditoría funcional documentada (con pendientes explícitos) en navegador: login/sesión, búsqueda/filtros, detalle,
  precios, colecciones, duplicados, intercambio, escaneo, organización, compartir
  y ajustes. Resultados en `docs/evaluations/features-2026-10-01.md`.
- [x] Flujo 1: elegir → Organizar → guardar → repetir y sumar duplicados;
  recordar una corrección y borrarla. Regresiones de componentes reales con
  OCR/HTTP simulados, más duplicado contra la API real en colección temporal
  eliminada. Evidencia y límites en `docs/evaluations/scanner-stage1-2026-10-01.md`.
- [x] Conservar el sufijo ex/GX/V y corregir el ranking cuando el nombre lo incluye.
- [ ] Completar verificaciones pendientes: render público y orden por precio;
  interacción completa en navegador, cámara física y PWA requieren su entorno.
- [x] Aplicar el arreglo del escáner y pasar `pnpm run check`.
- [x] Dejar un solo stack de desarrollo activo al terminar (API y escáner HTTP 200).

### 2. Corregir el recorte del pie — implementado, OCR con pendientes

- [x] Corregir la detección de bordes: IMG_4987 perdía el código 30C y 092/128
  al recortar, aunque ambos están en la foto original.
- [x] Verificar visualmente que el pie quede dentro del recorte en las cinco fotos actuales.
- [x] Revisar la fusión de lecturas: IMG_4987 ahora devuelve Umbreon ex como nombre.
- [x] Medir nuevamente código, número, candidato y tiempo. Se mantienen 4/5 nombres
  acertados; no hay mejora corroborada de edición. Evidencia en
  `docs/evaluations/scanner-stage2-2026-10-01.md`.
- [ ] Recuperar código/número con OCR fiable: el pie ahora está visible, pero
  aún no se lee con suficiente confianza. La ruta experimental sigue apagada.

### 3. Lectura de número y código — en curso

- [x] Las pasadas OCR dedicadas al número recuperan 4/5 números en las fotos actuales.
- [x] Umbreon devuelve 92 y el candidato exacto `me55-92`, en estado `confident`.
- [ ] Mejorar código de colección: 0/5 códigos se extrajeron con confianza, aunque
  los bloques de código y su extracción ya están implementados. Una pasada
  específica adicional no mejoró el resultado y sumaba latencia.
- [ ] Reintentar Chandelure: el pie visible es 137/128, pero OCR no lo valida aún.
  Resultados en `docs/evaluations/scanner-stage3-diagnostic-2026-10-01.json`.

### 4. Preparar una evaluación de edición exacta

- [ ] Etiquetar las fotos existentes con ID exacto, colección y número.
- [ ] Ampliar a 50–100 fotos con full-art, fundas, reflejos y reimpresiones similares.
- [ ] Medir top-1/top-10 por ID, ambigüedad, falsos positivos y tiempo frío/caliente.

### 5. Evaluar reconocimiento visual

- [x] Preparar motor DINOv2/ONNX e indexado reanudable.
- [ ] Completar índice de referencias del catálogo local.
- [ ] Ejecutar la evaluación contra el índice completo y pasar los criterios del spike.
- [ ] Documentar decisión de integración según precisión y latencia.

### 6. Integrar identificación por imagen y texto

Depende de superar la etapa 5.

- [ ] Recuperar candidatos visuales y corroborar edición con OCR.
- [ ] Resolver y volver a medir el fallo full-art.
- [ ] Calibrar aceptación, confirmación y rechazo con negativos/cartas fuera del catálogo.

### 7. Optimizar el tiempo total

- [ ] Mejorar lectura del pie y corte temprano sin perder precisión.
- [ ] Comparar con las nueve pasadas actuales antes de activar el experimento.
- [ ] Medir WebGPU frente a WASM/CPU en equipos reales, incluyendo descarga e inicio.
- [ ] Elegir runtime según evidencia y conservar fallback compatible.

### 8. Mejorar captura y casos difíciles

- [ ] Rectificar perspectiva y detectar fotos con reflejos/desenfoque.
- [ ] Evaluar variantes de acabado con señales específicas. Una foto frontal puede
  no distinguir normal, holo y reverse holo.
- [ ] Evaluar patrones visuales de correcciones con consentimiento, separación por
  usuario y borrado. La memoria actual sólo reconoce texto OCR repetido.

### 9. App mobile — más adelante

- [ ] Evaluar cámara y runtimes nativos cuando se retome el trabajo mobile.

La primera medición del pie empeoró el tiempo (44,96 s contra 21,09 s para cinco
fotos) sin mejorar el nombre: se restringió el ruido y se dejó la ruta progresiva
apagada por defecto. No activar globalmente hasta superar la comparación.

No hay promesa de latencia cero ni de cobertura de cartas ausentes del catálogo.
