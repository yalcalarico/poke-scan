# DEC-04 — Método elegido para la primera ronda

11/10/2026 · root, por autorización del usuario para resolver este paso. **Decisión técnica: observación manual con tabla privada para el primer piloto.** No se inicia el estudio ni una implementación. Estado del plan:18/38 completos,20pendientes; una decisión de coordinación no agrega un ID de área.

## Elección y fundamento

El [protocolo RES-03](RES-03-protocolo.md#dec-04-método-mínimo-y-diccionario-propuesto) propone este método y permite la sesión observada sin FE-05. [MKT-02](MKT-02-beta.md#medición-manual-y-definiciones) y los [briefs SEO](SEO-03-contenido.md) ya lo consumen. Se conserva ese trabajo; no se vuelve a preparar el protocolo.

| Opción | Decisión para esta ronda |
|---|---|
| Observación manual y tabla privada existente | Elegida: permite medir finalización, tiempos, errores y comprensión con los criterios ya definidos. |
| Receptor propio de eventos | Diferido: requiere implementación, acceso, almacenamiento y entrega/deduplicación de eventos antes de afirmar cohortes automáticas. |
| Herramienta de analytics existente | No seleccionada: no hay un servicio acordado en las entradas revisadas. No se contrata ni instala uno por defecto. |

No se cuantifican costes ni resultados inexistentes. La medición manual no acredita actividad que el investigador no observó ni un retorno que el participante no confirmó.

## Contrato de medición de esta ronda

- **Esquema:** reutilizar las tablas privadas Participación, Sesión, Comparación, Revisión del lote, Comprensión, Dispositivos y Cohorte de RES-03. Seudónimo por persona; contactos/correspondencia separados. No crear tablas pobladas ni trasladar datos personales al repositorio.
- **Hechos y conteos:** una alta confirmada no equivale a activación. Activación requiere una copia persistida y comprobada; éxito del estudio requiere20copias correctas. Reconciliar un guardado cuenta la última resolución de la misma operación. 503/cancelación/lectura vieja no cuentan como reconocimiento exitoso; asistencia, abandono, incertidumbre y faltantes se informan.
- **Retorno:** ventana UTC `[activatedAt+28d, activatedAt+35d)`; sólo cohortes maduras al corte. Separar espontáneo/provocado y observado/autorreporte/sin evidencia. Con R retornos, U desconocidos y N elegibles, informar R/N y rango R/N–(R+U)/N según el protocolo, sin ocultar faltantes.
- **Entorno y consulta reproducible:** registrar versión/árbol, dispositivo, método y fecha de corte. La salida futura es `RES-03-resultados.md`, filtrada por método/entorno/cohorte y con numeradores, denominadores y límites. Hoy no hay registros, resultados ni un reporte ejecutado.
- **Acceso, responsable y retención:** dueño/investigador designado custodia la tabla fuera de Git, como propone RES-03. Persona concreta, ubicación, consentimiento y plazos siguen pendientes de confirmación antes de recolectar. Las propuestas90días/30días después del seguimiento/12meses del protocolo **no se convierten en política aprobada** por este paso. No se elige un proveedor de almacenamiento.
- **Gates de uso:** participantes, canal/contacto autorizado, operador y entorno/HTTPS conservan sus entradas registradas. Elegir método no habilita invitaciones ni seguimiento automático.

## Alcance de las siguientes tareas

**FE-05:** instrumentación automática diferida para esta ronda; ID pendiente, no completado ni cancelado. La sesión manual no depende de su implementación. Antes de automatizar se reabre la elección de receptor y se acuerdan seudónimo, consentimiento, acceso/retención y entrega fiable; se reutiliza el diccionario RES-03.

**BE-06:** próximo paso técnico disponible, sólo métricas operativas agregadas: separar solicitudes HTTP de inferencias, 503ocupado de indisponibilidad/otros fallos; duraciones HTTP/inferencia/carga fría; cola pendiente/en proceso, edad/reintentos y degradación Redis. Sin receptor de eventos de participantes. El backend ya ofrece readiness/busy y `pendingCount()`, pero eso no demuestra BE-06 completa. La implementación deberá definir alcance temporal/reset de contadores, consulta agregada acotada, acceso privado y fallos de medición que no bloqueen la API; sin cuerpos, IDs, fotos, emails, JWT, notas ni rutas/queries dinámicas como etiquetas. No se añade almacenamiento persistente o servicio externo sin decisión específica.

**INF-04:** alertas/alojamiento quedan para su tarea después de señales BE-06 verificadas. No se fijan umbrales ni un operador ficticio.

## Verificación y continuidad

Revisión directa proporcional: coherencia con RES-03/MKT-02, trazabilidad/enlaces, conteos y preservación de producto/inputs. No se ejecutan tests/builds ni se detiene la instancia local por una decisión documental. No se cambia DB/Redis, automatización o configuración global. Cero encargos delegados.

Por pedido explícito del usuario, al terminar cada paso root entrega el resultado, identifica el siguiente y pregunta si desea avanzar. **BE-06 no empieza hasta esa respuesta.** La automatización existente permanece PAUSED con cadencia de dos horas.
