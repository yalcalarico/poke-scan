# MKT-02 — Preparación logística de beta acotada

Fecha: 2026-10-08 · Estado: **fase logística revisada; reclutamiento y uso de la beta no habilitados**. [Revisión y evidencia Sol HIGH](MKT-02-review.md). El coordinador decide el estado del ID conforme al plan; no falta una entrada para preparar el documento, sí para ejecutar invitaciones de uso.

## Propósito y límites

Preparar una ruta para invitar a **10–20 participantes** adultos como objetivo de planificación, sin asumir que ya existen, que aceptaron o que la capacidad técnica alcanza para recibirlos. Esta es una beta de uso del producto según RES-03. No reemplaza las 12–15 entrevistas de descubrimiento de RES-01: son actividades, consentimientos, denominadores y resultados distintos. Una persona puede participar en ambas solo si se la recluta una vez y acepta por separado cada actividad; no repetir la entrevista para completar los dos objetivos.

La secuencia depende de G1 y de un go operativo explícito del responsable: P0/privacidad, versión FE-01/FE-02 integrada, INF-02 habilitado con DINOv2 y artefactos válidos, acceso HTTPS en el entorno elegido, cuentas y colecciones aisladas, soporte/incidencias y capacidad del operador. El gate de operación local aprobado no es despliegue ni disponibilidad pública. Host, dominio, presupuesto y destino off-host siguen pendientes; INF-03 local no acredita recuperación ante pérdida del host. El check estándar del lote de valores conserva el bloqueo Turbopack `EPERM`; la alternativa webpack no lo sustituye. BE-04/FE-03 y su gate de valores siguen parciales. El dueño/coordinador confirma qué bloquea G1 antes de admitir a alguien.

No se crea URL, landing, cuenta beta, formulario, analytics ni infraestructura. No se envían mensajes, publican convocatorias, contactan tiendas, extraen listas, compran anuncios ni se recopilan contactos en Git. El reconocimiento sigue siendo experimental: DINOv2 puede fallar y requiere revisión humana. No prometer precisión, cámara universal ni precio argentino. Una foto/captura de consulta no debe persistirse; una foto diagnóstica o de investigación requiere consentimiento específico y el protocolo RES-02, y no es requisito de esta prueba. La API de consulta no almacena recortes. Los límites de pokemontcg.io rigen ese proveedor; este plan no introduce llamadas nuevas ni cambia colas, cachés o frecuencia.

## Reclutamiento como hipótesis

Objetivo de composición, sujeto a RES-01 y disponibilidad real: personas adultas en Argentina con experiencia reciente en una o más tareas de organizar colección, completar sets, separar duplicadas o preparar intercambio. Es una hipótesis de canal/segmento derivada de MKT-01, no un resultado de mercado. Buscar diversidad de experiencia y dispositivos; no afirmar representatividad ni completar cupos con perfiles inventados.

| Canal candidato | Hipótesis que se pone a prueba | Responsable por rol | Texto editable y autorización pendiente | Registro privado mínimo | Métrica |
|---|---|---|---|---|---|
| Referencias personales de coleccionistas | Una invitación individual puede llegar a alguien con una tarea reciente y contexto suficiente | Dueño o reclutador designado por el dueño | “Referencia individual” abajo; dueño aprueba canal, texto y envío antes de contactar | Código aleatorio, categoría del canal y estado; correspondencia persona↔código separada | Interesados / invitaciones únicas ofrecidas; activados / invitaciones únicas ofrecidas |
| Comunidades locales de coleccionismo/intercambio | Hay interés en probar organización de sets/duplicadas en un contexto real | Responsable de comunidad designado por el dueño | “Presentación por comunidad o espacio” abajo; pendiente permiso del responsable del grupo y autorización del dueño para publicación/contacto | Respuestas voluntarias y estados agregados; no copiar usuarios ni handles | Interesados / respuestas voluntarias únicas; activados / invitaciones individuales únicas ofrecidas tras esas respuestas, si se conocen |
| Tiendas, clubes o encuentros locales | Un referente puede presentar la invitación a personas adultas con experiencia pertinente | Enlace del dueño con el espacio, si este acepta | “Presentación por comunidad o espacio” abajo, adaptada a presentación individual; permiso del espacio y autorización del dueño pendientes para canal/envío | Código/categoría de canal; sin padrón del local en repo | Interesados / invitaciones únicas entregadas por el referente; activados / invitaciones únicas entregadas |

