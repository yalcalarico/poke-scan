# MKT-02 — Preparación logística de beta acotada

Fecha: 2026-10-08 · Estado: **preparación documental lista para revisión; reclutamiento y uso de la beta no habilitados**.

## Propósito y límites

Preparar una ruta para invitar a **10–20 participantes** adultos como objetivo de planificación, sin asumir que ya existen, que aceptaron o que la capacidad técnica alcanza para recibirlos. Esta es una beta de uso del producto según RES-03. No reemplaza las 12–15 entrevistas de descubrimiento de RES-01: son actividades, consentimientos, denominadores y resultados distintos. Una persona puede participar en ambas solo si se la recluta una vez y acepta por separado cada actividad; no repetir la entrevista para completar los dos objetivos.

La secuencia depende de G1 y de un go operativo explícito del responsable: P0/privacidad, versión FE-01/FE-02 integrada, INF-02 habilitado con DINOv2 y artefactos válidos, acceso HTTPS en el entorno elegido, cuentas y colecciones aisladas, soporte/incidencias y capacidad del operador. El gate de operación local aprobado no es despliegue ni disponibilidad pública. Host, dominio, presupuesto y destino off-host siguen pendientes; INF-03 local no acredita recuperación ante pérdida del host. El check estándar del lote de valores conserva el bloqueo Turbopack `EPERM`; la alternativa webpack no lo sustituye. BE-04/FE-03 y su gate de valores siguen parciales. El dueño/coordinador confirma qué bloquea G1 antes de admitir a alguien.

No se crea URL, landing, cuenta beta, formulario, analytics ni infraestructura. No se envían mensajes, publican convocatorias, contactan tiendas, extraen listas, compran anuncios ni se recopilan contactos en Git. El reconocimiento sigue siendo experimental: DINOv2 puede fallar y requiere revisión humana. No prometer precisión, cámara universal ni precio argentino. Una foto/captura de consulta no debe persistirse; una foto diagnóstica o de investigación requiere consentimiento específico y el protocolo RES-02, y no es requisito de esta prueba. La API de consulta no almacena recortes. Los límites de pokemontcg.io rigen ese proveedor; este plan no introduce llamadas nuevas ni cambia colas, cachés o frecuencia.

## Reclutamiento como hipótesis

Objetivo de composición, sujeto a RES-01 y disponibilidad real: personas adultas en Argentina con experiencia reciente en una o más tareas de organizar colección, completar sets, separar duplicadas o preparar intercambio. Es una hipótesis de canal/segmento derivada de MKT-01, no un resultado de mercado. Buscar diversidad de experiencia y dispositivos; no afirmar representatividad ni completar cupos con perfiles inventados.

| Canal candidato | Hipótesis que se pone a prueba | Responsable por rol | Registro privado mínimo | Métrica |
|---|---|---|---|---|
| Referencias personales de coleccionistas | Una invitación individual puede llegar a alguien con una tarea reciente y contexto suficiente | Dueño o reclutador designado por el dueño | Código aleatorio, categoría del canal y estado; lista persona↔código separada | Invitaciones aceptadas / invitaciones efectivamente ofrecidas; activados / aceptadas |
| Comunidades locales de coleccionismo/intercambio | Hay interés en probar organización de sets/duplicadas en un contexto real | Responsable de comunidad autorizado por el dueño | Solo conteo agregado de respuestas por publicación autorizada; no copiar usuarios ni handles | Respuestas voluntarias que aceptan / respuestas recibidas; activados / aceptadas |
| Tiendas, clubes o encuentros locales | Un referente puede presentar la invitación a personas adultas con experiencia pertinente | Enlace del dueño con el espacio, si este acepta | Código/categoría de canal; sin padrón del local en repo | Invitaciones aceptadas / invitaciones entregadas por el referente; activados / aceptadas |

Estos canales son opciones para que el dueño elija y autorice. La persona puede declinar sin seguimiento. No se presume que haya comunidades, tiendas o permisos disponibles.

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

