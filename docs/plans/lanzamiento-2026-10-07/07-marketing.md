# Plan de Marketing

Fecha: 2026-10-07 · Estado: MKT-01/MKT-02 documentales completadas; MKT-03 pendiente · IA objetivo: ChatGPT / especialista de marketing.

## Objetivo

Conseguir una beta relevante y comunicar capacidades disponibles sin prometer lo que no existe.

## Alcance y fronteras

**Incluye:** Posicionamiento, copy de adquisición, guiones de invitación, canal/prueba de mensajes y contenido. Archivos de resultados y handoffs; no editar componentes de frontend.

**Fuera de alcance:** Código/analytics/metadata, entrevistas y análisis de corpus, definición de precio final, publicar campañas o enviar mensajes sin autorización, comprar anuncios o prometer precio argentino/precisión garantizada.

Leé [el índice](README.md), [las decisiones](10-decisiones-y-contratos.md) y AGENTS.md antes de ejecutar. Elegí una sola tarea por entrega; los gates no se satisfacen por pasar el tiempo.

## Evidencia de partida

- [frontend/components/marketing/landing-page.tsx](../../../frontend/components/marketing/landing-page.tsx)

- [frontend/components/marketing/faq-section.tsx](../../../frontend/components/marketing/faq-section.tsx)

- [frontend/docs/portfolio.md](../../../frontend/docs/portfolio.md)

- [frontend/docs/scanner.md](../../../frontend/docs/scanner.md)

- [docs/data-sources.md](../../../docs/data-sources.md)


La evidencia es estática al 7/10 o documentada con su fecha. Revalidá código y cambios locales antes de actuar; no atribuyas a esta planificación tests, mediciones o entrevistas nuevas.

## Tareas delegables


### MKT-01 — Corregir promesa y posicionamiento

Estado: Completada documentalmente, Luna + revisión/corrección Sol HIGH · Prioridad: P1 · Estimación orientativa: 4–8 h.

**Dependencias/entradas:** Inventario vigente; RES-01 para versión validada; NEG-01 para Pro.

**Trabajo:** Preparar copy por sección de landing/FAQ para coleccionistas de sets/duplicados como hipótesis inicial. Historial por consulta y CSV ya existen; no anunciarlos como novedad futura. Distinguir seguimiento automático potencial, referencias internacionales convertidas, conexión requerida, errores de escaneo y Pro sin cobro activo. Reutilizar layout existente.

**Aceptación:** Tabla texto actual/propuesto/evidencia/ruta/destinatario FE. Cada promesa clasifica disponible/experimental/futuro. Ningún número de precisión o mercado local sin fuente; ningún beneficio Free desaparece por conveniencia comercial.

**Entregable:** RESULTADOS/MKT-01-copy.md y brief frontend; sin publicación.

**Aceptación documental, 8/10 local (9/10 UTC):** [copy/brief corregidos](RESULTADOS/MKT-01-copy.md)/[revisión Sol HIGH](RESULTADOS/MKT-01-review.md).22 filas/ocho FAQ, clasificación local/experimental/futuro, CSV/historial de referencias y observaciones de portafolio por consulta conservados como Free. Fechas/fuentes/conversión/condición, privacidad/cuenta/conexión/cámara y CTA existentes precisados. Coordinación verificó9 artefactos,41 hashes de fuentes antes de actualizar planes y49 destinos locales; anchors/correspondencia revisados Sol HIGH. Se documentó AGENTS §8 inventario B1/B2/B6 stale frente a código/docs actuales, sin editarlo. ID documental completo como hipótesis: entrevistas/oferta Pro/FE-07/SEO-03/publicación y gate estándar permanecen en sus respectivos alcances; sin producto ni nuevas suites/runtime.


### MKT-02 — Preparar reclutamiento beta acotado

Estado: Completada documentalmente · Luna + revisión/corrección Sol HIGH · Prioridad: P1 · Estimación orientativa: 4–8 h.

**Dependencias/entradas:** RES-01 guion; RES-03 protocolo; INF-02/03 y P0 para invitar a usar.

**Trabajo:** Planificar 10–20 participantes, canales locales o tiendas y mensajes editables. Establecer cupo compatible con inferencia, forma de feedback y expectativas del piloto. Coordinar con dueño el contacto real; no enviar mensajes, scrapear emails ni cargar PII en repo. Evitar adquisición masiva antes de runtime confiable.

**Aceptación:** Cada canal tiene hipótesis, mensaje, responsable, autorización pendiente para envío y métrica activados por invitación. Distinguir invitación, registro y usuario que guarda lote. Cronograma no promete disponibilidad no probada.

