# RES-03 · Protocolo de activación, dispositivos y retención

Fecha: **2026-10-07**. Responsable: investigación, con coordinación del dueño. Estado: **fase protocolo entregada; ejecución y resultados pendientes**. Referencia de código: `5a2fe2f557b677b2c6e38749a1932d24a21b25c5`, más cambios locales inspeccionados y no modificados. No hubo participantes, capturas, benchmarks ni instrumentación nueva en esta entrega.

## Entrada recibida y alcance

Se recibieron [RES-03](../04-investigacion.md), [DEC-04](../10-decisiones-y-contratos.md), el [roadmap](../09-coordinacion-roadmap.md) y la documentación vigente de [escáner](../../../../frontend/docs/scanner.md) y [portafolio](../../../../frontend/docs/portfolio.md). Este protocolo entrega método, diccionario y plantillas de medición para FE-05/BE-06. No implementa eventos ni elige un servicio externo.

RES-01 conserva entrevistas, segmento y guion de reclutamiento. RES-02 conserva corpus, precisión DINOv2, particiones y calibración; reutilizá su [protocolo vigente](../../../evaluations/scanner-validation-protocol.md) para esos objetivos. Aquí se evalúa la tarea completa y su resultado en inventario. Una corrección observada en esta prueba no convierte el lote en un benchmark de precisión del modelo.

## Preguntas y criterios exploratorios

| Pregunta | Medición | Criterio de partida |
|---|---|---|
| ¿Se puede ingresar un lote sin asistencia? | Participantes que completan las 20 copias con identidad, variante, condición, cantidad y colección correctas | Al menos 8/10 sin ayuda del moderador |
| ¿Ahorra tiempo frente al método habitual? | Mejora individual `(tiempo habitual − tiempo app) / tiempo habitual`; mediana de pares válidos | Mediana de al menos 30%; informar cuántos pares son comparables |
| ¿Se preserva el acabado? | Errores finales de variante y su causa | Cero errores causados por default silencioso; separar selección del usuario y fallo técnico |
| ¿Se entiende el valor mostrado? | Explicación con palabras propias según rúbrica | Al menos 9/10 comprende referencia, parcialidad y límites |
| ¿Existe retorno a una tarea útil? | Cohorte activada que vuelve espontáneamente en D28 | Al menos 25% como señal para investigar; no acredita ajuste producto/mercado |

Publicá los conteos y denominadores junto a los porcentajes. Con diez participantes, 8/10 es 80%, 9/10 es 90% y una cohorte D28 de diez requiere al menos tres retornos para superar 25%. Un criterio no alcanzado conduce a revisar fricciones, no a cambiar el denominador. Los tiempos y errores se presentan por participante; las 200 copias no son 200 usuarios independientes.

## Preparación y entradas para ejecutar

El protocolo puede consumirse ahora. La evaluación representativa del producto espera FE-01/FE-02 e INF-02 aceptados; su versión/entorno quedan congelados y anotados al iniciar cada ronda. La observación manual no necesita FE-05. Las cohortes automatizadas esperan FE-05 y un receptor acordado en DEC-04; BE-06 interviene si se elige receptor propio y para métricas operativas. G1 y disponibilidad de participantes siguen pendientes.

Antes de cada ronda, el responsable verifica:

