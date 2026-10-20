# FE-01 — Draft de lecturas e inventario

> Cierre del coordinador, 7/10: ID completado localmente; [gate frontend](LOTE-FRONTEND-validacion.md) aprobado con 815 pruebas/check, flujo real, QA y limpieza. La evidencia enfocada y límites del autor conservan su alcance original.

Fecha: 2026-10-07 · Estado: implementación corregida y validación enfocada terminadas para gate integrado; no cierra FE-01/FE-02.

`OrganizeSheet` exige destino vigente confirmado, carta revisada, variante y condición explícitas. Los atributos desconocidos conservan `null`. Los grupos se identifican por carta + variante + condición, conservan partes por `runId` y admiten selección de subconjuntos. División 3→2+1 y retiro parcial mantienen suma/identidad. Inputs inválidos bloquean el grupo; más de 999 copias no se recortan ni se fraccionan silenciosamente. Se puede guardar sin precio y una captura nueva no hereda atributos.

La búsqueda manual funciona dentro del Sheet, incluso fuera del top-8, reemplaza el mismo `runId` y conserva cantidades. Una selección manual no tiene similitud DINOv2 medida y exige revisar variante/condición de nuevo. Precio por carta/variante exactas, sin fallback singular; market = 0 es conocido y condición no ajusta valor.

`pcs.scanDraft`, versión 1, reúne `entries`, `sessionId`, propietario/destino confirmado, `allocations`, `operations` y `retiredRunIds` en un snapshot único sin fotos/crops/ranking. `pcs.scanSession` se lee solo para migración. Confirmación y retiro se persisten juntos, y un legado stale no resucita copias. Borradores corruptos/futuros e intentos incompletos bloquean envíos y preservan el string original sin sobrescribirlo.

Cada POST conserva previamente UUID, cuenta, destino, payload y refs exactos. Red/5xx/cuerpo inválido quedan inciertos; reload de saving restaura uncertain; verificación es manual con la misma identidad. Replay 400/401/404/409 no habilita otra clave. 410 bloquea permanentemente. Persistencia fallida después del commit conserva la reconciliación; no hay POST al montar, reintento automático ni respaldo offline. Cambiar de cuenta invalida destino y frena el resto del lote. El tope de 30 pausa capturas nuevas sin descartar previas; un legado mayor se conserva para organizarlo.

Validación enfocada tras `pnpm run stop`: **73 tests pasan en 10 archivos**, lint frontend, tsc frontend y diff whitespace verdes. Fixture UX de 20 lecturas puro y UI verifica 23 copias y 21 listas → 15 confirmadas / 3 seguras por corregir / 3 inciertas + 2 incompletas, preservando parte de runId 7. Detalles y shape final en [FE-01-review.md](FE-01-review.md).

Pendientes de coordinación: check global y smoke aislado API/DB real al finalizar el lote, revisión visual mobile/desktop/ambos temas, teclado/lector y cámara física. No se levantó stack ni se ejecutaron suites DB durante esta revisión. Reserva FE-01 liberada al entregar el informe.

## Corrección tras QA real del coordinador

El gate UI encontró pérdida de precios al restaurar: el candidato guarda un array de referencias, pero la sanitización lo enviaba directamente al parser de envelope. Se corrige a `{prices: candidate.prices}` sin cambiar contrato/versión ni parser compartido. Tres regresiones nuevas reprodujeron el fallo antes del fix y ahora preservan variante/carta exactas, 0/null, cinco sanitizaciones y cinco persistencias/reloads; el Sheet restaurado muestra 4/5 copias con referencia y USD 115 (10+100+5+0), sin ajustar por condición ni refrescar la API.

Evidencia final enfocada: **76 tests / 10 archivos**, lint frontend, tsc y diff verdes. Reserva acotada liberada; gate frontend pendiente del rerun real y check integral del coordinador. Detalle y alcance en [FE-01-review.md](FE-01-review.md). La evidencia histórica de 73 tests no cubría este bug de persistencia.