Estos canales son opciones para que el dueño elija y autorice. Una publicación no acredita cuántas personas recibieron una invitación: si ese denominador no es verificable, informar “no disponible”, respuestas y activados como conteos, sin usar vistas o miembros del grupo. Para atribución entre canales, conservar la primera invitación individual verificable como canal de origen y registrar exposición adicional aparte; no duplicar personas ni activaciones. La persona puede declinar sin seguimiento. Un “me interesa” solo permite ofrecer detalles por el canal habilitado; no acredita consentimiento de estudio ni permiso general de contacto. No se presume que haya comunidades, tiendas o permisos disponibles.

## Mensajes editables

Los textos se adaptan y aprueban antes de invitar. No incluyen URL ni fecha hasta que el dueño confirme entorno y cupo. No mandarlos desde esta preparación.

**Referencia individual**

> Hola. Estoy organizando una prueba pequeña de PokéScan, una app para consultar el catálogo Pokémon, revisar un reconocimiento visual experimental y guardar cartas en una colección. Buscamos personas adultas que hayan organizado, completado o intercambiado cartas hace poco. La sesión dura aproximadamente 45–60 minutos y usa una colección de prueba; no hace falta compartir tu inventario ni mostrar información privada. El reconocimiento puede equivocarse y se revisa antes de guardar. ¿Te interesaría recibir los detalles y decidir si querés participar? Decir que no no cambia nada. Si aceptás, te contamos antes qué datos se usan, cómo se guardan y cómo retirarte.

**Presentación por comunidad o espacio**

> Estamos preparando una prueba voluntaria y acotada de PokéScan para personas adultas que coleccionan cartas Pokémon. La sesión observará una tarea de organización con una colección de prueba; no es una venta ni una encuesta sobre precio. El reconocimiento visual es experimental, puede fallar y requiere revisión. No pedimos publicar colecciones, fotos ni datos de contacto en el grupo. Quien quiera recibir información puede responder por el canal que el responsable habilite, cuando confirme que la beta está operativa.

**Confirmación tras aceptación (en privado, solo después de gate y autorización)**

> Gracias. Antes de coordinar, te vamos a compartir el consentimiento, duración, dispositivo/entorno disponible, tratamiento de notas y forma de retirar tu participación. La sesión solo se agenda cuando confirmemos que el acceso funciona y haya un cupo. No necesitás enviar fotos ni datos de tu colección. ¿Preferís que te contactemos una vez para coordinar esta sesión? Los recordatorios son opcionales y se piden por separado.

## Consentimiento, contacto y minimización

Mantener tres decisiones independientes en el registro privado controlado por el dueño:

1. **Participación:** consentimiento informado para la observación RES-03, separado del consentimiento de entrevista RES-01 y del permiso para fotos/capturas RES-02. Se puede rechazar, saltear pasos o retirarse sin que la participación condicione las funciones básicas disponibles. El acceso del piloto sigue sujeto a la disponibilidad operativa comunicada; no garantizar acceso indefinido. No grabar audio, video o pantalla por defecto.
2. **Contacto de coordinación:** permiso opcional para usar un dato de contacto solo para acordar la sesión. Guardar correspondencia persona↔seudónimo en una ubicación privada con acceso restringido; no en Git ni en la tabla de métricas.
3. **Seguimiento y recordatorios:** autorizar por separado cada propósito, canal, plazo y cantidad máxima de mensajes. Para D28, proponer un único contacto después del cierre de la ventana para preguntar por uso anterior y su fecha, sin inducir una tarea. Un recordatorio de agenda, si se ofrece, es otra opción; nunca enviar recordatorios de tarea para cumplir D28. Si no hay permiso específico, no contactar para ese propósito. El retorno espontáneo y el provocado se informan separados.

Usar un código aleatorio privado por persona, no derivado de email o teléfono; `P01`–`P10` puede ser una etiqueta de presentación interna de RES-03, vinculada a ese código y con alcance de ronda. Reutilizar la correspondencia consentida si participa en RES-01 y RES-03 para evitar duplicar reclutamiento; no publicar códigos por persona en Git. Las notas individuales son **seudonimizadas**, porque existe una correspondencia privada; solo la síntesis agregada sin datos reidentificables puede llamarse anonimizada. En el repo registrar categoría de canal, etapa, conteos y faltantes; suprimir o agrupar celdas pequeñas y citas identificables.