1. Cuentas y colecciones de prueba aisladas, artefactos DINOv2 disponibles y HTTPS válido en teléfonos. No usar cuentas ni colección personal del dueño para ensayos de fallos.
2. Diez participantes disponibles por canal autorizado del dueño, con consentimiento y seudónimos `P01`–`P10`. RES-01 decide el segmento; registrar familiaridad relevante por categoría, sin inventar demanda ni reclutar desde esta tarea.
3. Un lote de **20 copias físicas por participante**, todas identificadas previamente por un evaluador mediante edición y número, con variante/condición revisadas a mano. La etiqueta no se obtiene de la predicción DINOv2. Si existe desacuerdo de condición, anotarlo y resolverlo antes o excluir ese atributo de la evaluación correspondiente.
4. Lote recomendado: 12 identidades distintas y ocho copias adicionales, incluyendo al menos dos grupos que compartan ID y difieran en acabado y dos que difieran en condición; usar solo combinaciones válidas del catálogo. Si no hay material para una categoría, documentar el faltante y no afirmar cobertura de esa categoría.
5. Material para revisar al menos un caso corregible y uno sin precio si aparece en el entorno. No manipular rankings ni proveedor externo para producirlos; los estados que no aparezcan en la tarea principal se comprueban en la matriz técnica, con fixture aislado si existe.
6. Método habitual disponible y definición de salida equivalente. Si el método habitual no permite guardar variante/condición, registrar que la comparación es de ingreso básico o excluir el par del ahorro comparable completo. No comparar una tarea abreviada con otra más exigente.
7. Versión de app, commit más cambios locales, modelo/índice, fecha, dispositivo, SO, navegador, modo y red registrados. No atribuir al commit por sí solo el comportamiento de un árbol con modificaciones locales.

No se requieren fotos nuevas para este protocolo. Una solicitud de foto diagnóstica es otra participación voluntaria bajo RES-02; no se guarda automáticamente ni se convierte en requisito para completar la tarea.

## Sesión observada: ejecución en orden

Duración orientativa: 45–60 minutos, ajustable al lote. Usá la misma pauta y silencios para todos.

1. **Consentimiento y contexto:** explicar que se evalúa la app; rechazar o abandonar no afecta el acceso. Registrar experiencia por categoría. No ejecutar entrevista de segmento aquí.
2. **Preparación fuera del tiempo principal:** registrar por separado alta/login, configuración y permisos iniciales. Ofrecer dos cartas de práctica, distintas del lote; sus tiempos y errores no entran en resultados. Medir el arranque real por separado, sin ocultarlo del informe.
3. **Comparación emparejada:** cinco participantes usan primero su método habitual y cinco primero la app. Usan las mismas 20 copias y una salida acordada, con colecciones/listas de prueba separadas. Contrabalancear reduce el efecto de práctica; no lo elimina. Anotar orden y posibles ayudas del método habitual.
4. **Tarea principal:** “Ingresá estas 20 cartas en la colección de prueba, revisá lo necesario y dejá las cantidades, acabados y condiciones que corresponden”. Iniciar cronómetro al primer intento de ingreso y detener al confirmar guardado y comprobar la colección final. El tiempo incluye correcciones, navegación, espera y recuperación. Una lectura en sesión no es un guardado. Registrar interrupciones y tiempo activo/tiempo total por separado; usar tiempo total como métrica principal.
5. **Asistencia:** el moderador no señala controles ni corrige atributos. Si el participante pide ayuda, registrar motivo y momento; puede continuar, pero cuenta como asistido. Fijar antes una detención a 25 minutos por método para evitar sesiones indefinidas: informar censura y no sustituirla por un tiempo de éxito. No excluir abandonos del denominador de cumplimiento.
6. **Comprobación final:** el evaluador compara el inventario persistido con el manifiesto privado del lote: ID/edición, variante, condición, cantidad y destino. Registrar errores corregidos, errores residuales, copias ausentes, adicionales y defaults. Exportar CSV únicamente si el participante consiente y solo hacia almacenamiento privado del estudio; la revisión visual puede bastar.
7. **Precio:** pedir “Explicame qué significa este total y qué no podrías concluir de él”. Sin anticipar la respuesta, aplicar la rúbrica siguiente. El test no cambia etiquetas del producto ni atribuye una fecha upstream que no exista.
8. **Compartir:** crear un enlace de una colección de prueba, abrirlo en contexto sin sesión y comprobar campos públicos, alcance y notas privadas. No enviar el enlace a terceros. Revocación/vencimiento y caché caliente se prueban por la matriz técnica; no asumir que una lectura aislada certifica privacidad.
9. **Cierre:** registrar fricciones y confirmar si el participante acepta seguimiento. El seguimiento no significa autorizar al agente a contactar personas. El dueño coordina contacto y calendario por un canal autorizado.

### Rúbrica de comprensión del precio

Marcar cada punto como explicado espontáneamente, después de pregunta neutral, incorrecto o no observado:

- Es una referencia de fuente internacional; ARS es conversión y no prueba de venta local.
- Las cartas sin referencia pueden hacer que el total sea parcial; desconocido no equivale a cero.
- Guardar condición no demuestra que exista ajuste automático por desgaste.
- Si se pregunta por historial, cambios de composición y precio no equivalen a ganancia ni ROI; el cambio histórico a ARS no es una serie de tipo de cambio histórico.

Para el objetivo 9/10 exigir los tres primeros puntos correctos sin explicación del moderador. El cuarto se informa aparte si se presentó historial a todos. Si la versión todavía no explica estos límites, el resultado puede evidenciar una brecha; no corregir la respuesta y contarla como comprensión inicial.

## Dispositivos físicos y recuperación

Objetivo de distribución para diez participantes: cinco iPhone/Safari y cinco Android/Chrome, con al menos dos observaciones en pestaña y dos en PWA por plataforma si hay disponibilidad. La distribución es objetivo de cobertura, no cuota cumplida sin evidencia. Anotar modelos y versiones reales; desktop redimensionado no cubre teléfonos. Las pruebas de falla se hacen aparte del tiempo comparativo, sin inflar la muestra de participantes.

| Caso | Procedimiento aislado | Criterio y evidencia |
|---|---|---|
| Cámara y permisos | Permitir, denegar y restaurar permiso; cambiar de segundo plano a primer plano | Salida comprensible, cámara recuperable, sin falsa confirmación de guardado |
| Pestaña/PWA | Repetir ingreso, cierre y reapertura en cada modo disponible | Estado pendiente conservado según UX-01; fotos no recuperadas desde storage |
| Teclado y orientación | Editar cantidad/condición, abrir teclado y girar el dispositivo | Controles alcanzables; registrar soporte observado, no prometer cámara horizontal |
| Lectura quieta/corrección | Mantener carta y luego cambiar; revisar y sustituir candidata | Sin duplicado por quietud ni al corregir; `runId` conserva la lectura sustituida |
| Red lenta | Usar control de red del entorno de prueba o conexión real descrita | Separar espera de reconocimiento y precio; identidad no se pierde por precio |
| Offline/reconexión | Cortar conexión antes del envío y reconectar | Error recuperable; no mostrar reconocimiento offline ni escritura confirmada inexistente |
| Respuesta incierta | Usar caso reproducible de BE-02 que pierde respuesta tras escritura | Estado incierto y reconciliación acordada; repetir no duplica operación |
| Guardado parcial | Provocar fallo controlado de un grupo en colección de prueba | Se retiran solo éxitos; pendientes/cantidades persisten y pueden recuperarse |
| Enlace y caché | Calentar cachés, revocar/vencer y pedir página/metadata desde contexto nuevo | Cumplir DEC-02; ningún payload protegido nuevo después de la vigencia |

Registrar **Aprobado**, **Falló**, **No ejecutado** o **No reproducible**, con pasos, fecha, versión y entorno. No interpretar “No ejecutado” como aprobado. Los controles de fallo no se aplican a datos reales ni suspenden servicios compartidos. Cada corrección técnica genera una nueva ronda y conserva la evidencia anterior.

## DEC-04: método mínimo y diccionario propuesto

**Propuesta para la primera ronda:** observación manual y tabla privada, sin introducir un servicio de analytics. Para seguimiento automatizado, FE-05/BE-06 deben resolver receptor, seudónimo, consentimiento y almacenamiento antes de activarlo. Este artefacto es un contrato de medición propuesto para esos IDs; no certifica un receptor existente ni autorización de instalar un tercero.

Cada evento automatizado usa una envolvente con `schemaVersion`, `eventId` aleatorio estable para reenvío, `eventName`, `occurredAt` UTC, `receivedAt` asignado por receptor, `environment` acotado, `appVersion`, `studyParticipantId` aleatorio opcional y `sessionId` aleatorio. Solo participantes consentidos necesitan enlace estable entre sesiones. La correspondencia con persona/cuenta no viaja en el evento y se custodia aparte. No derivar seudónimos mediante hash de email.

