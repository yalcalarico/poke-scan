# Planes de lanzamiento y delegación — PokéScan

Preparados el **7 de octubre de 2026**. Planes centralizados y ejecución por lotes: backend y frontend cerrados localmente; operación e investigación con participantes siguen pendientes. Carpeta central: `docs/plans/lanzamiento-2026-10-07/`.

Los planes aprovechan la app actual y separan responsabilidades para un desarrollador independiente. Hay **8 planes de área y 38 tareas**, con prioridad, estimación orientativa, dependencias, aceptación y entregables. Cada plan incluye un prompt refinado con Lyra para delegar un ID concreto.

## Índice

| Documento | Responsable sugerido | Resultado propio |
|---|---|---|
| [01 · Frontend](01-frontend.md) | Codex | Flujos, estado, cliente HTTP e incorporación de copy validado |
| [02 · Backend](02-backend.md) | Codex | Integridad, contratos, privacidad, datos y permisos |
| [03 · UI/UX](03-ui-ux.md) | Agente especializado en UI | Especificaciones de interacción y estados sobre el design system actual |
| [04 · Investigación](04-investigacion.md) | ChatGPT + evaluador local | Protocolos, usuarios, corpus, mercado y fuentes |
| [05 · Infraestructura](05-infraestructura.md) | Codex / responsable de operación | Runtime, artefactos, backup/restore y operación |
| [06 · SEO](06-seo.md) | Especialista SEO + Codex | Indexación, metadata y descubrimiento público |
| [07 · Marketing](07-marketing.md) | ChatGPT / especialista de marketing | Posicionamiento, copy y preparación de adquisición/retención |
| [08 · Negocio y monetización](08-negocio-monetizacion.md) | ChatGPT + dueño | Oferta, escenarios económicos y requisitos de piloto pago |
| [09 · Coordinación y roadmap](09-coordinacion-roadmap.md) | Dueño / coordinador | Orden de ejecución, capacidad, gates y entrega entre áreas |
| [10 · Decisiones y contratos](10-decisiones-y-contratos.md) | Responsables indicados por decisión | Resolver entradas ambiguas sin ampliar el scope |
| [11 · Orquestación](11-orquestacion.md) | Coordinador de este chat | Despacho por dependencias, revisión y continuidad |
| [Registro de tareas](REGISTRO-TAREAS.md) | Coordinador | Estado de los 38 IDs, fases entregadas y dependencias |
| [Resultados](RESULTADOS/README.md) | Responsable de cada ID | Convención de evidencias, entregas documentales y cierre |

## Qué se conserva y qué se corrige

La lectura estática del repositorio confirma búsqueda por número/artista, orden por precio, filtro de intercambio, CSV, progreso de sets e historial básico del portafolio. No se encargan como funciones nuevas. DINOv2 y el rediseño activo se conservan.

Las primeras brechas son guardar variantes/condiciones desde el escáner, verificar reintentos de operaciones aditivas, limitar datos de compartir y cumplir vencimiento/revocación con ambas cachés, y hacer reproducible el runtime y la recuperación de datos. Los informes locales del 6/10 son evidencia histórica con su entorno y muestra; no acreditan dispositivos físicos, despliegue ni precisión universal.

`pokemontcg.io` abastece el catálogo espejado; el código actual de precios usa TCGdex y referencias TCGplayer. El límite 1.000/día y 30/min corresponde a pokemontcg.io: no se atribuye automáticamente a otra fuente. Cola, throttling y cachés siguen siendo restricciones del proyecto; cualquier cambio de proveedor requiere verificar límites y licencias.

El precio convertido a ARS sigue siendo referencia internacional. Condición no ajusta el valor automáticamente; las observaciones históricas no son retorno de inversión. La oferta Pro y las cuotas son hipótesis. No se retirarán prestaciones Free existentes por defecto.

## Cómo delegar