Propuesta de retención por propósito, pendiente de aprobación/capacidad de borrado del dueño antes de iniciar:

- **Agenda solamente:** eliminar contacto/correspondencia de coordinación al cerrar la agenda o a los 30 días de la sesión, lo que ocurra primero. No usar ese permiso para seguimiento posterior.
- **Seguimiento RES-03 autorizado:** mantener solo el contacto/enlace necesario en registro privado separado hasta 30 días después del cierre del seguimiento, conforme RES-03; definir ese cierre al aprobar calendario y no prorrogarlo por falta de respuesta. Ese permiso permite atravesar la ventana [28,35), sin retener la agenda indefinidamente. Si la misma correspondencia sirve a dos propósitos consentidos, documentar ambos y eliminarla cuando termine el último plazo aplicable; no duplicar datos innecesarios.
- **Evidencia individual RES-03:** borrar notas/eventos como máximo a los 90 días desde la sesión inicial, nunca desde el cierre de la ronda. Si una persona participa también de RES-01, sus notas de entrevista tienen el plazo propio de ese consentimiento (90 días desde cierre de su ronda); no extender por ese motivo las notas de tarea RES-03.
- **Síntesis:** conservar solo agregados sin identificadores hasta 12 meses, revisando también backups. Ante retiro, detener nuevas mediciones/contactos y borrar evidencia/enlace cuando corresponda; registrar solo el cambio agregado de muestra que se pueda conservar. No prometer identificar y borrar aportes de una síntesis ya anonimizada. Explicar responsable, acceso y alcance real del borrado antes de obtener consentimiento.

**Texto base para consentimiento de uso; revisar y completar con el responsable antes de usar:**

> Te invitamos a una sesión de aproximadamente 45–60 minutos para observar cómo usás PokéScan al organizar 20 cartas en una colección de prueba y conocer tus comentarios. No evaluamos tus conocimientos. La app puede equivocarse al reconocer cartas y te pediremos revisar antes de guardar. Usaremos notas con un código, sin publicar tu nombre ni contacto. No necesitás mostrar tu colección, cuentas ni fotos personales. Podés no responder, pedir una pausa o terminar cuando quieras, sin que participar sea condición para usar las funciones básicas disponibles. La disponibilidad del piloto se explica aparte. El contacto para coordinar y cualquier recordatorio se autorizan por separado. La grabación no está prevista; si alguna vez se propusiera, pediríamos permiso aparte antes. ¿Aceptás participar y que usemos notas seudonimizadas para evaluar esta tarea? ¿Aceptás que te contactemos para coordinar esta sesión? Por separado, ¿autorizás un único contacto por [canal] después del cierre de tu ventana D28 para preguntar por uso anterior, hasta [fecha de cierre acordada]? [Un recordatorio de agenda, si se propone, lleva una decisión independiente. Registrar cada respuesta por separado y explicar responsable, acceso, retención y retiro antes de comenzar.]

## Capacidad, cohortes y regla de detención

La capacidad de inferencia y la operación **no están aprobadas para 20 sesiones simultáneas**. El objetivo 10–20 es acumulado, sujeto a los gates, y no equivale a concurrencia. Como propuesta conservadora pendiente del operador: abrir un primer lote de **2–3 participantes con sesiones secuenciales**; revisar disponibilidad y señales al terminarlo; luego admitir nuevas invitaciones en tandas pequeñas. No declarar este cupo como capacidad medida. El operador debe fijar por escrito concurrencia, horario atendido, umbrales de espera/errores y quién puede detener la ronda según INF-02 y recursos del host antes de invitar.

**Pausar admisiones y sesiones** ante readiness distinto de listo, worker DINOv2 no saludable, artefactos no disponibles, aumento sostenido de ocupación/latencia o fallos según umbrales que fije el operador, error de guardado/deduplicación, exposición de datos, pérdida de colección de prueba o imposibilidad de resolver una incidencia. No reanudar hasta investigar causa, documentar evidencia, confirmar recuperación y obtener decisión operativa. No probar fallos sobre datos personales ni sobre servicios compartidos. Mantener un contacto humano de soporte designado durante cada sesión; sin responsable, no abrir la sesión.

Los slots son voluntarios y reprogramables según disponibilidad aprobada; rechazar un horario no equivale a abandono de tarea ni a rechazo del estudio. No pedir nuevos permisos/datos humanos ya registrados: el dueño aplica las decisiones vigentes y completa solamente las entradas faltantes.