| Evento | Emisor y disparador real | Campos mínimos específicos | Conteo y límite |
|---|---|---|---|
| `account_registered` | FE después de alta confirmada | Ninguno adicional | Una alta; no login, montaje ni cuenta ya existente |
| `task_session_started` | FE ante primer inicio explícito de escaneo/organización/búsqueda útil | `taskKind` enumerado, `mode` pestaña/PWA, `platform` iOS/Android/otro | Una sesión de tarea; idle de 30 minutos inicia otra al volver a actuar, no al renderizar |
| `scan_result_received` | FE al mostrar respuesta válida de reconocimiento para la lectura vigente | `scanAttemptId` aleatorio, `origin` cámara/galería, `elapsedMs` cliente | No emitir por 503, cancelación o respuesta vieja descartada; candidato propuesto no equivale a carta correcta |
| `scan_review_confirmed` | FE al confirmar revisión explícita | `scanAttemptId`, `reviewOutcome` sin cambio/corregido/manual | Una confirmación por acción; corrección sustituye lectura y no agrega éxito extra |
| `scan_failed` | FE al resolver intento sin resultado | `scanAttemptId`, `failureKind` ocupado/red/timeout/cancelado/otro, `elapsedMs` | Cancelación se informa aparte; no reconocimiento exitoso ni cuota inferida |
| `batch_save_resolved` | FE cuando una operación pasa a confirmado/parcial/fallido/incierto | `saveOperationId` aleatorio, `outcome`, `confirmedGroups`, `confirmedCopies`, `pendingGroups`, `elapsedMs` | Estados pueden evolucionar: derivar última resolución de la misma operación, sin sumar confirmaciones repetidas |
| `collection_useful_confirmed` | FE después de lectura autoritativa que verifica copia guardada y destino | `saveOperationId` cuando aplica, `confirmedCopies` | Dispara activación una vez por participante; no basta crear colección vacía ni proponer candidata |
| `share_link_created` | FE tras creación confirmada | Ninguno adicional | Una acción; no registrar URL, slug, contenido ni destinatario |
| `useful_task_completed` | FE al confirmar guardado/reconciliación, edición útil o uso de faltantes/duplicados con resultado definido | `taskKind` enumerado, `operationId` opcional para deduplicar | Acordar cada trigger con FE-05; ver página o abrir sesión no produce retorno útil |

No transmitir ID/nombre de carta, ID/título de colección, notas, textos libres, precios individuales, email, JWT, cookies, foto, recorte ni URL con token. Conteos y duraciones se validan como números acotados y outcomes mediante allowlist. Si un trigger de tarea útil no se puede verificar en el código actual, no emitirlo; usar comprobación manual y registrar la limitación.

La activación derivada es la primera `collection_useful_confirmed` en producción/piloto consentido con al menos una copia confirmada. Para el **estudio de lote**, éxito completo exige las veinte correctas y se mide aparte. Una colección de prueba guiada puede activar al participante del estudio, pero se etiqueta `study`; no se mezcla con activación espontánea de clientes. Registros, lectores, activados, retornados y suscriptores son poblaciones diferentes.

### Integridad y prueba para FE-05

Los eventos nacen de acciones/resoluciones, no de un `useEffect` que cuenta un montaje. `eventId` se genera una vez por hecho y se conserva en reenvío; el receptor deduplica por ese ID. Las resoluciones de escritura conservan `saveOperationId`; una nueva adición deliberada usa otra operación. El evento no resuelve la idempotencia de negocio de BE-02.

FE-05 debe comprobar: una acción en StrictMode produce el conteo esperado; un replay no duplica; cancelar o recibir 503 no cuenta como resultado; respuesta de lectura vieja no activa; guardado parcial no certifica el lote; incertidumbre seguida de reconciliación produce una resolución final; el fallo del receptor no bloquea captura ni guardado. No persistir eventos con fotos ni introducir una cola sin límite. Si no hay entrega fiable de eventos, el reporte declara pérdida posible y no presenta tasas como completas.

### Señales operativas para BE-06

Estas métricas agregadas explican fallos del servicio y no necesitan identidad de participante:

- Solicitudes de reconocimiento por resultado: 2xx, inválida/autenticación, 503 ocupado, timeout y otro error. Definir si se cuentan solicitudes recibidas, inferencias comenzadas y terminadas para no mezclar tasas.
- Duración HTTP de identificación, duración de inferencia y carga fría/caliente por separado, con n y distribución observada; no sumar percentiles para inventar p95 extremo a extremo.
- Estado/disponibilidad del worker, profundidad y edad máxima de trabajos de precios, retries y degradación de caché, por categorías acotadas.
- Si existe receptor propio: eventos recibidos, aceptados, rechazados y deduplicados, sin serializar payload inválido ni cuerpo de identificación.

No incluir IDs individuales ni rutas dinámicas/queries como etiquetas de métricas. Usar ruta plantilla y enum de error. Proteger el endpoint según su consumidor, no exponer diagnósticos privados por defecto. INF-04 define alojamiento/alertas luego; fallar al emitir métricas no bloquea el servicio. Los 503 no se incorporan a accuracy DINOv2.

## Seguimiento y cohorte D28

La unidad es participante seudónimo activado, no dispositivo, evento, registro ni suscripción. Elegí antes de medir uno de dos métodos: eventos consentidos con receptor resuelto o observación/autorreporte estructurado privado. Los métodos no se mezclan silenciosamente: reportar cohortes por método y limitaciones.

1. `activatedAt` es la primera colección útil confirmada. Fijar UTC y registrar fecha real; cohortes por semana de activación.
2. D28 se define como una tarea útil distinta durante **[activatedAt + 28 días, activatedAt + 35 días)**. La ventana de siete días evita atribuir a una visita exactamente a medianoche el resultado entero. No llamar a esta definición retención diaria exacta.
3. Al corte `T`, solo denominan participantes cuya ventana terminó: `activatedAt + 35 días ≤ T`. El resto figura “cohorte inmadura”, sin entrar como fracaso ni retorno.
4. Numerador: participantes elegibles con al menos una tarea útil confirmada en su ventana. Excluir ejecución automatizada, prueba del equipo y tareas realizadas solo por recordatorio/moderación del estudio; reportarlas como retorno provocado aparte. No enviar recordatorios de tarea para cumplir D28.
5. Con seguimiento manual, preguntar después de cerrar la ventana por uso espontáneo y fecha/tarea, sin inducir a realizarla; el dueño realiza únicamente contacto autorizado. Marcar `observado`, `autorreporte` o `sin evidencia`. No pedir screenshots que incluyan inventario privado si basta una declaración estructurada.
6. Reportar `retornos / activados elegibles`, número con evidencia y faltantes. Sin instrumentación fiable, mostrar una tasa mínima documentada y un rango de desconocimiento, no adjudicar “no volvió” a quien no contestó. Ejemplo metodológico: 3 retornos, 5 no retornos confirmados y 2 desconocidos de 10 elegibles ⇒ mínimo observado 3/10 y rango posible 3/10–5/10; no afirmar 3/8 como retención de toda la cohorte.

Reporte reproducible: filtrar entorno/método/cohorte; deduplicar `eventId`; reconstruir última resolución por `saveOperationId`; obtener primera activación por participante; excluir cohortes inmaduras; buscar tareas útiles en la ventana; separar retorno provocado, faltantes y baja de consentimiento. Si el participante retira consentimiento, respetar eliminación y registrar solo el cambio agregado de muestra que se pueda conservar: no seguir rastreándolo para completar el denominador.

## Consentimiento, acceso y retención propuestos

Antes de ejecutar, el dueño valida canal de contacto, almacenamiento y responsable. Estos plazos son propuesta operativa para el piloto; no constituyen un dictamen legal ni justifican recolectar datos de terceros.

