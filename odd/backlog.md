# Backlog conciliado de PokéScan

Corte documental: 27/10/2026. Es el índice de pendientes para ODD, **no una orden
para implementarlos**. Cada feature nueva se define desde el pedido humano antes
de trabajar. No se inventan specs ni se vuelven a abrir entregas por esta migración.

## Lanzamiento: 18 IDs abiertos, 20 cerrados

Los cierres y los 38 IDs se preservan en el [registro histórico por ID](../docs/plans/lanzamiento-2026-10-07/REGISTRO-TAREAS.md).
Parcial/condicionado cuenta como abierto, no como implementación fallida. No sumar
estos IDs con revisiones posteriores como si tuvieran el mismo alcance.

| ID | Pendiente preservado | Entrada para habilitarlo |
|---|---|---|
| FE-05 | Automatización de medición diferida | Nueva decisión de receptor, acceso y retención; primera ronda manual |
| FE-06 | Pro frontend condicionado | Validación/GO de NEG-01/03, UX-05 y BE-08 |
| BE-08 | Pro/pagos condicionado | NEG-01/02/03, fuentes y decisión comercial |
| UX-03 | Comprensión de valores con participantes | Participantes; implementación local ya aceptada |
| UX-05 | Diseño Pro condicionado | Validación/GO comercial |
| RES-01 | Entrevistas y resultados | Participantes gestionados por el dueño |
| RES-02 | Corpus etiquetado y medición | Fotos voluntarias con identidad exacta; protocolo ya entregado |
| RES-03 | Ejecución y resultados manuales | Participantes, consentimiento, custodia y retención |
| INF-01 | Cuenta, dominio y operación reales | Mini PC/servicios disponibles; preparación local aceptada |
| INF-03 | Off-host y operación de backups | Custodia/cuentas/equipo; ensayo local aceptado |
| INF-04 | Uptime, carga/consumo y presupuesto reales | Host objetivo disponible |
| SEO-01 | Dominio/salida productivos | Dominio y operación; auditoría/matriz local aceptadas |
| SEO-02 | Contenido dependiente de entradas | SEO-01, entorno y brief MKT-03 |
| SEO-03 | Dominio/salida productivos | Fase documental y preview local aceptados |
| MKT-03 | Mensaje/oferta respaldados por evidencia | Resultados RES-01/03; decisión de oferta si aplica |
| NEG-01 | Validación y decisión comercial | Evidencia RES-01/03 y DEC-05 |
| NEG-02 | Costes y licencias | Presupuesto, fuentes y consumo medido |
| NEG-03 | Requisitos comerciales/GO | Cuenta documental aceptada; validación comercial pendiente |

## Revisiones posteriores: no sumar al contador de lanzamiento

| Referencia | Estado real y siguiente entrada |
|---|---|
| REV-01/03/04/05/06 | Implementadas; no reabrir por migración documental |
| REV-02/07 | Sin corrección aplicada; reproducir en Safari/iPhone físico |
| Validación física REV-04 | Encuadre/cámara/audio en iPhone pendientes; emulación no los acredita |
| NM global y conversión histórica | Frontend entregado; backend y conversión **sin aplicar**, parche preservado. Requiere tarea autorizada de datos y coordinación de runtime |
| Textos/períodos | Gate posterior del 26/10 aprobado; el timeout de un intento anterior no es el estado actual |

Fuentes: [registro de revisión móvil](../docs/evaluations/revision-usuario-2026-10-25/TAREAS.md),
[parche y límites NM](../docs/evaluations/revision-usuario-2026-10-25/RESULTADO-06-variantes-nm-refresco.md),
[cierre posterior](../docs/evaluations/tcgcsv-batch-completion-2026-10-26.md).

## Roadmaps con alcance propio

- [Escáner](../docs/plans/scanner-improvements.md): corpus/precisión/calibración,
  duración/robustez y dispositivos; conserva IDs y aceptación de sus bloques.
  No hay tarea OCR: fue retirada. Abrir sólo el bloque autorizado, no todo el roadmap.
- [TCGCSV](../docs/plans/tcgcsv-cobertura-optimizacion-2026-10-21.md): asociaciones
  aún ambiguas (incluido Futsal), ahorro entre ciclos y backfill diferido.
  Consultar [estado del producto](../docs/estado-actual.md) para cierres posteriores:
  los contadores operativos del 21/22/26 no son estados vivos ni nuevas órdenes.
- Operación externa: mini PC + Cloudflare Tunnel, Resend y B2 elegidos; conservar
  dueño custodio age, retención 30 días y supresiones antes de reabrir tráfico.
  La disponibilidad de cuentas/equipo y publicación mantienen sus gates propios.

## Autoridad y cambios futuros

Este índice reemplaza el mantenimiento paralelo de cantidades/checklists. Los
registros anteriores conservan entregas y evidencias, no reciben nuevas bitácoras.
Al autorizar una feature, crear/reconciliar su documento ODD con specs literales;
enlazarlo aquí y actualizar sólo sus filas. El todo visible deriva de esa feature.
Engram recibe decisiones y copia de recuperación, no permisos históricos ni logs.

La feature actualmente autorizada es la [migración de contexto](tasks/gentle-context-migration.md).
Los pendientes de producto anteriores no se ejecutan dentro de esa migración.
