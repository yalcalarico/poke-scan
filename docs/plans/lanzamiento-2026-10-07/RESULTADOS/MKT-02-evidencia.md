# MKT-02 — Evidencia documental

Fecha: 2026-10-08 · Alcance: preparación de [logística beta](MKT-02-beta.md), revisada/corregida por Sol HIGH con [dictamen y evidencia](MKT-02-review.md). No se editó el registro, checklist, planes, producto o runtime. No se contactó, invitó ni reclutó a personas; no se copiaron contactos.

## Entradas y baseline

Las fuentes fueron inspeccionadas en el árbol local con cambios preexistentes. El estado inicial contiene numerosas modificaciones en frontend, backend, evaluaciones e infraestructura, además de `docs/plans/lanzamiento-2026-10-07/` sin seguimiento; no hubo checkout ni limpieza. Luna escribió los dos archivos MKT-02; Sol HIGH corrigió esos archivos y creó su informe/evidencia propia. La tabla conserva los once hashes de entrada de Luna, cotejados y coincidentes con el baseline de revisión Sol HIGH. Es un control selectivo, no una afirmación sobre todo el repositorio ni sobre cambios autorizados concurrentes del coordinador:

| Fuente | SHA-256 al inicio |
|---|---|
| `AGENTS.md` | `0a44196ce9194cafcd54094af02e90e73f0da0f693604d0876d97bf14ee30688` |
| `README.md` | `24ec5dee918d19778b3a7bfd4187fecf1eff2e2f855ffdd2a26ed0843fc1eced` |
| `07-marketing.md` | `d0b3969a57591fce77ae860a5e8a86f0482b55f5f1cb24073ea40b6ac4c8718f` |
| `10-decisiones-y-contratos.md` | `a1334c37eab2be2893cfdba65f2e294eaa8c2f5820950a9e572c999c50a71b3c` |
| `RES-01-segmento.md` | `c8e1e8d4651a190bc609028aec053d16902be089341e201797e5aeb82f42b5fc` |
| `RES-03-protocolo.md` | `2595f9aa242d8faaf43575ef6273888db3df7a13a1b2063f17bdcec2e8928c57` |
| `MKT-01-copy.md` | `d12287eb65d1feff484201f069f518018ad79e543d3832d440dc9bab55157f6d` |
| `MKT-01-review.md` | `905a34f980c40aa245d6019cc2936a9898ae491057d7032970145521aa828d4c` |
| `INF-01-review.md` | `9f1221fec14197d6037000f681b81bc85a6ebad423a50635c021cbb9fceaa952` |
| `LOTE-OPERACION-validacion.md` | `71a494fed487f7ae838f36c853ab6812f7cc33adb2f56e4d5942f5c42d470412` |
| `STATUS-CHECKLIST.md` | `9050995a47da9361786c7a5cc066a1cbd10eb29aa27f9e17771ceaf073e332f1` |

La entrada real de RES-01 se llama `RES-01-segmento.md`; no se encontró `RES-01-protocolo.md`. Contiene protocolo, entrevista, consentimiento y límites. RES-03 existe como `RES-03-protocolo.md`.

## Contraste de aceptación y límites

- **Objetivo 10–20 y canales/mensajes:** cubiertos como objetivo acumulado e hipótesis de tres canales; cada fila vincula mensaje, rol y autorización pendiente de canal/envío. Se informa activados por invitación individual verificable; alcance desconocido de una publicación no se inventa.
- **Invitación vs interés vs consentimiento vs registro vs activación:** ocho etapas distinguidas; alta nueva separada de cuenta existente, guardado comprobado separado de lectura/candidata y tarea completa de 20 copias separada de activación. Denominadores conservan abandonos, asistencia y censura. D28 usa [28,35), UTC y elegibilidad al +35 por persona; método, provocados, faltantes y rango de desconocimiento explícitos. No se afirma instrumentación FE-05/BE-06 ni cohortes automáticas.
- **Descubrimiento vs prueba de uso:** RES-01 conserva muestra/guion de entrevista; RES-03 conserva lote observado de 20 copias, criterios, consentimiento, dispositivos y retorno. La participación cruzada no duplica entrevistas ni mezcla resultados.
- **Privacidad:** participación, coordinación y seguimiento separados por propósito/consentimiento; plazo de agenda no se extiende automáticamente para D28. RES-03 conserva contacto autorizado hasta 30 días después del cierre de seguimiento y evidencia individual como máximo 90 días desde sesión inicial. Notas seudonimizadas distinguidas de síntesis anonimizada; contactos fuera del repo. Foto diagnóstica fuera de scope y sin persistencia de fotos de consulta.
- **Capacidad/gates:** primera tanda 2–3 sesiones secuenciales es propuesta no medida, pendiente de aprobación del operador. Se incorporaron gates P0/G1, host/domain, build estándar, readiness/artefactos y reglas para pausar.
- **Promesa de producto:** MKT-01 sigue hipótesis; DINOv2 es experimental/fallable; Free, CSV e historial existentes se conservan; no se promete mercado local, precio realizable ni precisión.
- **Cronograma:** relativo a gates y madurez +35 de cada ventana D28, sin fecha, uptime ni host/dominio inventados. Slots voluntarios, sin garantía de acceso indefinido.

La comprobación de enlaces y anchors de los artefactos finales, tablas y consistencia con RES-03 queda en [validación Sol HIGH](evidencia-mkt02-review/validacion.json). Conteo estructural final: tres tablas en el plan (tres filas de canales, ocho etapas métricas y cinco momentos del cronograma) y una tabla de once hashes en esta evidencia; tres mensajes principales editables y un texto base de consentimiento. El recibido tenía siete etapas, aunque su evidencia declaraba ocho; la revisión agregó consentimiento/inicio y verificó el conteo real. No se guardaron guiones de contactos con PII ni hojas de participantes.

No se ejecutaron tests, builds, aplicación, API, navegador, DB, Redis, Docker, inferencia ni benchmark: no corresponden a esta preparación documental y no se afirma `pnpm run check` verde. La revisión Sol HIGH acepta los criterios documentales de logística; no quedan entradas faltantes para ese artefacto. INF-02/03/P0, host/HTTPS operativo y G1 condicionan invitar a usar, no preparar mensajes. La ejecución humana/autorizada es posterior; no se exige reclutamiento real como criterio extra del plan. Estado del ID y gates bajo responsabilidad del coordinador, único escritor de registro/planes.
