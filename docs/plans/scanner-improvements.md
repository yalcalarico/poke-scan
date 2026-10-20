# Mejoras del escáner

## Roadmap vigente — revisión documental del 20 de octubre de 2026

La implementación base del 6/10 quedó en `5a2fe2f`; no es el HEAD actual.
Desde entonces se corrigieron el recorte interior de galería y la numeración:
[validación del 20/10](../evaluations/scanner-crop-fix-2026-10-20.md).
El recorte reportado de Umbreon pasa del puesto 563 al 3; Luxray sigue primero.
En cinco originales, el [contraste actual](../evaluations/scanner-baseline-contrast-2026-10-20.md)
produce 3/5 top-1 y 5/5 top-8 antes y después del último parche, con decoder nativo.
No reproduce exactamente el pipeline del 5/5 histórico; su diferencia sigue sin
causa demostrada. No confundir originales directos con recortes exportados.

Los recibos del 6/10 citados abajo son antecedentes de esos hitos, no una nueva
validación actual ni permisos para ejecutar todos los pendientes. La [historia
completa anterior](../archive/orchestration-2026-10-20/README.md) conserva cada checkpoint.
No se cierran corpus, calibración ni dispositivos con esta limpieza.

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
- [x] Corrección de recorte interior/rotación y numeración del 20/10, con regresiones
  y galería/guardado reales aislados. No demuestra precisión física/general.
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
  resultado histórico de ese pipeline. Galería real acreditada para el caso del
  20/10; validación amplia y protocolo comparable siguen pendientes de B2.
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

## Historia de ejecución

Los bloques autorizados y registros previos (2–6/10), incluidos OCR/ORB retirados,
están en el [snapshot íntegro](../archive/orchestration-2026-10-20/scanner-improvements.md.txt).
Sus conteos, commits, «siguientes pasos» y decisiones con fecha son historia;
este roadmap y el [estado actual](../estado-actual.md) ordenan el trabajo abierto.