La secuencia para cada tanda es: aceptar consentimiento y asignar seudónimo; verificar prerequisitos y slot; congelar versión, commit más cambios locales, modelo/índice, dispositivo, SO, navegador, modo pestaña/PWA y red; probar acceso/cuenta de prueba y HTTPS; ejecutar RES-03 con lote físico preparado/etiquetado fuera del repositorio; registrar tiempos, ayudas, errores y guardado comprobado; revisar incidencias antes de confirmar la siguiente tanda. RES-03 pide 20 copias por participante, manifiesto privado con etiqueta manual independiente, comparación con método habitual cuando sea comparable, y sesión observada de 45–60 minutos. Si no hay lote o perfil disponible, informar faltante; no improvisar ni atribuir predicción como verdad de referencia.

## Medición manual y definiciones

Hasta resolver DEC-04, usar hoja privada mínima bajo custodia del responsable; no activar FE-05/BE-06 ni un proveedor de analytics. Los porcentajes siempre muestran numerador, denominador, ventana y faltantes. No subir a repo nombres, contactos, JWT, fotos/recortes, notas de colección, ID de carta/colección ni enlaces con token.

| Etapa | Definición y denominador |
|---|---|
| Invitación ofrecida | Invitación individual realmente presentada por canal autorizado; una persona una vez entre canales. No contar una publicación como personas invitadas si no se conoce su alcance individual |
| Interés | Persona que acepta recibir detalles; interesados / invitaciones únicas ofrecidas cuando ese denominador es conocido. No implica consentimiento de sesión/contacto; respuestas no observadas son faltantes |
| Consentimiento e inicio | Participación informada aceptada, permiso de contacto separado y slot voluntario. Reportar consentidos / interesados e iniciados / consentidos; no confundir agenda o ausencia con tarea empezada |
| Registro | Alta confirmada si hace falta cuenta nueva y se consiente el flujo habilitado; nuevas altas / consentidos que necesitaban alta. Registrar cuentas ya existentes aparte; no equivale a activación |
| Activación útil | Primera colección útil con al menos una copia confirmada y comprobada en destino, según RES-03. Activados únicos / invitaciones únicas ofrecidas, por canal si se conoce el denominador; además activados / participantes que iniciaron y, entre nuevas altas, activados / nuevas altas. Etiquetar activación del estudio; no mezclar con activación espontánea de clientes |
| Tarea RES-03 completada | Veinte copias correctas en identidad, variante, condición, cantidad y destino, sin ayuda; éxitos / participantes que comenzaron. Mantener asistencia, abandonos y censura por detención a 25 min por método en el denominador; no sustituir censura por tiempo de éxito. Mediana de ahorro solo de pares comparables, con n, orden de métodos, dispersión y faltantes |
| Retorno | Tarea útil distinta en [activatedAt + 28 días, activatedAt + 35 días), en UTC. Denominan activados con ventana terminada al corte T (activatedAt + 35 días ≤ T). Retornos espontáneos / elegibles; provocado aparte, inmaduros aparte. Declarar método observado/autorreporte/sin evidencia, faltantes y retiros; sin evidencia no prueba “no volvió” |
| Incidencia | Categoría, etapa, impacto, versión/entorno y estado, sin datos privados. Registrar intentos y fallos sin acreditarlos como éxitos si no hubo guardado confirmado y comprobado; separar reconocimiento, precio y escritura |

El seguimiento manual se pregunta después del cierre de la ventana y solo con contacto autorizado; no solicita ejecutar una tarea para cumplir la métrica. Reportar cohortes por método y sus limitaciones. Con R retornos espontáneos confirmados, U desconocidos y N elegibles, informar mínimo documentado R/N y rango posible R/N–(R+U)/N, manteniendo provocados y no retornos confirmados identificados en el agregado. Un retiro detiene rastreo y se refleja como cambio agregado de muestra cuando sea conservable, sin forzar identificación para completar N. La deduplicación manual usa el código privado por persona y la última resolución de cada operación de guardado; un reintento/reconciliación no suma otra activación. Ver una candidata, página o colección vacía no acredita activación ni retorno.

No hay cohortes automáticas: FE-05/BE-06 no existen como implementación aprobada. StrictMode, replay o más de un montaje no se cuentan como activaciones; el método manual valida una acción confirmada. La consulta de precios no debe disparar requests externos nuevos ni saltarse cola, caché o throttling.