1. **Participación:** consentimiento informado para la observación RES-03, separado del consentimiento de entrevista RES-01 y del permiso para fotos/capturas RES-02. Se puede rechazar, saltear pasos o retirarse sin perder acceso. No grabar audio, video o pantalla por defecto.
2. **Contacto de coordinación:** permiso opcional para usar un dato de contacto solo para acordar la sesión. Guardar correspondencia persona↔seudónimo en una ubicación privada con acceso restringido; no en Git ni en la tabla de métricas.
3. **Recordatorio/seguimiento:** pedir autorización por separado, especificar el propósito y la cantidad de mensajes antes de enviarlos. El seguimiento D28 de RES-03 se registra como retorno espontáneo o provocado; un recordatorio no cuenta como retorno espontáneo. Si no hay autorización, no enviar recordatorio.

Usar seudónimos aleatorios (por ejemplo `P01`–`P10` solo dentro de una ronda) y no derivarlos de email o teléfono. En la tabla agregada del repo registrar únicamente canal por categoría, etapa, conteos y faltantes; suprimir celdas pequeñas que puedan reidentificar. Propuesta pendiente de aprobación del dueño: eliminar contacto y correspondencia al cerrar agenda o a los 30 días de la sesión, lo que ocurra primero; borrar notas individuales consentidas a los 90 días del cierre de la ronda y conservar solo síntesis agregada sin identificadores hasta 12 meses, siguiendo RES-01/RES-03 y verificando copias de respaldo. Definir responsable y capacidad de borrado antes de iniciar; un retiro detiene el uso y dispara borrado de notas/contacto cuando sea posible.

**Texto base para consentimiento de uso; revisar y completar con el responsable antes de usar:**

> Te invitamos a una sesión de aproximadamente 45–60 minutos para observar cómo usás PokéScan al organizar 20 cartas en una colección de prueba y conocer tus comentarios. No evaluamos tus conocimientos. La app puede equivocarse al reconocer cartas y te pediremos revisar antes de guardar. Usaremos notas con un código, sin publicar tu nombre ni contacto. No necesitás mostrar tu colección, cuentas ni fotos personales. Podés no responder, pedir una pausa o terminar cuando quieras, sin afectar tu acceso. El contacto para coordinar y cualquier recordatorio se autorizan por separado. La grabación no está prevista; si alguna vez se propusiera, pediríamos permiso aparte antes. ¿Aceptás participar y que usemos notas anonimizadas para evaluar esta tarea? ¿Aceptás que te contactemos para coordinar esta sesión? ¿Querés autorizar por separado un recordatorio de seguimiento? [Registrar cada respuesta por separado y explicar responsable, acceso, retención y retiro antes de comenzar.]

## Capacidad, cohortes y regla de detención

La capacidad de inferencia y la operación **no están aprobadas para 20 sesiones simultáneas**. El objetivo 10–20 es acumulado, sujeto a los gates, y no equivale a concurrencia. Como propuesta conservadora pendiente del operador: abrir un primer lote de **2–3 participantes con sesiones secuenciales**; revisar disponibilidad y señales al terminarlo; luego admitir nuevas invitaciones en tandas pequeñas. No declarar este cupo como capacidad medida. El operador debe fijar por escrito concurrencia, horario atendido, umbrales de espera/errores y quién puede detener la ronda según INF-02 y recursos del host antes de invitar.

**Pausar admisiones y sesiones** ante readiness distinto de listo, worker DINOv2 no saludable, artefactos no disponibles, aumento sostenido de ocupación/latencia o fallos según umbrales que fije el operador, error de guardado/deduplicación, exposición de datos, pérdida de colección de prueba o imposibilidad de resolver una incidencia. No reanudar hasta investigar causa, documentar evidencia, confirmar recuperación y obtener decisión operativa. No probar fallos sobre datos personales ni sobre servicios compartidos. Mantener un contacto humano de soporte designado durante cada sesión; sin responsable, no abrir la sesión.

