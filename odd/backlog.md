# Backlog conciliado de PokéScan

Autoridad de pendientes para ODD, **no una orden para implementarlos**. Los
estados de producto proceden del corte 27/10/2026 y de los contrastes estáticos
indicados abajo; no acreditan runtime actual. Cada feature nueva se define desde
el pedido humano. No se inventan specs ni se reabren entregas por documentación.

## Orden de trabajo y corte histórico

Seguir el [plan por fases](plan-pendientes.md), empezando por el preflight NM sin
cambiar datos reales. Este backlog conserva la autoridad de estados; el plan
ordena dependencias y aceptación, no crea otra lista de cierres ni autoriza ejecución.

El corte histórico conserva **18 IDs abiertos y 20 cerrados**, no 18 activos hoy.
Los 38 IDs y sus cierres están en el [registro histórico por ID](../docs/plans/lanzamiento-2026-10-07/REGISTRO-TAREAS.md).
La tabla activa mantiene 13 IDs (SEO-02 sólo en su alcance local); cinco IDs y la
porción restante de SEO-02 quedan en [infra diferida](infra-diferida.md), dormida
hasta pedido explícito de configurar la mini PC. No sumar porciones de SEO-02 ni
revisiones posteriores como IDs nuevos. Parcial/condicionado no significa fallo.

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
| SEO-02 (local) | Contenido y brief respaldados por evidencia | MKT-03; no exige despliegue para prepararlos |
| MKT-03 | Mensaje/oferta respaldados por evidencia | Resultados RES-01/03; decisión de oferta si aplica |
| NEG-01 | Validación y decisión comercial | Evidencia RES-01/03 y DEC-05 |
| NEG-02 | Costes y licencias: análisis local habilitable desde ahora | Presupuesto y fuentes; distinguir estimaciones de consumo medido |
| NEG-03 | Requisitos comerciales/GO | Cuenta documental aceptada; validación comercial pendiente |

## Revisiones posteriores: no sumar al contador de lanzamiento

| Referencia | Estado real y siguiente entrada |
|---|---|
| REV-01/03/04/05/06 | Implementadas; no reabrir por migración documental |
| REV-02/07 | Sin corrección aplicada; reproducir en Safari/iPhone físico |
| Validación física REV-04 | Encuadre/cámara/audio en iPhone pendientes; emulación no los acredita |
| NM global y conversión histórica | Frontend entregado; política de escrituras backend implementada en `d8fba3d`, tests/check y diferencial aprobados. [Unidad cerrada](tasks/collection-nm-policy.md) sin revisión nativa por decisión humana explícita para ese commit. Conversión histórica **sin aplicar**; requiere autorización operativa propia |
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

## Rescate de planes sustituidos

Contraste estático al consolidar los nueve planes históricos; no habilita tareas
ni certifica runtime. Corpus, calibración, ediciones, consentimiento de memoria
visual y dispositivos ya están en el roadmap del escáner; operación real y
licencias mantienen los gates anteriores.

| Requisito abierto o condicionado | Evidencia actual y próxima entrada |
|---|---|
| Foco del escáner sobre foto | `action-bar.tsx`, `camera-controls.tsx` y `camera-view.tsx` todavía usan `outline-on-media-text`. Reconciliar con `--focus-ring-on-media` al autorizar la deuda visual; no asumir que siguen siendo sólo cuatro indicadores. |
| Cobertura E2E por navegador | El smoke HTTP `scripts/verify-app.mjs` no acredita login por UI ni la matriz completa de auth/ownership/DOM. Reconciliar cobertura existente y casos faltantes antes de planificar automatización; no confundir los E2E de API con navegador. |
| `share_target` y endpoint bulk: alcances diferidos | `frontend/public/manifest.json` no declara `share_target`; `collection-detail.tsx` mantiene acciones secuenciales con tope 60. Requieren decisión de producto propia, no son bugs reabiertos por retirar los planes. |

## Autoridad y cambios futuros

Este índice reemplaza el mantenimiento paralelo de cantidades/checklists. Los
registros anteriores conservan entregas y evidencias, no reciben nuevas bitácoras.
Al autorizar una feature, crear/reconciliar su documento ODD con specs literales;
enlazarlo aquí y actualizar sólo sus filas. El todo visible deriva de esa feature.
Engram recibe decisiones y copia de recuperación, no permisos históricos ni logs.

La [migración de contexto](tasks/gentle-context-migration.md) está finalizada según
su cierre histórico reconciliado desde Git. La [consolidación documental](tasks/documentation-consolidation.md)
no ejecuta pendientes de producto ni autoriza tocar configuración externa.
