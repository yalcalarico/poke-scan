# Mejoras del escáner

## Roadmap vigente — revisión del 6 de octubre de 2026

Código integrado en `master`, commit `5a2fe2f` (incluye PR #4 y #5).
El reconocimiento actual es **DINOv2 solo**, ranking por coseno y respuesta
**top-8**, con modelo ONNX CPU en backend autenticado. ORB/RANSAC, OCR,
recuperación adaptativa hasta 512 y aceptación geométrica fueron retirados.
La cámara y el recorte son cliente; no se guardan fotos de consulta en servidor.
Los informes anteriores conservan valor histórico, pero sus resultados con ORB
no certifican precisión del método vigente.

### 1. Estabilización — integración verificada; dispositivos pendientes

- [x] Cámara y galería comparten el flujo visual con cancelación, timeout y
  protección ante respuestas obsoletas. El primer candidato se suma a la sesión.
- [x] Sesión restaurable, máximo 30 entradas; precios sólo para la selección,
  con tolerancia a precio ausente.
- [x] Revisión captura/referencia, selección entre candidatos y reapertura de
  lecturas previas. Corregir reemplaza la lectura, sin duplicarla ni reconocer otra vez.
- [x] Organizar agrupa cartas iguales, permite editar cantidad y guarda
  explícitamente; sólo retira las lecturas cuyo guardado se confirma.
- [x] `pnpm run stop` → `pnpm run check`: verde el 6/10, **315 backend,
  13 de scripts, 6 e2e y 366 frontend**, lint, tipos y ambos builds. Stack restaurado.
- [x] Galería real: IMG_4987 propone Luxray; Umbreon ex `me55-92` es segundo.
  Corrección manual conserva una lectura y Organizar muestra la carta correcta.
- [x] API real: colección temporal, 2 copias de `me55-92`; repetición suma a 3
  sobre el mismo ítem. Colección eliminada al terminar.
- [ ] Completar cámara física/PWA/offline y matriz de dispositivos.
- [x] Orden por precio global: 20.670 cartas, 207 páginas por sentido, sin
  diferencias con SQL ni duplicados; snapshot estable. Las 4.237 cartas sin
  precio quedan al final. UI descendente: 120 IDs coinciden con el orden SQL.
- [x] Colección pública sin sesión: render desktop y respuesta anónima
  verificados, 34 cartas/31 únicas, sólo lectura y sin campos privados.
  [Informe](../evaluations/catalog-public-validation-2026-10-06.md).

### 2. Recorte y orientación — implementados; validación amplia pendiente

- [x] Galería detecta contorno, recorta y orienta; cámara usa el recorte de guía.
  Guía/captura comparten geometría `object-cover` y proporción 63/88.
- [x] Corrección del recorte de Vulpix y adaptación de viewport/scroll de cámara.
- [ ] Probar fundas, inclinación, reflejos y condiciones diversas en teléfonos.
- [x] Rectificación de perspectiva en galería: cuatro lados confiables,
  transformación proyectiva a 63/88 y respaldo al recorte anterior.
  Cámara de guía sin cambios; validación amplia y física pendiente.

### 3. Número/código por OCR — retirada

No queda una implementación OCR pendiente. Número, nombre y set proceden del
candidato del catálogo; confirmar edición/reimpresión sigue abierto en etapa 6.

### 4. Evaluación exacta — parcial; próxima prioridad

- [x] Manifiesto de cinco IDs, CLI/runner reproducible, ranking y tiempos,
  diagnóstico y exportación voluntaria del recorte enviado.
- [x] Dos pares JPG/JSON reales exportados desde cámara; predicciones erróneas
  reproducidas. Carkol `me2pt5-119` está en el índice; Darmanitan requiere etiqueta
  de edición exacta. Estos casos **no están resueltos** por DINOv2 solo.
- [x] Evaluador actualizado: top-1/top-8, etiquetas pendientes excluidas, tasas
  con denominadores y grupos por origen/partición/condición. Baseline de originales
  3/5 top-1 y 4/5 top-8; no mide el recorte cliente ni precisión general.
- [ ] Ampliar a 50–100 fotos reales con IDs exactos, negativos, full-art,
  reimpresiones, fundas/reflejos y diferentes teléfonos.
- [ ] Medir top-1/top-8, falsa predicción, rechazo y tiempos fríos/calientes
  sobre recortes del cliente; separar originales directos y consultas reales.

### 5. Motor e índice — implementados; robustez pendiente

- [x] CLI por cantidad/set/IDs, caché, metadata, bloqueo, reanudación,
  validación y carga/recarga consistente.
- [x] Índice completo local: **20.670 IDs únicos / 175 carpetas**, según
  inventario documentado del 3/10. No requiere reindexación para este paso.
- [x] Runtime sin imágenes de referencia: ID/vector, metadata y modelo.
- [x] Worker: SIGKILL activo/en reposo, cancelacion y timeout real de 30 s,
  seguidos de consulta exitosa y reutilizacion caliente; regresiones de IPC.
- [x] SIGINT real y reanudacion con cache en CLI directo y lotes por set:
  salida 130, locks liberados, vectores conservados y sin duplicados.
  [Informe](../evaluations/scanner-index-resume-2026-10-06.md).
- [x] Corrida de 10 minutos con pausas: 602 consultas exitosas, SIGKILL
  propio a mitad y recuperacion verificados; un PID por fase y listeners estables.
  [Informe](../evaluations/scanner-soak-2026-10-06.md).
- [x] Fallos de red y cierre forzado durante indexación: 11 casos aislados
  con CLIs/modelo reales. Caché inválida reparable, timeout real de 30 s,
  publicación validada y rechazo de JSONL incompleto; locks tras SIGKILL
  requieren recuperación manual verificando todos los escritores.
  [Informe](../evaluations/scanner-index-failures-2026-10-06.md).
- [ ] Estabilidad de horas/días. No cerrada por estas muestras acotadas.
- [ ] Decisión sobre runtime/cuantización basada en corpus y rendimiento.

### 6. Integración visual — implementada; precisión/calibración pendientes

- [x] `POST /api/cards/identify-visual` autenticado; validación y flags backend,
  proceso local aislado, sin descargas ni indexación por request.
- [x] DINOv2 coseno top-8; revisión manual y acceso a búsqueda manual.
- [ ] Mejorar recuperación de casos fuera del top-8 y medir regresiones.
- [ ] Calibrar confirmación/rechazo con negativos y cartas fuera del catálogo.
- [ ] Desambiguar ediciones/reimpresiones y ampliar casos full-art.

Sumar el primer candidato a la sesión no es una certeza calibrada; guardar en
colección es explícito. La UI nueva permite corregir, pero no recupera por sí
misma una carta ausente del top-8.

### 7. Latencia — base implementada; medición pendiente

- [x] Worker/modelo persistentes, recarga del índice, cancelación y timeout.
- [x] Cierre HTTP real en servidor aislado: tres consultas activas canceladas
  liberan el service y terminan su worker; reintentos y reutilización posterior
  correctos. El reintento recarga modelo/índice. No certifica navegador/red física.
  [Informe](../evaluations/scanner-http-cancel-2026-10-06.md).
- [x] Diagnósticos de carga/inferencia y mediciones frías/calientes disponibles.
- [x] Carga local controlada: rafagas 1/2/4/8, un worker y listeners estables;
  752 intentos, 202 procesados y 550 rechazos por ocupado. HTTP autenticado
  tambien verificado con rafagas de 2/4. [Informe](../evaluations/scanner-load-2026-10-06.md).
- [ ] p50/p95/p99 de extremo a extremo en dispositivos/redes reales y
  estabilidad prolongada. RSS acotado observado no certifica ausencia de fuga.
- [ ] Optimizar según evidencia; WebGPU no está implementado.

Las mediciones históricas de verificación ORB no describen el runtime actual.

### 8. Captura difícil — parcial

- [x] Cámara de teléfono con guía, señal de estabilidad, captura automática,
  intervalo mínimo y prevención de repetición en una escena quieta.
- [x] Recorte/diagnóstico descargables bajo demanda. Fotos de revisión en memoria
  cliente; no se incluyen en la sesión persistida.
- [x] Perspectiva de galería implementada y geometría verificada con fixtures.
- [x] Métricas locales de detalle y zonas muy claras, exportadas en diagnóstico;
  consejos orientativos experimentales en revisión y galería, sin bloqueo.
- [ ] Validar perspectiva y calibrar avisos de reflejos/desenfoque en corpus amplio.
- [ ] Acabados normal/holo/reverse y reimpresiones.
- [ ] Memoria visual con consentimiento/borrado, si se retoma ese alcance.

### 9. Mobile nativo — pendiente; posterior

- [x] Flujo web/PWA implementado.
- [ ] Validar enfoque/captura y PWA en iPhone/Android.
- [ ] Evaluar app y runtime nativos cuando se retome ese alcance.

## Checklist de ejecución — tareas siguientes, con GO por bloque

Esta lista convierte los pendientes de las etapas en entregas concretas.
Preparar una implementación no cierra su validación con fotos/dispositivos.

### Bloques locales terminados

- [x] Verificar integración de galería, corrección, sesión y guardado en colección.
- [x] Preparar evaluador, manifiesto, protocolo y baseline DINOv2 vigente.
- [x] Corregir y verificar recuperación del worker tras interrupciones de IPC.
- [x] Verificar concurrencia y rechazo por ocupado, incluidos requests HTTP.
- [x] Verificar SIGINT, locks y reanudación del indexador con caché local.
- [x] Ejecutar estabilidad local de diez minutos con recuperación a mitad.
- [x] Verificar orden global por precio y colección pública anónima desktop.
- [x] Verificar cancelación HTTP activa, reintento y reutilización del worker.

### A. Podemos comenzar sin las fotos nuevas

- [x] **A1 — Perspectiva (etapas 2/8):** rectificación de galería a 63/88
  implementada, con respaldo al recorte anterior y seis pruebas geométricas.
  Cinco fotos existentes: 2/5 top-1 antes, 5/5 después en preparación Node;
  validación amplia/en navegador pendiente de B2. Sin cambios visuales.
  [Informe](../evaluations/scanner-perspective-2026-10-06.md).
- [x] **A2 — Calidad de captura (etapa 8):** métricas locales, diagnóstico
  y consejos orientativos experimentales implementados con el especialista UI.
  Pruebas de métricas/flujo y revisión desktop en claro/oscuro completadas;
  umbrales reales pendientes de B1/B2, móvil físico pendiente de C1/C3.
  [Informe](../evaluations/scanner-quality-2026-10-06.md).
- [x] **A3 — Fallos del indexador (etapa 5):** descargas fallidas/interrumpidas
  y cierre forzado verificados en 11 casos aislados. Corregidos caché inválida
  persistente, lector pendiente después del timeout y continuidad de JSONL
  incompleto. El índice activo no se modificó; SIGKILL conserva locks y una
  línea parcial requiere respaldo/reconstrucción, sin reparación automática.
  [Informe](../evaluations/scanner-index-failures-2026-10-06.md).
- [ ] **A4 — Estabilidad prolongada (etapas 5/7):** preparar una corrida
  configurable de horas, con RSS, errores, percentiles y recuperación; ejecutar
  un período acordado y documentar sus límites. No se cierra con otra prueba breve.

### B. Evaluación y mejoras respaldadas por fotos

- [ ] **B1 — Corpus (etapa 4):** recibir y etiquetar 50–100 fotos con ID exacto,
  condiciones, origen y partición; incluir negativos, full-art y reimpresiones.
  Confirmar edición de Darmanitan. Se puede comenzar con una primera tanda de 20.
- [ ] **B2 — Medición del flujo real (etapas 2/4/7):** evaluar recortes exportados
  por el cliente, top-1/top-8, errores y tiempos fríos/calientes; comparar el
  recorte vigente con A1/A2 sin mezclar originales directos y consultas reales.
  Calibrar los avisos de calidad y medir falsos avisos con condiciones etiquetadas.
- [ ] **B3 — Recuperación (etapa 6):** reproducir Carkol y casos fuera del top-8,
  implementar una mejora DINOv2 respaldada por B2 y medir regresiones sobre
  una partición reservada. No reintroducir OCR ni ORB.
- [ ] **B4 — Confirmación/rechazo (etapa 6):** calibrar con positivos, negativos
  y cartas ausentes; definir estados y validar su UI con el especialista.
  No tratar el primer candidato como certeza sin esa evidencia.
- [ ] **B5 — Ediciones y acabados (etapas 6/8):** evaluar reimpresiones y
  normal/holo/reverse; implementar confirmación explícita cuando la foto
  no permita distinguirlos con fiabilidad.
- [ ] **B6 — Runtime (etapas 5/7):** comparar alternativas o cuantización
  conservando el mismo corpus; decidir por precisión, memoria y latencia.
  WebGPU requiere evaluar compatibilidad y alcance antes de implementarlo.

### C. Validación en dispositivos

- [ ] **C1 — Cámara/PWA (etapas 1/9):** probar iPhone y Android: permisos,
  enfoque, orientación, guía, captura automática, instalación y retorno a la app.
- [ ] **C2 — Red y offline (etapas 1/7):** probar latencia, desconexión y
  reconexión durante reconocimiento/guardado; verificar mensajes, sesión
  conservada y reintento sin duplicados. El reconocimiento necesita backend.
- [ ] **C3 — Rendimiento y render móvil (etapas 1/7):** medir p50/p95/p99
  de extremo a extremo y revisar búsqueda, colección pública y escáner en
  dispositivos reales. Separar carga inicial de consultas calientes.

### D. Alcance posterior, requiere decisión

- [ ] **D1 — Memoria visual:** decidir si se retoma; definir consentimiento,
  separación por usuario y borrado antes de diseñar la implementación.
- [ ] **D2 — App nativa:** decidir necesidad y plataforma después de C1–C3;
  evaluar cámara y runtime nativos si se aprueba ese alcance.

Orden sugerido restante: **A4**, según disponibilidad del equipo.
B1 y C1 pueden avanzar mientras se prepara A. B3–B6 dependen de mediciones;
no constituyen mejoras ya demostradas. Cada bloque requiere su propio GO.

## Registro de bloques autorizados y completados

1. **Validación y actualización del plan: completado dentro del entorno local.**
   Check, galería/corrección y persistencia API verificados. Pruebas físicas
   siguen abiertas y no se declaran realizadas.
   Bloque adicional con GO: orden por precio del catálogo completo y colección
   pública anónima verificados; render móvil sigue pendiente.
2. **Evaluación amplia: preparación implementada con GO.** Evaluador,
   protocolo y baseline de cinco originales listos. El usuario tomará nuevas
   fotos por la tarde; corpus amplio/negativos/holdout y medición del flujo
   real quedan pendientes. Ver [entrega del paso 2](../evaluations/scanner-step2-2026-10-06.md).
3. **Reconocimiento y confirmación:** mejoras respaldadas por la evaluación;
   intervención del especialista UI si cambia la experiencia visual.
4. **Estabilidad y rendimiento: primer bloque completado con GO.**
   Interrupcion, cancelacion, timeout y recuperacion del worker verificados;
   check verde (674 pruebas). Ver [informe](../evaluations/scanner-stability-2026-10-06.md).
   Segundo bloque con GO: concurrencia/carga local y HTTP verificados,
   check verde (675 pruebas); mediciones locales frias/calientes y RSS disponibles.
   Tercer bloque con GO: SIGINT/reanudacion directa y por set verificados
   sin descargas ni reindexacion del catalogo completo.
   Cuarto bloque con GO: corrida de diez minutos completada, 602 consultas
   exitosas y recuperacion a mitad; check verde (675 pruebas).
   Quinto bloque con GO: cancelación HTTP real, tres reintentos fríos y
   reutilización caliente posterior verificados en servidor aislado;
   check verde (675 pruebas).
   Estabilidad de horas/dias y percentiles en dispositivos siguen pendientes.
5. **Captura difícil:** perspectiva/reflejos/desenfoque y matriz física.
   Mobile nativo permanece posterior.

Paso 2 preparado, esperando fotos; cinco bloques locales del paso 4 verificados.
El resto requiere GO. No se cambio modelo, indice ni UI.
Informe: [validación del paso 1](../evaluations/scanner-step1-2026-10-06.md).
Fuente del flujo vigente: [scanner.md](../../frontend/docs/scanner.md).

## Registro histórico — observaciones previas, no estados vigentes

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
