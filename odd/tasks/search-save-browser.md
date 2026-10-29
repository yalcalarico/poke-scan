# E2E de búsqueda y guardado
Objetivo: cubrir el flujo propuesto con Chromium y datos sintéticos; rama `feat/collection-nm-policy`.
Entrega: `ask-on-risk`, previsión ~380 líneas autorales en dos unidades; runners Playwright, node:test y `pnpm run check`.

## Specs

- S1 — Autorización: «bueno dale play», sobre «Lo próximo que habíamos propuesto —todavía sin implementar— es probar por navegador el flujo búsqueda → ficha → guardar en colección».
- S2 — Alcance aceptado: «cubriendo resultados/vacío/error, guardado correcto y fallo de guardado, con datos sintéticos y sin tocar tu inventario real.»

## Tasks

- T1 | S1-S2 | inline | done | Aislar catálogo sintético para la ficha server-side sin abrir acceso a API/red reales; test RED/GREEN y regresiones del runner. Commit `4ba6015`. Risk: item 2 (aislamiento de red del runner).
- T2 | S1-S2 | inline | done | Cubrir búsqueda, alta y fallo por UI con lectura posterior sintética; documentar límites, correr Chromium completo y check global; verificación independiente del aislamiento. Commit `4ba6015`.

## Log

- L1 — Pedido original: «bueno dale play».
- L2 — Contexto aceptado: «Quedamos con el entorno limpio para seguir, Ysmael:

- **Cambios locales comiteados y `master` integrado** en `feat/collection-nm-policy`. Acabo de confirmar que no hay cambios pendientes. No hicimos push.
- **`pnpm run check` quedó verde** en la última ejecución: lint, tipos, tests y builds.
- **La tanda TCGCSV del 28 terminó completa:** 173 grupos, sin fallos. También quedó guardado el arreglo para recuperar la tanda al iniciar la API.
- **El PR #19 ya estaba mergeado**, con la base Playwright.

**Lo próximo que habíamos propuesto —todavía sin implementar— es probar por navegador el flujo búsqueda → ficha → guardar en colección**, cubriendo resultados/vacío/error, guardado correcto y fallo de guardado, con datos sintéticos y sin tocar tu inventario real.

Ese es el punto de retome.»
- L3 — Decisión técnica: ficha Next real, fixture de catálogo estático exclusivo del preload; inventario en memoria por test. Precios ausentes, sin DB/API real, cámara ni dispositivos físicos. NM se comprueba en payload y lectura de ubicación. No reinterpretar 409. Las pruebas de flujo agregan cobertura de comportamiento existente: no corresponde fabricar RED de producto; el nuevo soporte server-side sí requiere RED real. Trabajo con continuidad entre dos unidades y revisión del aislamiento; se conserva este documento para retomar sin perder límites del plan previo.
- L5 — T1: node:test RED observado (6/7, catálogo ausente); GREEN 7/7 tras fixture exacto. No se amplió Socket.connect. Se agrupa con T2 en una unidad de revisión del aislamiento y su consumidor; commit pendiente al gate final.
- L4 — Preflight: árbol limpio, HEAD `4963955`; sin listeners en 3000/3001; RDD on. No push/PR en este alcance.
- L6 — Verificador independiente `mvtq4ixo-2-ym6t`: 18 probes públicos de fetch/Request/Socket y 38 probes del handler con contexto stub aprobados; sin bloqueadores de código/aislamiento. No equivalen a Chromium. Diferencial inline registry/socket contra `4963955`: 2/2 idénticos en exit/stdout/stderr.
- L7 — E2E focal: alta y fallo 2/2; vacío/error fallaron por selector heading sobre párrafos, corregido. Suite posterior 10/11 (login último caso no navegó); entrada cambiada a navegación cliente desde escáner hidratado. Suite siguiente 9/11: ingreso ya pasó, pero tipeo antes del estado cliente de catálogo no actualizó URL. Se espera «Buscá tu primera carta», que aparece después del GET cliente, antes de tipear. No se cambió código de producto. Gate serial job-4 finalizado con exit 0; no se acredita check global de los intentos anteriores cortados por &&.
- L8 — Cierre observado: node:test 7/7; Chromium 11/11 (sin skips); `pnpm run check` completo exit 0, incluidos lint, tipos, tests y ambos builds. Sin cambios de producto, dependencias ni datos reales. Se corrige la sincronización del test con la hidratación, no se atribuye un bug de login al producto.
- L9 — Unidad `4ba6015`, base `4963955`: 322 líneas autorales. ASSESS comprometido: nativeRisk medium; escalación item 2 high para verificación independiente, ya cumplida; `reviewDue:false`, `reviewDueReason:under_budget`. No START, consentimiento, lineage ni aprobación nativa. La evaluación no exige revisión nativa para esta unidad.
- L10 — Límite de esta feature: `4963955..4ba6015`; commits anteriores de NM/TCGCSV/integración no forman parte del candidato. Se conserva `ask-on-risk`, feature menor a 400 líneas; sin push/PR. Próximo paso de producto fuera de este lote: decidir nueva cobertura, no ejecutar pendientes históricos.