1. Leé [coordinación](09-coordinacion-roadmap.md) y elegí un ID del [registro](REGISTRO-TAREAS.md).
2. Verificá sus entradas. Una dependencia de **protocolo/borrador** requiere ese artefacto, no terminar toda la tarea que lo contiene. Preparación independiente puede empezar ahora.
3. Copiá el prompt Lyra del área y sustituí `[ID_DE_TAREA]`. Entregá también los contratos, archivos y evidencia de entrada. Un encargo contiene un ID; no “todo el frontend”.
4. El ejecutor trabaja dentro del scope y entrega evidencia. Si detecta necesidad de otra área, produce un handoff con archivo, contrato y aceptación; no expande silenciosamente su tarea.
5. El coordinador actualiza registro y gate después de revisar la aceptación. Una tarea sin usuarios, datos, acceso o decisión comercial entrega preparación y registra lo pendiente; no inventa resultados.

Estados: **Pendiente**, **En preparación**, **En ejecución**, **Bloqueada por entrada**, **En revisión**, **Completada**, **Descartada con motivo**, **Condicionado a validación**. Los estados iniciales son de planificación. Una estimación no es compromiso ni incluye automáticamente esperas de reclutamiento/renovación.

## Prioridades y condiciones de salida

- **P0:** integridad, privacidad y operación que deben resolverse antes de exponer el piloto. Los protocolos P0 pueden prepararse junto al trabajo técnico.
- **P1:** confianza en datos, recuperación de cuenta, validación real, medición y comunicación correcta antes de ampliar la beta.
- **P2:** descubrimiento orgánico, experimentos de crecimiento y Pro condicionado a evidencia.

Los gates del roadmap requieren evidencia concreta. Pro no comienza por llegar a una fecha. Marketplace transaccional queda fuera de estos planes; sus etapas y evidencia futura están en coordinación.

## Relación con documentación anterior

| Documento previo | Tratamiento |
|---|---|
| [Plan frontend anterior](../01-frontend-product.md) | Referencia histórica; esta carpeta manda para los nuevos encargos de lanzamiento. No ejecutar pendientes sin verificar si ya existen. |
| [Plan backend anterior](../02-backend-production.md) | Recuperar contexto útil; tareas vigentes se organizan ahora por área. No interpretar el plan como autorización de despliegue. |
| [Mejoras del escáner](../scanner-improvements.md) | Conservar evidencias, protocolos y pendientes DINOv2 actuales. OCR/ORB históricos no vuelven a entrar en ejecución. |
| [Protocolo de evaluación](../../evaluations/scanner-validation-protocol.md) | Reutilizar y extender mediante RES-02; no reconstruir herramientas ni sobrescribir evaluación local ajena. |

No se borraron ni reescribieron planes anteriores. Hay cambios locales previos en código y evaluaciones: cada ejecución deberá inspeccionarlos antes de modificar archivos.

## Verificación

Esta entrega se valida como documentación: enlaces locales, IDs, cobertura de áreas, fronteras y dependencias. No se ejecutó `pnpm run check` como parte de la preparación de planes y no se afirma una implementación verificada. Para futuros cambios de código rigen AGENTS.md, `pnpm run stop` antes de tests y `pnpm run check`; cambios de datos requieren además probar el flujo real en entorno aislado.

La ejecución coordinada exige [validación al cerrar cada lote](11-orquestacion.md): revisión y regresiones enfocadas por tarea; revisión de integración, check global en verde y flujo real aislado cuando afecta datos al **terminar el lote**, antes de habilitar el siguiente. Contrato y consumidor se validan juntos. Las pruebas físicas y con usuarios conservan sus gates propios.

Estado vigente: [checklist por plan y pendientes](STATUS-CHECKLIST.md). Evidencia: [lote backend](RESULTADOS/LOTE-BACKEND-validacion.md) y [lote frontend](RESULTADOS/LOTE-FRONTEND-validacion.md).
