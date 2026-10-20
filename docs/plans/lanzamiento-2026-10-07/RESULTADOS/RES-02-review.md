# RES-02 — Revisión documental del protocolo

Fecha: **2026-10-08**. Revisor/corrector: **GPT-6.1 Sol, esfuerzo high**, contexto separado de Luna. Alcance: protocolo y plantillas RES-02; sin código, corpus privado ni ejecución de inferencia. Resultado: **fase protocolo aceptada con correcciones**. RES-02 completo, corpus amplio y resultados permanecen pendientes; el gate integrado del lote de valores sigue abierto por Turbopack EPERM según [11-orquestacion](../11-orquestacion.md).

Se recibió la entrega Luna y se guardó baseline de sus tres archivos antes de editar. Leídos AGENTS raíz, [RES-02 del plan](../04-investigacion.md), README/convención de resultados, orquestación, DEC-03/04 y el [protocolo vigente](../../../evaluations/scanner-validation-protocol.md). El plan ya contiene el refinamiento Lyra y no pide otra optimización. La revisión contrastó las secciones relevantes del runner/métricas, embedding/lector/worker, servicio/controller/DTO, preparación cliente y consumidor/draft/guardado. El árbol tenía cambios locales previos: no se describe como clean ni se atribuyen esos cambios a esta revisión.

## Correcciones comprobadas por lectura de fuente

| Hallazgo recibido | Corrección en el protocolo y plantillas |
|---|---|
| Bytes únicos podían confundirse con fotos originales y se atribuía deduplicación a la CLI | La CLI cuenta filas de primera pasada y sólo informa hashes duplicados. Alias estable de original y grupo de transformaciones privados; selección previa por original y comparaciones pareadas. Las fotos existentes autorizadas sí pueden contar en el total; las ya usadas siguen en development. |
| Denominadores y fallos no tenían una regla suficiente | Tabla de seis métricas con numerador/denominador; referencias ausentes incluidas en accuracy, tasas n=0 null y solapamiento de condiciones. Un error aborta el runner antes de escribir reporte: incidentes/cobertura separados, sin exclusión silenciosa ni métricas completas fabricadas. |
| Familia holdout podía confundirse con exclusión del índice o negativo por referencia ausente | Partición de consultas por ID/reimpresión/arte/idioma y grupos negativos/derivados; no retirar referencias holdout del índice. Catálogo espejado e índice distinguibles; ID conocido sin referencia sigue positivo. Ambiguos no son ground truth y no entran al holdout. |
| Sellado omitía algunos caminos de tuning | Congelar selección de tomas, política, reintentos y reglas de exclusión antes de consultar holdout. Un holdout inspeccionado para tuning se consume; una reevaluación posterior no es independiente. |
| Política de sesión/guardado y falsa aceptación necesitaban precisión | #1 API entra como propuesta por revisar; guardado requiere identidad/variante/condición/destino confirmados. Falsa aceptación CLI es estimación sin rechazo calibrado. Controller omite IDs sin carta en PostgreSQL; runner no hace ese cruce, por lo que se documenta su límite. |
| Campos extra se describían como rechazados/soportados y plantilla podía parecer ejecutable | La CLI consume seis campos; extras tolerados no se validan ni se reportan. Defaults/compatibilidad explícitos. JSON público [] es placeholder no ejecutable; CSV lateral de 34 campos, cero filas, sin fotos/rutas/PII. |
| Snapshot y tiempos podían sobreinterpretarse | Ocho hashes de código/protocolo confirmados contra bytes actuales; modelHash, cadena preprocessingHash e indexVersion por inventario diferenciados. Límites de coordinatorMs/totalMs y precalentamiento API explícitos; modelo/índice actuales no hasheados ni inferidos desde reportes históricos. |
| Política de consentimiento/retención podía parecer ya acordada | Campos propuestos a acordar; reuso sólo dentro de permiso/retención vigentes. Material, custodio, dispositivos/presupuesto y resultados pendientes sin volver a pedir lo ya registrado por coordinación. |

Los hechos del runtime se cotejaron con [servicio](../../../../backend/src/modules/cards/visual-identify.service.ts), [worker](../../../../backend/scripts/scanner-visual-worker.mjs), [embedding](../../../../backend/scripts/scanner-visual-engine.mjs), [controller](../../../../backend/src/modules/cards/visual-identify.controller.ts) y [DTO](../../../../backend/src/modules/cards/dto/visual-identify.dto.ts): 6 MiB decodificados, 24 MP en worker, una inferencia por instancia/503, top-8, rotate/short256/center224/ImageNet/CLS384/L2 y hilos 2/1. La CLI comparte embedding pero no aplica el guard de entrada del endpoint ni reproduce frontend/HTTP. Son propiedades leídas del código; no pruebas ejecutadas en esta fase.

## Evidencia y verificación realizada

[Protocolo corregido](RES-02-corpus.md), [manifiesto público vacío](RES-02-manifiesto-publico-plantilla.json), [ficha privada vacía](RES-02-ficha-privada-plantilla.csv) y [evidencia JSON](RES-02-review-evidencia.json) forman la entrega. La evidencia registra hashes recibidos/finales, diff propio y snapshot selectivo de fuentes con comparación SHA-256 contra git HEAD, sin publicar contenido ajeno ni rutas privadas de corpus. HEAD observado: `5a2fe2f557b677b2c6e38749a1932d24a21b25c5`.

| Archivo recibido | SHA-256 antes de la revisión |
|---|---|
| RES-02-corpus.md | `f08bff608d7ddca42dfd34137f78122fe4afbcb47a24fa78ed1cbf78f81a52c6` |
| RES-02-manifiesto-publico-plantilla.json | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| RES-02-ficha-privada-plantilla.csv | `18a93f520f3ee0c4311e4eeb56c7043994f90d302e91723dabba8c3bf27db7fa` |

Se verificaron enlaces locales de los dos Markdown, estructura JSON vacía y CSV con 34 columnas únicas/cero filas; ocho hashes publicados contra el contenido actual; diff de los tres archivos recibidos (JSON sin cambio); y las identidades matemáticas de seis métricas por lectura del módulo. La revisión de privacidad de lo añadido no encontró fotos, hashes de imágenes, rutas privadas de corpus, filas de participantes, secretos ni datos de cuentas. Los hashes de fuentes/entregables no son hashes de fotos. Conteos exactos de enlaces y snapshot están en la evidencia.

No se ejecutaron suites, builds, --help, evaluator, inferencia, DB/Redis, servicios, navegador o proveedores; no se contactaron personas ni otros chats. Tampoco se inspeccionó el corpus privado/modelo/índice. No se afirma check global verde, precisión nueva, teléfonos probados ni latencias medidas. Esta revisión documental independiente no cierra IDs ni habilita otro lote de implementación.

## Handoff y recursos

El método queda listo para que coordinación registre la fase de protocolo revisada. La ejecución espera inventario consentido, etiquetas/grupos resueltos, holdout sellado y snapshot verificable; se entrega sólo al existir esas entradas. Si falta soporte para errores/metadata en la CLI, proponer una tarea acotada sin implementarla desde RES-02/protocolo.

Se liberan las reservas de RES-02-corpus.md, RES-02-manifiesto-publico-plantilla.json, RES-02-ficha-privada-plantilla.csv, esta revisión y su evidencia. No quedaron procesos ni servicios iniciados por este encargo. Registro/planes/ORQUESTACION-ESTADO.md permanecen a cargo exclusivo del coordinador.
