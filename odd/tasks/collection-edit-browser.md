# E2E de edición de colección
Objetivo: continuar la cobertura Chromium aislada después de búsqueda y alta.
Base: `3a7aea8`; rama `feat/collection-nm-policy`. PR diferido, sin publicación.

## Specs

- S1 — «dale play con todo entonces», sobre el plan de la siguiente fase de cobertura.
- S2 — «Cambiar cantidad, intercambio y notas; guardar y comprobar los valores después de recargar.»
- S3 — «Modificar y cerrar sin guardar; verificar cero escrituras y valores originales.»
- S4 — «Simular error; comprobar que conserva el formulario, no anuncia éxito y no modifica los datos.»
- S5 — «Ejecutar pruebas focales, suite completa de navegador y `pnpm run check`. Documentar resultados y límites; revisión independiente si corresponde por riesgo.»
- S6 — «Dejar commits verificables junto con la cobertura anterior. Después retomamos la preparación del PR, sin publicarlo automáticamente.»
- S7 — «Fuera de esta fase: borrado, nuevas colecciones, persistencia real, inventario personal y pruebas físicas de cámara/iPhone.»

## Tasks

- T1 | S1-S4,S7 | inline | done | Extender fixture PATCH exacto y cubrir edición, cancelación y error con lectura posterior. Commit `935b378`. Risk: item 2 (allowlist del escenario de red).
- T2 | S5,S7 | inline + verify | done | Suite focal/completa, check global, verificación independiente del aislamiento y documentación. Commit `935b378`.
- T3 | S6 | inline | done | Evaluación intentada; cierre y commits registrados, sin push/PR. Unidad `935b378`; cierre documental en commit posterior.

## Log

- L1 — Pedido original: «dale play con todo entonces».
- L2 — Decisión previa: «la siguiente comertura, dejamos el PR para despues con la sigueinte fase». Se mantiene PR diferido; no publicación.
- L4 — RED job-1 exit 1: éxito/error rechazados por PATCH no permitido; cancelación pasó (2 fallos, 1 aprobado). Se agregó después PATCH exacto con payload/bearer, sin ampliar Socket ni preload. GREEN focal y gates seriales en job-2.
- L5 — ASSESS de worktree no pudo clasificar por tracker nuevo sin declaración de untracked; escalación item 2 exige verificador independiente. La evaluación final usará la unidad comprometida, no todo el historial de la rama.
- L6 — job-2 focal exit 1: cancelación/error pasan; éxito falló antes de editar en navegación fría a ficha (toHaveURL 5000 ms). Runner/full/check no se ejecutaron por `&&`. Worker `mvtspezd-2-mhoq` corrigió únicamente la sincronización del test: waitForURL 20 s iniciado antes del clic, sin retries/sleeps/force.
- L7 — Worker observó focal 3/3, runner 7/7, Chromium completo 14/14 (sin skips), `pnpm run check` exit 0 (lint/tipos/tests/builds). Warnings no bloqueantes de lint/lockfile/dimensiones. Padre spot-check runner 7/7 exit 0 y diff estructural. No cambios de producto.
- L8 — Verificador `mvtsm3dl-1-vv1s`: 34 negativos PATCH sin mutación de item/contador, PATCH sin item rechazado, 503 registra intento sin alterar carta, 200/readback exactos y fixture nueva aislada. Diferencial legacy baseline/current idéntico en exit/stdout/stderr; browser/preload/config/runner idénticos. S5 pendiente en su informe previo al gate se cierra con L7. Su scratch no forma parte de la entrega; no se incorpora un harness adicional. Advisory POST-only corregido.
- L9 — `design/` apareció untracked durante los checks; ajeno al alcance, preservado y excluido de commits. No se repiten gates de producto por cierre documental. Próximo: evaluación de esta unidad comprometida; sin push/PR.
- L10 — Unidad `935b378`, base `3a7aea8`: 136 líneas autorales (134 altas, 2 bajas). ASSESS comprometido no disponible: el proveedor exige declaración de untracked incluso con committedOnly; existe `design/` ajeno y no se adopta ni modifica. No hay `reviewDue` calculado: no START, consentimiento, lineage ni aprobación nativa. No se infiere aprobación de la evaluación. El plan retornado conserva self-verification más verificador por escalación item 2, ambos satisfechos en L7-L8. La evaluación fallida informa únicamente; no sustituye ni invalida esos checks funcionales. No se reintenta ni amplía alcance para desbloquear una revisión no ofrecida.
- L11 — T1-T3 cerradas; alcance de la feature `3a7aea8..935b378`, no la rama acumulada. PR sigue diferido; ninguna publicación. Fallos anteriores resueltos y límites de evidencia documentados. `design/` permanece ajeno.
- L3 — El plan citado en Specs fue propuesto por el asistente y autorizado por L1. Sólo cobertura del comportamiento existente, sin fabricar RED de producto; el soporte nuevo PATCH sí tendrá RED antes de implementación. Estado sintético por test; lectura simulada no acredita PostgreSQL ni ownership backend.