- Consentimiento separado para sesión observada, seguimiento y eventos. La participación en estudio/analytics es opcional; no condiciona funciones básicas. Explicar propósito, datos, acceso, plazo y cómo retirar consentimiento.
- No grabar audio/video/pantalla por defecto. Si se necesita grabación, obtener consentimiento específico y definir almacenamiento/retención antes; este protocolo funciona sin ella.
- Guardar contacto y correspondencia persona↔seudónimo fuera de Git, en ubicación privada controlada por el dueño. Acceso solo a dueño/investigador designado. Separar la tabla de tareas de contactos y usar datos ficticios en ejemplos públicos.
- Conservar evidencia individual de observación/eventos como máximo 90 días desde la sesión inicial; permite completar la ventana D28. Borrar correspondencia y contacto del estudio a los 30 días posteriores al cierre del seguimiento, salvo consentimiento distinto verificable. Revisar también backups del almacenamiento elegido.
- Conservar solo síntesis agregada sin datos que permitan identificar participantes durante hasta 12 meses para comparar ciclos. En Git publicar únicamente esa síntesis; celdas demasiado pequeñas o citas identificables se omiten o agrupan.
- Ante retiro, detener nuevas mediciones y eliminar evidencia individual/enlace cuando corresponda; no prometer borrar agregados ya anonimizados si no es técnicamente posible identificarlos. El responsable confirma alcance real antes de iniciar.

No cambiar política de fotos de consulta: quedan fuera de eventos, logs y tablas. RES-02 define cualquier corpus voluntario separado con su propio consentimiento y plazo.

## Plantillas privadas y salida pública

Estas son estructuras de trabajo, no registros llenados ni evidencia de uso:

| Tabla privada | Columnas mínimas |
|---|---|
| Participación | seudónimo, consentimientos/fechas, método seguimiento, familiaridad categórica, inicio/fin de elegibilidad; contacto en archivo separado |
| Sesión | seudónimo, fecha, versión/árbol local, dispositivo/SO/navegador/modo/red, orden de métodos, lote y faltantes, tiempo de setup |
| Comparación | seudónimo, método, inicio/fin, duración total/activa, éxito completo, ayuda, censura/abandono, conteos de errores por causa, pares comparables |
| Revisión del lote | seudónimo, posición privada de copia, esperado vs persistido, clase de error, corrección/estado final; no publicar identidades del inventario |
| Comprensión | seudónimo, puntos de rúbrica, espontáneo/pregunta/incorrecto/no observado |
| Dispositivos | caso, versión, entorno físico, pasos, fecha, resultado, evidencia privada y ticket destinatario |
| Cohorte | seudónimo, activatedAt, ventana, madurez, tareas útiles/fechas, provocado o espontáneo, evidencia/método, faltante o retiro |

El futuro `RES-03-resultados.md` debe contener fecha/corte, muestra y reclutamiento real, cobertura de dispositivos, versión/entorno, medianas con pares válidos y dispersión, éxito/ayuda/abandono, errores por causa, comprensión por rúbrica, D28 con ventanas/denominadores/faltantes, límites y tickets sugeridos. Si aún no maduró D28, entregar resultado parcial y fecha mínima de cierre, sin marcar retención medida.

## Handoffs y aceptación de esta fase

- **FE-05:** recibe envolvente/diccionario, triggers y pruebas de deduplicación. Falta elegir receptor y resolver qué tareas útiles puede confirmar el frontend; no implementar una plataforma por defecto.
- **BE-06:** recibe señales operativas y contrato mínimo de recepción si DEC-04 elige receptor propio. Falta acuerdo de almacenamiento/acceso y verificación del entorno.
- **UX-01/02/03 y FE-01/02:** reciben tarea, criterio de lote y casos observables; los cambios de interacción/copy siguen siendo su scope.
- **RES-01/MKT-02/dueño:** proveen segmento, participantes consentidos y canal de seguimiento autorizado; no se contactó a nadie.
- **INF-02/04:** proveen entorno físico seguro y señales operables; no se desplegó ni contrató nada.

La fase protocolo queda lista para revisión/consumo: define diez usuarios y veinte cartas, comparación emparejada, rúbrica, matriz física, eventos cliente/servidor, método manual, cohorte D28 y tratamiento de consentimiento/faltantes. **RES-03 completo sigue pendiente** hasta ejecutar, registrar resultados reales y cerrar la ventana de seguimiento. Esta entrega valida estructura y enlaces; no ejecutó tests del producto ni afirma `pnpm run check` verde.