La secuencia para cada tanda es: aceptar consentimiento y asignar seudónimo; verificar prerequisitos y slot; congelar versión, commit más cambios locales, modelo/índice, dispositivo, SO, navegador, modo pestaña/PWA y red; probar acceso/cuenta de prueba y HTTPS; ejecutar RES-03 con lote físico preparado/etiquetado fuera del repositorio; registrar tiempos, ayudas, errores y guardado comprobado; revisar incidencias antes de confirmar la siguiente tanda. RES-03 pide 20 copias por participante, manifiesto privado con etiqueta manual independiente, comparación con método habitual cuando sea comparable, y sesión observada de 45–60 minutos. Si no hay lote o perfil disponible, informar faltante; no improvisar ni atribuir predicción como verdad de referencia.

## Medición manual y definiciones

Hasta resolver DEC-04, usar hoja privada mínima bajo custodia del responsable; no activar FE-05/BE-06 ni un proveedor de analytics. Los porcentajes siempre muestran numerador, denominador, ventana y faltantes. No subir a repo nombres, contactos, JWT, fotos/recortes, notas de colección, ID de carta/colección ni enlaces con token.

| Etapa | Definición y denominador |
|---|---|
| Invitación ofrecida | Una invitación realmente presentada por un canal autorizado; contar cada persona una vez, sin duplicar contactos entre canales |
| Aceptación | Persona que acepta recibir detalles/participar; reportar aceptadas / invitaciones ofrecidas. No contar respuestas no observadas como rechazo ni como aceptación |
| Registro | Cuenta creada, si el participante consiente y el flujo ya está habilitado; reportar registros / aceptadas. No equivale a activación |
| Activación útil | Primera colección de prueba con al menos una copia confirmada y comprobada en destino (definición RES-03). Reportar activados / invitaciones aceptadas con sesión iniciada y / registrados por separado |
| Tarea RES-03 completada | Las 20 copias correctas en identidad, variante, condición, cantidad y destino, sin ayuda; reportar éxitos / participantes que comenzaron y conservar abandonos/asistencia en el denominador |
| Retorno | Tarea útil posterior dentro de D28 desde activación, indicando si fue espontánea o provocada; reportar retornos espontáneos / activados con ventana D28 madura. Los no maduros se listan aparte, sin tratarlos como no retornos |
| Incidencia | Categoría, etapa, impacto, versión/entorno y estado; sin datos privados. Registrar intentos sin guardar como éxito y fallos de precio/reconocimiento separados |

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
| D28 desde cada activación | Cerrar ventana de retorno de cada participante; respetar retiro/contacto autorizado | Reporte RES-03 con cohortes maduras, faltantes y método manual declarado |

No se asignan fechas de calendario, uptime, URL, host, dominio ni disponibilidad hasta que sus responsables los elijan y prueben.

## Fuentes de entrada

- [Plan de lanzamiento](../README.md), [Marketing](../07-marketing.md) y [decisiones/contratos](../10-decisiones-y-contratos.md).
- [RES-01: guion y consentimiento de descubrimiento](RES-01-segmento.md) — reclutamiento por MKT-02, entrevistas/resultados pendientes.
- [RES-03: protocolo de tarea, consentimiento, métricas y retorno](RES-03-protocolo.md) — fase de protocolo lista, participantes/resultados pendientes.
- [MKT-01: copy y límites de promesa](MKT-01-copy.md) y [revisión](MKT-01-review.md) — posicionamiento de sets/duplicadas hipotético; Free/CSV/historial conservados.
- [INF-01: revisión de operación](INF-01-review.md) y [gate local](LOTE-OPERACION-validacion.md) — sin elección de host/dominio ni disponibilidad productiva.
- [Checklist vigente](../STATUS-CHECKLIST.md) — G1/beta pública y resultados con personas pendientes.
