# Plan de Investigación

Fecha: 2026-10-07 · Estado: RES-04 documental completada; protocolos RES-01/02/03 preparados; entrevistas, corpus y resultados pendientes · IA objetivo: ChatGPT para estrategia y análisis; especialista de evaluación con acceso local para mediciones.

## Objetivo

Obtener evidencia de uso, precisión y fuentes antes de ampliar alcance o cobrar.

## Alcance y fronteras

**Incluye:** Protocolos, análisis, evidencia fechada, corpus consentido y síntesis. Fotos de diagnóstico solo recolectadas voluntariamente fuera del runtime; rutas/archivos privados no se publican en Git.

**Fuera de alcance:** Implementación UI/API, cambios de ranking/umbrales, campañas, outreach sin autorización, valoración automática del mercado argentino o inventar resultados de usuarios/dispositivos.

Leé [el índice](README.md), [las decisiones](10-decisiones-y-contratos.md) y AGENTS.md antes de ejecutar. Elegí una sola tarea por entrega; los gates no se satisfacen por pasar el tiempo.

## Evidencia de partida

- [docs/evaluations/scanner-validation-protocol.md](../../../docs/evaluations/scanner-validation-protocol.md)

- [docs/plans/scanner-improvements.md](../../../docs/plans/scanner-improvements.md)

- [docs/evaluations/scanner-load-2026-10-06.md](../../../docs/evaluations/scanner-load-2026-10-06.md)

- [docs/evaluations/scanner-soak-2026-10-06.md](../../../docs/evaluations/scanner-soak-2026-10-06.md)

- [docs/evaluations/catalog-public-validation-2026-10-06.md](../../../docs/evaluations/catalog-public-validation-2026-10-06.md)

- [frontend/docs/portfolio.md](../../../frontend/docs/portfolio.md)

- [docs/data-sources.md](../../../docs/data-sources.md)


La evidencia es estática al 7/10 o documentada con su fecha. Revalidá código y cambios locales antes de actuar; no atribuyas a esta planificación tests, mediciones o entrevistas nuevas.

## Tareas delegables


### RES-01 — Validar segmento y tarea recurrente

Estado: protocolo entregado; entrevistas/resultados pendientes · Prioridad: P0 planificación; P1 ejecución · Estimación orientativa: 8–14 h.

**Dependencias/entradas:** Sin dependencia para protocolo; participantes vía MKT-02 y dueño.

**Trabajo:** Preparar entrevistas de 12–15 coleccionistas argentinos: método actual, idioma/ediciones, duplicados, faltantes, frecuencia, confianza en referencias y pagos. Comparar tareas, no opiniones genéricas. Distinguir principiante/coleccionista/vendedor. El dueño recluta o autoriza contacto; no enviar mensajes ni recoger PII por defecto.

**Aceptación:** Guion, consentimiento y tabla anonimizada con muestra/fecha; conclusiones separan observación/inferencia. Elegir un segmento por evidencia; si no hay entrevistas entregar solo protocolo, no demanda validada.

**Entregable:** [RES-01-segmento.md](RESULTADOS/RES-01-segmento.md): protocolo de entrevista entregado por Luna y revisado por coordinación el 7/10; entrevistas y demanda siguen pendientes. Insumo MKT-01 y NEG-01 cuando exista evidencia.


### RES-02 — Ampliar evaluación DINOv2 sin fuga de holdout

Estado: protocolo entregado y revisado Luna/Sol HIGH; corpus/ejecución/resultados pendientes · Prioridad: P0 protocolo; P1 ejecución · Estimación orientativa: 10–18 h.

**Dependencias/entradas:** Fotos voluntarias y etiquetas exactas; runtime local disponible.

**Trabajo:** Reutilizar evaluador/protocolo vigentes. Objetivo 50–100 fotos reales; identificar IDs, negativos, origen original/gallery-crop/camera-crop, dispositivos y condiciones. Separar development/holdout por identidad y reimpresiones relacionadas. No usar predicción como ground truth; no contar augmentaciones como nuevas fotos. Informar top-1/top-8, falsa aceptación bajo política vigente y latencias frías/calientes, con denominadores.

**Aceptación:** Reporte fija commit, modelo, índice, preprocesado, partición y material faltante. Casos sin etiqueta excluidos de precisión; negativos no diluyen accuracy. Repeticiones y holdout no se usan para elegir umbrales. Dataset privado con consentimiento y retención; ningún request de precio ni foto almacenada por API.

**Entregable:** RESULTADOS/RES-02-corpus.md con reporte agregado y manifiesto público sin fotos/PII; recomendaciones de cambios futuros a backend/frontend, sin implementarlos.

**Fase preparatoria aceptada, 8/10:** [protocolo](RESULTADOS/RES-02-corpus.md), plantillas vacías y [revisión Sol HIGH](RESULTADOS/RES-02-review.md).37 enlaces/18 fuentes/8 hashes publicados verificados, sin inferencia ni material privado. Denominadores, errores del runner, referencias ausentes, familias/holdout y consentimiento precisados. Esta fase no es reporte de precisión ni cierre del ID; el entregable agregado espera corpus consentido y ejecución.


### RES-03 — Protocolo de activación, dispositivo y retención

Estado: protocolo entregado; ejecución/resultados pendientes · Prioridad: P1 · Estimación orientativa: 8–14 h.

**Dependencias/entradas:** Protocolo puede empezar ya; ejecución después de FE-01/02, INF-02 y FE-05.