**Entregable:** RESULTADOS/MKT-02-beta.md con mensajes copiables y logística; ejecución humana o autorizada después.


**Aceptación documental, 8/10 local:** [logística](RESULTADOS/MKT-02-beta.md)/[revisión](RESULTADOS/MKT-02-review.md) aceptadas: tres canales, ocho etapas y cinco momentos; activados por invitación única, guardado confirmado, D28 [28,35), faltantes y retención por propósito. Root verificó12 artefactos,11 fuentes y28 enlaces/anchors antes de editar centrales; [recibo](RESULTADOS/RONDA-20261008-cierre-documental-root.json). ID de preparación completo; participantes/contacto/operación/G1 siguen separados y pendientes. Sin mensajes, PII en Git, publicación ni producto.

### MKT-03 — Contenido y retorno medidos

Estado: Pendiente · Prioridad: P2 · Estimación orientativa: 4–8 h.

**Dependencias/entradas:** RES-01/03 resultados; SEO-03 briefs coordinados; NEG-01 si hay oferta.

**Trabajo:** Priorizar tres piezas útiles sobre faltantes, variantes o preparar carpeta de intercambio. Diseñar recordatorio opcional sobre tarea real y compartir entre conocidos; no crear alertas de precio en marketing. Acordar CTA, canal, frecuencia y criterio de interrupción; no envío automático ni anuncios pagos.

**Aceptación:** Contenido cita capacidades vigentes y evidencia; métrica llega a activación/retorno, no solo views. Queda claro quién redacta, quién implementa y quién publica. Respeta consentimiento y preferencias; no vende funciones pendientes.

**Entregable:** RESULTADOS/MKT-03-calendario.md con briefs/copy y métricas, sin acciones externas.


## Prompt refinado con Lyra

Modo BÁSICO: contexto preservado, scope cerrado, dependencias y aceptación explícitos. No se requiere una segunda optimización para comenzar. Sustituí únicamente el ID; los demás insumos están en los documentos.

```text

Actuá como especialista de Marketing para PokéScan. Ejecutá solamente [ID_DE_TAREA] del archivo docs/plans/lanzamiento-2026-10-07/07-marketing.md.

Leé primero README.md y 10-decisiones-y-contratos.md de esa carpeta, AGENTS.md raíz y las instrucciones de la carpeta que vas a tocar. Inspeccioná el estado real y los cambios locales: no sobrescribas trabajo ajeno ni reimplementes funcionalidades existentes.

Tu alcance es: Posicionamiento, copy de adquisición, guiones de invitación, canal/prueba de mensajes y contenido. Archivos de resultados y handoffs; no editar componentes de frontend.
No incluye: Código/analytics/metadata, entrevistas y análisis de corpus, definición de precio final, publicar campañas o enviar mensajes sin autorización, comprar anuncios o prometer precio argentino/precisión garantizada.

Comprobá las dependencias del ID. Si falta una, hacé solo preparación independiente, documentá la entrada faltante y dejá la tarea pendiente; no inventes contratos/resultados ni expandas scope. Una decisión comercial/externa no se reemplaza por tiempo transcurrido.

Respetá versiones/pnpm, DINOv2 exclusivo, fotos de consulta no persistidas y límites/cola/caché de fuentes. No reveles secretos ni datos personales. No mandes mensajes, publiques, cobres o contrates servicios salvo autorización humana explícita aplicable a esa acción.

Entregá los cambios/artefactos concretos del ID, referencias, criterio de aceptación verificado, pruebas/mediciones realmente ejecutadas y límites pendientes. Por corrección explícita del usuario, cada tarea requiere pruebas enfocadas y revisión/corrección Sol HIGH, con pnpm run stop antes de tests. Al finalizar el lote asignado por 11-orquestacion.md se ejecutan pnpm run check global y flujo real aislado/limpieza cuando afecta datos; no repetir global por tarea. Investigación/diseño sin código validan fuentes/enlaces/estados y no afirman check verde. Entregá artefacto/evidencia al coordinador, único escritor de REGISTRO-TAREAS.md y estados de los planes. No cierres tareas de otras áreas ni avances un lote con gate pendiente/fallido.

```


**Qué refinó Lyra:** separó responsabilidades, transformó mejoras generales en entregables observables, distinguió hipótesis de hechos y agregó gates para evitar construir Pro o marketplace sin evidencia.


**Consejo de uso:** delegá el ID y su plan completo; no copies solamente el título. Entregá dependencias resueltas y registrá cualquier cambio de contrato antes de implementar.