## Handoffs y decisiones preparadas

- **Dueño/operador:** elegir canal y responsable por rol, autorizar cualquier contacto, aprobar consentimiento/retención, decidir host/dominio/horario y fijar capacidad inicial/umbrales de parada. Estas decisiones no las puede tomar el documento.
- **Coordinación/G1:** confirmar P0 y aceptación de gates de uso, build estándar y estado BE-04/FE-03 antes de abrir admisiones. El gate local de operación por sí solo no habilita tráfico público.
- **RES-01:** usar su guion de entrevista solo si se agenda descubrimiento independiente; mantener su meta 12–15 y no mezclar con activación RES-03. No volver a preguntar lo que una entrevista consentida ya cubrió.
- **RES-03:** ejecutar sesión observada, consentimiento propio, lote de 20 y ventana de retorno D28. Entregar resultados con denominadores; diez usuarios del protocolo son un objetivo de investigación, no la promesa de esta beta 10–20.
- **INF-02/03 y soporte:** verificar readiness, artefactos, HTTPS, recursos y recuperación del entorno elegido; asignar operador en la sesión. No hay host productivo ni restauración off-host aceptados.
- **FE-05/BE-06/DEC-04:** solo si luego se decide automatizar; resolver receptor, consentimiento, retención, deduplicación y prueba de no bloquear guardados. Esta preparación no instrumenta.

La hipótesis inicial de MKT-01 sobre coleccionistas de sets y duplicadas queda sin validar. Se preservan Free, exportación CSV e historial de cartas ya disponibles; no se los presenta como funciones futuras ni como evidencia de retención. La tarea puede informar necesidades, pero no fija Pro, precio, precisión, valor realizable o demanda.

## Cronograma relativo por gates

| Momento relativo | Acción condicionada | Salida para avanzar |
|---|---|---|
| Antes de admitir | Coordinador confirma G1/P0, build estándar exigido, entorno real accesible, responsable y umbrales operativos; dueño aprueba canal, texto y política de datos | Gate registrado por responsables; si falta una entrada, seguir solo con preparación documental |
| Después del go | Dueño designa un canal autorizado y ofrece invitaciones individuales; registra solo estado agregado en repo y custodia contacto aparte | Aceptaciones voluntarias, sin superar el cupo aprobado |
| Primera tanda | 2–3 sesiones secuenciales como propuesta sujeta a operador; pruebas y monitoreo humano | Incidencias revisadas y decisión explícita de pausar o abrir la tanda siguiente |
| Tandas siguientes | Repetir en grupos pequeños hasta objetivo acumulado 10–20 o hasta detener | Denominadores, abandonos, incidencias y cobertura por dispositivo al día |
| Ventana D28 por activación | Observar uso espontáneo en [activación +28 días, activación +35 días); cerrar por persona al +35, en UTC. Solo después, contacto autorizado sobre uso anterior | Reporte al corte T con elegibles (+35 ≤ T), inmaduros, provocado/espontáneo, faltantes, método y rango de desconocimiento |

Aunque la última tanda ocurra más tarde, el cierre no es un único “día 28” de la ronda: cada activación tiene su ventana y fecha mínima de cierre +35 días.

No se asignan fechas de calendario, uptime, URL, host, dominio ni disponibilidad hasta que sus responsables los elijan y prueben.

## Fuentes de entrada

- [Plan de lanzamiento](../README.md), [Marketing](../07-marketing.md) y [decisiones/contratos](../10-decisiones-y-contratos.md).
- [RES-01: guion y consentimiento de descubrimiento](RES-01-segmento.md) — reclutamiento por MKT-02, entrevistas/resultados pendientes.
- [RES-03: protocolo de tarea, consentimiento, métricas y retorno](RES-03-protocolo.md) — fase de protocolo lista, participantes/resultados pendientes.
- [MKT-01: copy y límites de promesa](MKT-01-copy.md) y [revisión](MKT-01-review.md) — posicionamiento de sets/duplicadas hipotético; Free/CSV/historial conservados.
- [INF-01: revisión de operación](INF-01-review.md) y [gate local](LOTE-OPERACION-validacion.md) — sin elección de host/dominio ni disponibilidad productiva.
- [Checklist vigente](../STATUS-CHECKLIST.md) — G1/beta pública y resultados con personas pendientes.
