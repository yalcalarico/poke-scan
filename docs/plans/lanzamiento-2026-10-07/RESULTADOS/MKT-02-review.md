# MKT-02 — Revisión y correcciones Sol HIGH

Fecha: 2026-10-08 · Alcance exclusivo: `MKT-02-beta.md`, `MKT-02-evidencia.md`, este informe y `evidencia-mkt02-review/`. Sin cambios de producto, configuración, planes o registro.

## Dictamen y dependencia

**Criterios documentales de MKT-02 satisfechos después de corrección.** La logística, mensajes, roles, permisos pendientes, métrica por invitación y cronograma condicionado quedan preparados. No falta una entrada para aceptar este artefacto documental: RES-01/RES-03 aportan guion y protocolo, y MKT-01 aporta los límites de promesa. Reclutamiento real, participantes, despliegue y ejecución no se exigieron como criterios adicionales de un entregable que pide preparación y ejecución humana/autorizada después.

INF-02/03 y P0 son entradas expresamente requeridas **“para invitar a usar”** en [MKT-02 del plan](../07-marketing.md#mkt-02--preparar-reclutamiento-beta-acotado). Antes de esa ejecución, el dueño/coordinador debe confirmar G1/go de uso, host/dominio/HTTPS operativos, recuperación adecuada al entorno, operador/cupo/umbrales y canal/contacto consentidos. El gate técnico local no acredita disponibilidad pública, off-host, teléfonos físicos ni participantes. El bloqueo estándar Turbopack y gate de valores provienen de fuentes previas; este revisor no los reprodujo ni fija el resultado de su diagnóstico concurrente.

Se entrega **fase logística lista**. El coordinador decide el estado del ID conforme al alcance del plan y su instrucción de dejar pendiente ante dependencias ausentes; esta revisión no cambia estados ni habilita contacto externo. Ningún permiso se autovalida fuera del repositorio ni se repiten preguntas humanas ya registradas.

## Hallazgos y correcciones

| Recibido | Resultado corregido |
|---|---|
| Canales tenían métricas activados/aceptadas, sin la tasa requerida por invitación ni relación explícita mensaje/permiso en cada fila | Tres canales con hipótesis, texto editable vinculado, responsable por rol, autorización pendiente para canal/envío y activados/invitaciones únicas verificables. En comunidad se distingue publicación, respuesta e invitación individual; alcance desconocido queda no disponible. |
| Aceptación mezclaba interés en detalles y consentimiento de participación; registro ignoraba cuentas existentes | Ocho etapas reales: invitación, interés, consentimiento/inicio, registro, activación, tarea completa, retorno e incidencia. Alta nueva separada de cuenta existente y de acceso al piloto. |
| Activación y retorno podían tomarse como lectura/sesión; no detallaba censura y desconocimiento | Activación requiere copia confirmada en destino; veinte copias correctas es otro éxito. Asistencia/abandono/censura no salen del denominador. Tiempos comparables con n, orden y dispersión. Dedupe de persona/operación y acción confirmada, sin contar reintento, StrictMode, render o replay. |
| “Registrar intentos sin guardar como éxito” invertía el criterio | Registrar intentos y fallos sin acreditarlos como éxitos si no hubo guardado confirmado y comprobado. Precio, reconocimiento y escritura separados. |
| D28 parecía día 28 o uso anterior dentro de 28 días | Ventana exacta RES-03 [activación +28, activación +35), UTC; elegibles solo +35 ≤ corte. Cierre por persona, contacto después de ventana sobre uso anterior, espontáneo/provocado separados. Método observado/autorreporte/sin evidencia, mínimo R/N y rango R/N–(R+U)/N; ausencia de evidencia no demuestra ausencia de retorno. |
| Borrado de agenda al cierre/30 días impedía contactar tras D28; notas a 90 días desde cierre de ronda discrepaban de RES-03 | Agenda y seguimiento con propósito/consentimiento/plazo propios. Solo permiso de seguimiento permite guardar el enlace necesario hasta 30 días después del cierre del seguimiento, con fecha acordada sin extensión por no respuesta. Evidencia individual RES-03 máximo 90 días desde sesión; entrevista RES-01 conserva su política propia sin extender notas de tarea. |
| Notas se llamaban anonimizadas pese a correspondencia persona↔código; acceso parecía garantizado | Notas seudonimizadas y agregados anonimizados distinguidos. Retiro detiene medición/contacto y borra enlaces cuando corresponda, sin prometer identificar agregados anónimos. Slots voluntarios, funciones básicas no condicionadas a estudio y disponibilidad operativa del piloto comunicada. |
| Evidencia decía ocho etapas pero había siete | Recibido preservado con siete filas; corregido con ocho y conteo verificado. Once hashes selectivos de entrada cotejados; no se afirma invariancia total del workspace concurrente. |

## Aceptación del plan

| Criterio | Resultado documental |
|---|---|
| Planificar 10–20 y cupo compatible con inferencia | Cumple como objetivo acumulado, sin participantes inventados; primera tanda 2–3 secuenciales propuesta para operador, sin capacidad medida ni concurrencia aprobada. |
| Cada canal tiene hipótesis, mensaje, responsable y permiso pendiente | Cumple para referencias, comunidades y tiendas/clubes/encuentros; roles por designar y permisos externos no supuestos. |
| Métrica activados por invitación; invitación/registro/guardado distintos | Cumple, con denominador verificable por canal; comunidad sin alcance medido informa conteos/faltante. Interés y consentimiento tampoco equivalen a activación. |
| Feedback y expectativas | Cumple mediante sesión RES-03, lote 20 con etiqueta manual independiente, tiempos/ayudas/errores, manifiesto y notas privados; contacto/seguimiento opcionales y sin fotos requeridas. |
| Cronograma sin disponibilidad no probada | Cumple por go/G1/operabilidad y tandas; sin fecha/URL/uptime prometidos. D28 cierra +35 por persona elegible. |
| Mensajes copiables y logística, sin acción externa | Cumple: tres mensajes principales y consentimiento editable; sin envío/publicación, contacto, scrapeo, PII en Git, formularios, instrumentación o oferta Pro. |

La hipótesis de sets/duplicadas no se convierte en mercado validado; Free/CSV/historial existentes se preservan. No se acredita precisión DINOv2, cámara universal, precio argentino realizable, ganancia, capacidad ni retención real.

## Método y evidencia

Se leyó AGENTS raíz, README/07/10 (DEC-04/06), RES-01/03, MKT-01 copy/review, INF-01 review, gate operación y checklist. No hay AGENTS anidado bajo `docs`. Se preservó el dirty previo y ambos recibidos antes de editar. Los once hashes de la tabla de Luna coinciden con el baseline selectivo capturado por Sol HIGH; verificación de fuentes al finalizar declara cualquier cambio concurrente del coordinador, sin corregirlo ni bloquearlo.

- [Beta recibida](evidencia-mkt02-review/MKT-02-beta-recibido.md), [evidencia recibida](evidencia-mkt02-review/MKT-02-evidencia-recibido.md), [dirty previo](evidencia-mkt02-review/dirty-antes.txt) y [baseline](evidencia-mkt02-review/baseline.json).
- [Once hashes recibidos cotejados](evidencia-mkt02-review/hashes-recibidos-verificados.json), [fuentes al cierre](evidencia-mkt02-review/fuentes-verificadas.json), [validación estática](evidencia-mkt02-review/validacion.json), [diff exclusivo de los dos documentos](evidencia-mkt02-review/correcciones.diff) y [hashes finales](evidencia-mkt02-review/hashes-finales.json).
- [Logística corregida](MKT-02-beta.md), [evidencia actualizada](MKT-02-evidencia.md), [RES-03](RES-03-protocolo.md#seguimiento-y-cohorte-d28) y [política RES-03](RES-03-protocolo.md#consentimiento-acceso-y-retención-propuestos).

Resultado de la sonda estática: 28 enlaces locales/anchors válidos en los tres documentos, tres canales, ocho etapas y cinco momentos; once hashes recibidos coincidentes y doce archivos finales en el manifiesto (sin auto-hash del manifiesto). La validación es lectura local, correspondencia de criterios, enlaces/anchors, tablas, hashes y diff. No ejecutó tests/build/check global, stack, HTTP/API, navegador, DB/Redis/Docker, inferencia ni benchmark. No afirma `pnpm run check` verde. BUILD-GATE y SEO conservan sus reservas independientes; esta revisión no exigió configuración/output invariantes ni adquirió recursos operativos. **Reserva documental liberada al entregar.**
