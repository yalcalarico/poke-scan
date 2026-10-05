> Nota de vigencia (2026-10-03): este documento conserva evidencia histórica. La lectura de texto y el comparador fueron retirados; el flujo actual usa únicamente DINOv2. Consultá [scanner.md](../../frontend/docs/scanner.md).

# Mejoras del escáner — 1 de octubre de 2026

## Roadmap vigente — revisión de código del 3 de octubre de 2026

Esta sección reemplaza los estados del roadmap histórico que aparece más abajo.
La arquitectura actual usa únicamente DINOv2 con verificación visual ORB/RANSAC;
no se debe reintroducir lectura de texto. La cámara y el recorte son cliente,
la identificación es autenticada y no guarda fotos de consulta.

La revisión fue de lectura de código, índices locales e informes: no ejecutó
tests, builds, descargas de referencias ni consultas que modifiquen datos.
Después se sincronizó la rama principal `master` con `origin/master` en
`0703284` (merge del PR #3, implementación `208c5a4`). El código revisado ya
está integrado en la rama principal; no hay diferencias de contenido respecto
de la rama DINOv2 inspeccionada antes. Esto no es una nueva certificación del
chequeo completo ni implica un despliegue. Los artefactos modelo/índice son locales.

### 1. Estabilización — implementada en gran parte; validación pendiente

- [x] Cámara y galería usan el flujo visual, con cancelación, errores y protección
  contra respuestas obsoletas. El primer candidato se suma a la sesión;
  `OrganizeSheet` hace la persistencia explícita en colección.
- [x] Sesión restaurable y acotada a 30 entradas, precios consultados sólo para
  el ID seleccionado y tolerancia a precio ausente.
- [ ] Completar verificación real del orden por precio, render compartido,
  cámara física de teléfono y PWA/offline. Orden y página compartida existen;
  lo pendiente es su validación, no implementarlos desde cero.
- [x] Integrar la implementación DINOv2 en la rama principal y sincronizar el
  checkout local con el PR #3. La rama principal se llama `master`, no `main`.
- [ ] Verificar el conjunto para el próximo hito/despliegue. Los informes
  registran checks anteriores; esta actualización sólo confirma código e integración.

### 2. Recorte y orientación — implementados; ampliar validación

- [x] Galería detecta contorno, recorta y orienta; cámara conserva el recorte de
  la guía sin volver a detectar ni girar. Se corrigió el caso Vulpix cuyo dibujo
  apaisado se confundía con el borde de la carta.
- [x] Guía y captura comparten geometría, mapeo `object-cover` y proporción 63/88.
- [ ] Probar perspectiva, fundas y condiciones diversas en dispositivos reales.
  Recorte rectangular y rotación no equivalen a rectificación de perspectiva.

### 3. Lectura de número/código — retirada por cambio de arquitectura

Los módulos de lectura, parser, memoria textual, DTO y endpoint de identificación
por texto fueron retirados. Los antiguos problemas OCR de código y evolución
no son tareas pendientes del sistema actual ni se consideran resueltos por OCR.
Número, nombre y set ahora proceden del candidato visual del catálogo.
La desambiguación de edición/reimpresión se conserva como pendiente de etapa 6.

### 4. Evaluación exacta — parcial

- [x] Manifiesto de cinco IDs exactos, CLI de evaluación, smoke visual y métricas
  separadas de recuperación, geometría, índice, modelo e inferencia.
- [x] Existen mediciones contra el índice completo e informes de casos adicionales.
- [ ] Ampliar a 50–100 fotos reales, negativos y reimpresiones similares.
- [ ] Medir precisión, falsas predicciones/aceptaciones y tiempos fríos/calientes
  en navegador y dispositivos. Cinco fotos no certifican precisión general.
  El diagnóstico OCR histórico fue retirado, no es la herramienta vigente.

### 5. Motor e índice visual — implementados; evaluación amplia pendiente

- [x] CLI por cantidad, set e IDs; lotes por set, validación, caché, metadata,
  bloqueo, reanudación y carga/recarga consistente del índice en el worker.
- [x] Índice completo local: revisión directa contó **20.670 IDs únicos en 175
  carpetas, sin duplicados**. Ya no está limitado a las 191 referencias de 30th.
- [x] Evaluación completa disponible: DINOv2 solo dio 3/5 top-1; DINOv2 + ORB
  dio 5/5 top-1 en los cinco recortes disponibles, sin reindexar ni favorecer IDs.
- [ ] Verificar SIGINT real y estabilidad prolongada/reinicio del runtime nativo.
  Aislar ONNX en un proceso hijo limita el impacto; no demuestra eliminar el
  abort aislado anterior.
- [ ] Completar criterios de evaluación amplia y documentar rendimiento y
  decisión de runtime/cuantización. No convertir 5/5 en garantía de producción.

### 6. Integración visual — implementada; calibración pendiente

- [x] Cámara y galería integradas con `POST /api/cards/identify-visual`, autenticado,
  validación de imagen y flags backend; motor local aislado, sin descargas por request.
- [x] Recuperación DINOv2 top-64 y reranking ORB/homografía RANSAC con caché local;
  fallback al orden DINOv2 si falla la verificación. Diagnósticos muestran
  candidatos, similitud, evidencia geométrica y tiempos.
- [x] El experimento optativo de 30th evolucionó al flujo principal DINOv2;
  el comparador y el camino OCR se retiraron. La combinación imagen+texto del
  roadmap original ya no aplica.
- [ ] Calibrar rechazo/confirmación para negativos y cartas fuera del catálogo,
  reimpresiones con mismo dibujo y candidatos fuera del top-64.
- [ ] Ampliar casos full-art. El caso disponible está medido, no toda la categoría.

El primer candidato se suma automáticamente a la sesión, no se guarda por sí
solo en una colección. Esa política de UI no es un umbral de certeza calibrado.

### 7. Latencia — optimizaciones implementadas; comparación pendiente

- [x] Modelo persistente en worker, recarga de índice, caché acotada de descriptores,
  sondeo de encuadre local y consultas con cancelación/timeout.
- [x] Informes distinguen índice, arranque, inferencia, verificación y HTTP.
  La verificación caliente de Umbreon se midió en ~466 ms; no es latencia total.
- [ ] Medir p50/p95/p99 y presión de concurrencia en equipos/dispositivos reales.
- [ ] Evaluar WebGPU/otras alternativas y elegir runtime según evidencia.
  No hay runtime WebGPU implementado; el flujo actual es ONNX CPU en backend.
  Comparaciones de pasadas OCR y corte temprano de texto quedaron retiradas.

### 8. Captura y casos difíciles — parcial

- [x] Cámara sólo en teléfonos, marco rojo/verde según estabilidad y alineación,
  captura automática, intervalo mínimo y prevención de repetición en escena quieta.
- [x] Geometría visual para verificar detalles del dibujo en candidatos.
- [ ] Rectificar perspectiva de la foto y detectar reflejos/desenfoque con métricas.
  Homografía de matching y estabilidad del encuadre no completan esas funciones.
- [ ] Evaluar acabados normal/holo/reverse y reimpresiones.
- [ ] Diseñar/evaluar memoria visual con consentimiento y borrado. La memoria
  textual anterior fue retirada; no hay sustituto visual implementado.

### 9. Mobile nativo — pendiente

- [x] Flujo web/PWA con cámara automática y guía adaptada al teléfono.
- [ ] Validar captura/enfoque real en iPhone y otros teléfonos.
- [ ] Evaluar app y runtime nativos si se retoma ese alcance; no están implementados.

**Siguiente bloque:** validar la cámara física y el flujo visual consolidado,
ampliar corpus/negativos y calibrar edición y rechazo; luego optimizar según
tiempos de extremo a extremo. No hace falta reindexar todo ni retomar OCR.

Fuentes: `frontend/docs/scanner.md`, `visual-full-index-2026-10-03.md`,
`visual-geometry-2026-10-03.md`, `scanner-unified-camera-2026-10-03.md` y
`scanner-rotation-mobile-2026-10-03.md` en `docs/evaluations/`.

### Avance verificado en esta sesión — 3 de octubre de 2026

- `pnpm run stop` seguido de `pnpm run check`: verde con acceso a la
  infraestructura local (303 tests backend, 6 de scripts, 6 API, 319 frontend,
  lint, tipos y ambos builds). La primera corrida sandbox no alcanzó PostgreSQL.
  No implica despliegue ni cierre de pruebas físicas.
- Se agregó un runner local del método vigente, con ONNX aislado, ranking
  completo para identificar fallos top-64, negativos explícitos, hashes y tiempos
  fríos/calientes. No sustituye preparación cliente ni medición HTTP/dispositivo.
- Sobre las cinco fotos **originales sin recorte cliente**: 4/5 top-1 en dos
  pasadas. Umbreon ex `me55-92` quedó 418.º en DINOv2, fuera del top-64; la
  referencia existe. El 5/5 anterior sigue correspondiendo a recortes preparados.
  No se cambiaron umbrales, aceptación ni índice por esta muestra.
- Búsqueda pública: criterio Precio/Descendente y carga adicional observados;
  IDs coherentes con páginas API. Verificación numérica global, render compartido
  y flujo autenticado siguen abiertos. Auto-review rechazó el login del usuario
  de desarrollo sin autorización explícita para esa cuenta; no se eludió.
- Protocolo iPhone/Android, HTTPS/LAN y corpus 50–100 fotos listo. Faltan fotos
  nuevas etiquetadas/negativos y pruebas físicas. SIGINT real y estabilidad
  prolongada del runtime siguen pendientes.

Evidencia y comandos: [informe de sesión](../evaluations/visual-current-2026-10-03.md),
[reporte reproducible](../evaluations/visual-current-2026-10-03.json) y
[protocolo](../evaluations/scanner-validation-protocol.md).

### Contraste posterior con la galería y verificación autenticada

El usuario autorizó las credenciales de prueba y aportó una captura de Umbreon
correctamente reconocido. Se reprodujo `IMG_4987.png` por la galería real:
`me55-92`, DINOv2 puesto 2, ORB puesto final 1 con 87/95 puntos y cobertura 31,3 %.
El puesto 418 del runner correspondía al original directo **sin preparación
cliente**; no demuestra un fallo de la galería ni representa su precisión.

Se verificó restauración de sesión al recargar, cierre de Organizar sin guardar,
y guardado explícito de dos copias en una nueva colección local de prueba.
El enlace público existente renderizó sin sesión, en sólo lectura, con cantidades
y duplicados. No se creó otro enlace. La hoja Organizar actual no ofrece variante;
se corrigió la documentación, sin cambiar el comportamiento.

Estas observaciones cierran esos casos puntuales de UI; no cámara física/PWA,
precisión general, calibración, runtime prolongado ni orden numérico global.
Evidencia y datos de prueba creados: [informe de galería](../evaluations/scanner-gallery-current.md).

### Descarga voluntaria para reportar errores — 4 de octubre de 2026

Se implementó, a pedido del usuario, la descarga manual del recorte exacto
enviado y de su diagnóstico, en cámara y galería. Sólo se conserva la última
consulta en memoria cliente, sin persistencia automática ni almacenamiento
servidor. Abrir la revisión en cámara pausa capturas hasta cerrarla. Cada archivo
se descarga con una acción explícita; el ID correcto se etiqueta después.

Check completo verde (303 backend, 6 scripts, 6 API, 322 frontend y ambos builds).
Se verificaron ambas descargas en galería real con IMG_4987; descarga física
iPhone/Android y cámara siguen pendientes. Ver [evidencia](../evaluations/scanner-capture-review-2026-10-04.md).

### Primeros fallos exportados de cámara — 5 de octubre de 2026

El usuario aportó dos pares JPG/JSON descargados bajo demanda desde cámara.
Se reprodujeron exactamente las predicciones equivocadas: N’s Darmanitan →
Flaaffy; Carkol ASC 119/217 → Alolan Dugtrio. Carkol `me2pt5-119` existe en el
índice pero queda 143.º en DINOv2, fuera del top-64. Las referencias de Darmanitan
con ese dibujo quedan 392.ª/777.ª; falta confirmar set/número de su edición.
Una comparación directa diagnóstica sí corroboró sus dibujos mediante ORB,
sin modificar la recuperación de producción. No prueba una solución ni precisión
general. Se confirmó exportación física de estos dos casos; dispositivo/PWA y
resto del protocolo siguen sin verificar.

Evidencia: [dos fallos reales](../evaluations/camera-failures-2026-10-05.md).
Próximo experimento: comparar recuperación/alcance de candidatos y latencia
con regresiones y negativos; no ajustar aceptación ni favorecer IDs por dos fotos.

## Registro histórico — estados anteriores, no vigentes

## Revisión de cierre — 2 de octubre de 2026

**El plan completo sigue abierto.** El trabajo de los tres agentes está integrado
en `master` hasta `f67edaf`. La revisión inicial que sigue describe el punto de
partida (`38881e1`); la sección «Avances de los tres frentes» y las casillas del
roadmap reflejan las entregas posteriores y su verificación.

- La estabilización tiene arreglos y regresiones implementados. La última
  verificación documentada pasó lint, tipos, 323 tests backend, 4 pruebas API,
  397 frontend y ambos builds. Siguen abiertas las verificaciones de navegador
  indicadas en la etapa 1 y la prueba de cámara/PWA en dispositivo.
- El recorte está corregido. La fiabilidad del OCR del pie sigue abierta en la
  etapa 3; no bloquea considerar implementado el arreglo geométrico.
- El JSON de etapa 3 registra **3/5 números** (23, 92, 145), **0/5 códigos** y
  candidatos top-1 compatibles con los IDs corroborados en **4/5 fotos**.
  Chandelure devuelve `bw4-101` en lugar de `me55-137`. Esto corrige el conteo
  anterior de 4/5 números. Sólo Umbreon tiene `expectedCardId` en ese JSON;
  los otros IDs están documentados en el informe de etapa 2, por lo que falta
  consolidar las etiquetas para obtener métricas automáticas de edición.
- El modelo visual está descargado, pero el índice local contiene **una sola
  referencia**. Su evaluación usa `not-labelled` y marca
  `productionReady: false`; no demuestra precisión sobre el catálogo completo.
- No hay identificación visual integrada en el flujo público. El OCR progresivo
  sigue condicionado a `NEXT_PUBLIC_SCANNER_PROGRESSIVE=1`; con el experimento
  apagado, el loader no carga códigos y no se ejecutan las pasadas del pie que
  extraen `setCode`. Las pasadas dedicadas al número sí se ejecutan por defecto.

El siguiente bloque es cerrar la lectura de código/número y Chandelure, consolidar
las etiquetas exactas y ampliar la evaluación. Las etapas 5–9 siguen pendientes
salvo la preparación del motor visual; mobile permanece como trabajo posterior.

### Avances de los tres frentes

- Se consolidó el manifiesto de cinco IDs exactos en
  `docs/evaluations/manifest.json` y el diagnóstico distingue edición, número,
  código, aceptación y latencia. Falta ampliar a 50–100 fotos.
- La medición OCR a resolución original obtuvo 5/5 IDs y 4/5 números; una
  aproximación a la galería de 1200 px obtuvo 4/5 IDs y 3/5 números. Chandelure
  lee 137/128, pero el texto de evolución dañado favorece Lampent. Código: 0/5.
  Las pasadas extra no mejoraron precisión y se descartaron. Ver
  `docs/evaluations/ocr-2026-10-02.md`; no demuestra un arreglo de la UI.
- Se preparó un CLI reanudable por cantidad, set o IDs que guarda imágenes,
  vectores y metadata: `pnpm run scanner:index`, `scanner:sets` y
  `scanner:evaluate`. Uso en `docs/evaluations/visual-indexer.md`.
  La muestra visual obtuvo 5/5 top-1 con sólo cinco referencias; no valida el
  catálogo completo. Se verificó descarga y reutilización del caché.
- En la integración pasó `pnpm run check`: lint, tipos, 324 tests backend,
  4 pruebas API, 398 frontend y ambos builds (2 skip y 1 todo). Después se
  verificaron sintaxis, ayuda y listado del CLI, y rechazo de selección vacía.
  La API y la web se volvieron a levantar. La señal SIGINT real y un abort
  nativo ONNX aislado siguen sin validación definitiva.

## Prueba visual en pantalla — siguiente bloque experimental

El índice local del 30.º aniversario ya tiene **191 referencias**: `me55`
(161) y `me55c` (30), en `backend/.scanner-index/30th-anniversary`.
La descarga/indexación terminó sin fallos; esto verifica preparación, no precisión.
El detalle de almacenamiento está en `storage-estimate.json` dentro del índice.

Se autorizó implementar una prueba manual en `/escanear`, mediante un botón
«Probar reconocimiento visual (experimental)». Es una excepción acotada al orden
original del roadmap: permite evaluar en pantalla el índice parcial antes de
decidir la integración definitiva. No cierra las etapas 5 ni 6.

- [x] Crear un flujo optativo para comparar fotos contra las 191 referencias
  locales, usando el mismo modelo y preprocesado de la indexación.
- [x] Mostrar candidatos y tiempos, con alcance explícito: sólo 30.º aniversario,
  edición sin confirmar y sin aceptación ni guardado automáticos.
- [x] Mantener selección explícita de candidatos y el flujo OCR existente.
  Una carta fuera del índice puede devolver una referencia parecida; no afirmar
  que pertenece al set sólo por ser la primera coincidencia.
- [x] Validar upload acotado, configuración/metadata del índice y errores cuando
  faltan modelo o referencias. Ningún handler descarga ni indexa referencias.
- [x] Evaluar las cinco fotos etiquetadas contra las 191 referencias y registrar
  diferencias con OCR, tiempos fríos/calientes y límites del corpus.
- [x] Pasar `pnpm run check` (con stack detenido antes de tests) y verificar el
  flujo real; actualizar este plan y documentar cómo habilitar el experimento.

El trabajo se asigna a un chat nuevo. Los pendientes de catálogo completo,
dataset amplio, calibración, rechazo de negativos y optimización siguen abiertos.

Implementación y evidencia: `docs/evaluations/visual-screen-2026-10-02.md`.
Contra 191 referencias: PNG originales 4/5 top-1; JPEG con orientación aplicada
2/5 top-1 y 5/5 top-8. Umbreon séptimo y Chandelure primero en ambas.
La orientación EXIF y el encuadre necesitan evaluación/versionado coherente.

### Cámara DINOv2 y ampliación del índice (2026-10-03)

### Mejora del ranking visual (2026-10-03)

- [x] Evaluar proporciones, exposición y verificación de detalles contra el índice completo.
- [x] Integrar recuperación DINOv2 de 64 candidatos + ORB/homografía con imágenes
  locales; sin OCR, reindexado, descargas ni IDs favorecidos.
- [x] Recuperar Umbreon (29.º → 1.º) y Vaporeon (2.º → 1.º), manteniendo las otras
  tres fotos primeras: 5/5 top-1 en la muestra disponible.
- [x] Mostrar evidencia geométrica y tiempos sin confundirlos con coseno o certeza.
- [x] Probar rotación/alpha, negativos sintéticos, caché, fallback y la UI.
- [x] `pnpm run stop` y `pnpm run check`: aprobados (lint, tipos, tests y builds).
- [ ] Ampliar corpus real y negativos; una carta fuera del top-64 o una reimpresión
  con el mismo dibujo siguen requiriendo corroboración/selección manual.

Detalle: `docs/evaluations/visual-geometry-2026-10-03.md`. Caché caliente de
Umbreon: 466 ms de verificación, sin incluir inferencia/HTTP/preparación.

### Estado previo de cámara y ampliación

Actualización posterior al pull: API adaptada a **20.670 referencias / 175
carpetas**, sin modificar índices. Recarga validada por inventario y bloqueos;
conserva el snapshot anterior con aviso explícito. Muestra: 3/5 top-1, Vaporeon
segundo y Umbreon fuera del top-8. No confirma edición automáticamente.
Detalle: `docs/evaluations/visual-full-index-2026-10-03.md`.

- [x] Eliminar límites fijos de 191 referencias y IDs `me55/me55c`.
- [x] Compartir default `.scanner-index` y fallback `SCANNER_INDEX_DIR`.
- [x] Detectar nuevas colecciones/cambios y conservar el snapshot previo ante
  bloqueo, línea incompleta, vectores inválidos o metadata incompatible.
- [x] Mostrar versión, cantidad, tiempo de lectura y estado del snapshot.
- [x] Pruebas aisladas del lector, modelo real contra todos los vectores,
  tests frontend, lint y tipos de producción.
- [ ] Chequeo completo y prueba API activada: pendiente de autorización para
  detener temporalmente la app por la restricción anterior. No se hizo push.

El listado siguiente conserva los pendientes identificados antes de esta
implementación; los del lector y guard quedaron resueltos arriba. Publicación
transaccional entre múltiples escritores y calibración siguen pendientes.

- [x] Agregar entrada de cámara y galería sólo DINOv2, manteniendo OCR y comparador.
- [x] Mostrar cantidad de referencias devuelta por la API, sin fijar 191 en el frontend.
- [ ] Adaptar el worker y el guard del service: hoy ambos exigen 191 referencias
  y el worker limita IDs a `me55/me55c`. No tocar backend durante la carga con
  Nest watch, porque editarlo puede reiniciar el servidor.
- [ ] Unificar directorio de lectura/publicación: indexador `SCANNER_INDEX_DIR`
  y API `SCANNER_VISUAL_INDEX_DIR` hoy son independientes.
- [ ] Publicar un snapshot consistente al terminar cada actualización y recargar
  sólo vectores al cambiar su versión; conservar el último snapshot válido si
  hay `index.lock`, una línea incompleta o metadata incompatible. Hoy el worker
  sólo lee al inicio y rechaza un índice bloqueado. No leer un JSONL en escritura.
- [ ] Mantener validación de modelo, preprocesado, dimensiones, vectores finitos,
  normalización e IDs únicos para índices de tamaño variable.
- [ ] Ejecutar `pnpm run check` cuando se pueda detener el stack. Por pedido del
  usuario, esta entrega valida sólo frontend y no ejecuta tests backend ni build
  sobre `.next` mientras está activo el servidor.

No se modificaron backend, índices, configuración ni procesos en esta entrega.
Lint frontend, typecheck sin incremental y 413 tests frontend: aprobados
(2 omitidos y 1 pendiente). El navegador no pudo verificar la pantalla porque
`localhost:3000` rechazó la conexión; no se inició ni reinició el stack.

### Comparación OCR y visual en el mismo botón (2026-10-02)

- [x] Ejecutar ambos métodos sobre la misma carta detectada y orientada, mostrar
  el recorte y separar preparación compartida de los tiempos de cada método.
- [x] Mostrar predicciones, márgenes, evidencia OCR y diagnóstico por pasada;
  conservar el resultado de un método cuando falla o se cancela el otro.
- [x] Investigar Umbreon: el fondo de la foto entera perjudicaba el ranking.
  Con el recorte compartido `me55-92` queda primero en la prueba real de navegador
  con ambos métodos, sin cambiar el modelo ni recalcular el índice.
- [x] Probar la reutilización del recorte, la ausencia de persistencia diagnóstica,
  errores independientes y cancelación. Verificar la comparación en navegador.

Evidencia y límites: `docs/evaluations/comparison-2026-10-02.md`. Esto no confirma
ediciones automáticamente ni calibra precisión para otras fotos o sets.
Check final verde: 329 backend, 4 API y 401 frontend, lint/tipos/builds;
smoke real de la app: 12 comprobaciones. Stack único activo con flags de prueba. Prioridad siguiente: encuadre/ranking y corpus amplio para
calibración; no ampliar el catálogo a ciegas ni habilitar aceptación automática.

## Capacidades implementadas

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
validación completa. El modelo participa sólo de la prueba optativa y autenticada; ambos flags están apagados por defecto.

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

- [x] Medir lectura de número: el JSON histórico registra 3/5 (23, 92 y 145).
  La nueva corrida original registra 4/5; la aproximación a galería, 3/5.
  Son entradas distintas, no una mejora demostrada del runtime.
- [x] Umbreon devuelve 92 y el candidato exacto `me55-92`, en estado `confident`.
- [ ] Mejorar código de colección: 0/5 códigos se extrajeron con confianza, aunque
  los bloques de código y su extracción ya están implementados. Una pasada
  específica adicional no mejoró el resultado y sumaba latencia.
- [x] Reintentar Chandelure con resolución original y aproximación a galería.
  Ambas leen 137/128. Evidencia en `docs/evaluations/ocr-2026-10-02.md`.
- [ ] Resolver su ranking en galería: el texto de evolución dañado favorece
  Lampent por encima de Chandelure; no se integró un arreglo sin evidencia.

### 4. Preparar una evaluación de edición exacta

- [x] Etiquetar las cinco fotos existentes con ID exacto, colección y número:
  `docs/evaluations/manifest.json`.
- [ ] Ampliar a 50–100 fotos con full-art, fundas, reflejos y reimpresiones similares.
- [x] Preparar diagnóstico con métricas por ID, número, código y aceptación,
  tamaño fuente y primer worker; top-10 sólo con al menos diez candidatos.
- [ ] Completar mediciones amplias de ambigüedad, falsos positivos y tiempo
  frío/caliente en navegador/dispositivo, no sólo cinco fotos en Node.

### 5. Evaluar reconocimiento visual

- [x] Preparar motor DINOv2/ONNX e indexado reanudable.
- [x] Entregar CLI por cantidad, expansión o IDs con imágenes cacheadas,
  vectores/metadata, bloqueo de escritor y resumen; comprobar lote y reanudación.
- [x] Ejecutar muestra de cinco referencias etiquetadas: 5/5 top-1, sin
  extrapolar al catálogo completo. Ver `docs/evaluations/visual-2026-10-02.md`.
- [ ] Verificar SIGINT real e investigar el abort nativo ONNX aislado.
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

### Fix de recuperación y rechazo — 5 de octubre de 2026

Implementada recuperación adaptativa ORB por tandas de 64 hasta 512 cuando no hay
evidencia inicial, con presupuesto de 24 s entre tandas y timeout total existente.
La UI ya no suma predicciones sin geometría corroborada ni consulta sus precios.
Ambos recortes del teléfono recuperan el dibujo correcto por el endpoint HTTPS;
Darmanitan sigue pendiente de etiquetar por edición. Las cinco entradas directas
anteriores conservan sus IDs esperados. La búsqueda difícil tarda 10–28 s; falta
medir más corpus y optimizar ese costo sin perder recuperación. Ver
[reporte del fix](../evaluations/camera-recovery-2026-10-05.md).

### Decisión vigente: retirar ORB — 5 de octubre

El usuario conserva referencias en pendrive y requiere reconocimiento sólo con
DINOv2. Retirados ORB/OpenCV, acceso a imágenes, ampliación a 512 y aceptación
geométrica. Contratos, diagnóstico y runner vuelven al ranking coseno top-8.
El índice en runtime sólo contiene ID y vector; metadata/modelo siguen necesarios.
Sin reentrenamiento ni reindexación. Los JPEG recientes vuelven a sus primeros
candidatos DINOv2 incorrectos y quedan como corpus de mejora; no afirmar resueltos.
Ver [evaluación sin imágenes](../evaluations/dinov2-only-2026-10-05.md).