**Trabajo:** Definir diccionario de eventos y cohortes antes de instrumentar. Diez usuarios ingresan 20 cartas; medir tiempo frente a método habitual, errores de inventario, correcciones, entendimiento del precio y guardado. Matriz Safari/iPhone, Chrome/Android, pestaña/PWA, permisos, red lenta/offline/reconexión, teclado/orientación. Retención a cuatro semanas desde activación; distinguir registros, activos, participantes y suscriptores.

**Aceptación:** Umbrales exploratorios: 8/10 completa sin ayuda; mediana mejora 30%; cero errores de acabado causados por default silencioso; 9/10 comprende referencia; D28 ≥25% se usa para investigar, no declarar éxito universal. Fechas/denominadores/faltantes explícitos; no declarar mobile por resize desktop.

**Entrada ya entregada:** [RES-03-protocolo.md](RESULTADOS/RES-03-protocolo.md), revisada por coordinación el 7/10. Diccionario/procedimiento disponibles; receptor y evidencia de usuarios pendientes.

**Entregable:** RESULTADOS/RES-03-protocolo.md primero; RES-03-resultados.md solo al medir. Eventos mínimos para DEC-04.


### RES-04 — Validar fuentes, licencias y referencia local

Estado: Completada documentalmente, Luna + revisión/corrección Sol HIGH · Prioridad: P1 · Estimación orientativa: 6–12 h.

**Dependencias/entradas:** Acceso a fuentes oficiales; datos locales solo si son verificables.

**Trabajo:** Revisar 4–6 competidores incluyendo locales, precios y checkout disponibles, idiomas/condición/graduadas, fuentes y licencias de catálogo/imágenes/modelo ONNX/feed. Fuentes del análisis 6/10 son punto de partida, no vigencia perpetua. Separar ofertas de ventas comprobadas; comparar mismas carta/variante/condición/idioma/fecha. No hacer scraping masivo ni API de precios para esta revisión.

**Aceptación:** Cada afirmación enlaza fuente, fecha, moneda/modalidad y grado de verificación; incertidumbre explícita. No inferir autorización comercial por MIT del código ni disposición a pagar por tarifas extranjeras. Riesgos de deprecación y alternativa de catálogo documentados sin cambiar PK.

**Entregable:** RESULTADOS/RES-04-fuentes.md y pendientes para NEG-02/03 e INF-01.

**Aceptación documental, 8/10:** [informe corregido](RESULTADOS/RES-04-fuentes.md) y [revisión Sol HIGH](RESULTADOS/RES-04-review.md). Seis comparadores/cuatro locales, modalidades/monedas/grados y vigencia diferenciados, catálogo/imágenes/modelo/feed separados, deprecación y alternativas sin modificar PK.12 hashes/19 enlaces verificados por coordinación. Cell-DINO no se aplica a DINOv2 base/registers; procedencia ONNX local, contratos/permisos y referencia argentina homologada conservan incertidumbre explícita y handoffs. ID documental completo; sin permiso comercial, demanda validada, cambio de proveedor, código o suites nuevos.


## Prompt refinado con Lyra

Modo BÁSICO: contexto preservado, scope cerrado, dependencias y aceptación explícitos. No se requiere una segunda optimización para comenzar. Sustituí únicamente el ID; los demás insumos están en los documentos.

```text

Actuá como especialista de Investigación para PokéScan. Ejecutá solamente [ID_DE_TAREA] del archivo docs/plans/lanzamiento-2026-10-07/04-investigacion.md.

Leé primero README.md y 10-decisiones-y-contratos.md de esa carpeta, AGENTS.md raíz y las instrucciones de la carpeta que vas a tocar. Inspeccioná el estado real y los cambios locales: no sobrescribas trabajo ajeno ni reimplementes funcionalidades existentes.

Tu alcance es: Protocolos, análisis, evidencia fechada, corpus consentido y síntesis. Fotos de diagnóstico solo recolectadas voluntariamente fuera del runtime; rutas/archivos privados no se publican en Git.
No incluye: Implementación UI/API, cambios de ranking/umbrales, campañas, outreach sin autorización, valoración automática del mercado argentino o inventar resultados de usuarios/dispositivos.

Comprobá las dependencias del ID. Si falta una, hacé solo preparación independiente, documentá la entrada faltante y dejá la tarea pendiente; no inventes contratos/resultados ni expandas scope. Una decisión comercial/externa no se reemplaza por tiempo transcurrido.

Respetá versiones/pnpm, DINOv2 exclusivo, fotos de consulta no persistidas y límites/cola/caché de fuentes. No reveles secretos ni datos personales. No mandes mensajes, publiques, cobres o contrates servicios salvo autorización humana explícita aplicable a esa acción.

Entregá los cambios/artefactos concretos del ID, referencias, criterio de aceptación verificado, pruebas/mediciones realmente ejecutadas y límites pendientes. Por corrección explícita del usuario, cada tarea requiere pruebas enfocadas y revisión/corrección Sol HIGH, con pnpm run stop antes de tests. Al finalizar el lote asignado por 11-orquestacion.md se ejecutan pnpm run check global y flujo real aislado/limpieza cuando afecta datos; no repetir global por tarea. Investigación/diseño sin código validan fuentes/enlaces/estados y no afirman check verde. Entregá artefacto/evidencia al coordinador, único escritor de REGISTRO-TAREAS.md y estados de los planes. No cierres tareas de otras áreas ni avances un lote con gate pendiente/fallido.

```


**Qué refinó Lyra:** separó responsabilidades, transformó mejoras generales en entregables observables, distinguió hipótesis de hechos y agregó gates para evitar construir Pro o marketplace sin evidencia.


**Consejo de uso:** delegá el ID y su plan completo; no copies solamente el título. Entregá dependencias resueltas y registrá cualquier cambio de contrato antes de implementar.
