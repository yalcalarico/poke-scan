# Fallos temporales TCGCSV del gate
Objetivo: reproducir y corregir dos fallos observados, como unidad separada del baseline Playwright.
Rama: `feat/collection-nm-policy`; base: `77046d0`. Sin inventario real ni publicación.

## Specs

- S1: «go». Autoriza la propuesta: «¿Autorizás diagnosticar y corregir estos dos fallos TCGCSV como una unidad separada, sin tocar inventario real, para después cerrar el gate y la revisión del baseline?»
- S2: «Review the delivered subagent output and continue.» Continuidad tras job10, que observó `downloadStartedAt` null en `tcgcsv-batch-completion.integration.spec.ts:135` y `blockedUntil`1793230862590 menor que umbral1793230972630 en `tcgcsv.daily.integration.spec.ts:218`.

## Tasks

- T1 [S1,S2] delegated/explore + inline/RED — done — job11 reproduce2fallos/16tests; diagnóstico causal de fixtures contrastado; commit de corrección: `d4c22bc`.
- T2 [S1,S2] delegated/worker + inline/checks — done — fixtures/aserciones corregidos sin producción; job12 GREEN16/16; commit: `d4c22bc`.
- T3 [S1,S2] inline/gate + review aplicable — done — job13 check completo salida0; commit separado `d4c22bc`; continuidad del baseline retomada y revisión nativa cerrada.

## Log

### L1 — Pedido literal

go

### L2 — Alcance y límites

Se autorizó diagnosticar/corregir dos fallos TCGCSV detectados al verificar la corrección Playwright. No se presupone causa común, inestabilidad ni carácter preexistente. Los commits de Playwright son2cb32c6+77046d0; su autoridad `review-00efeeba6711dfb0` sigue correction_required en worktree `.git/agent-worktrees/browser-baseline-review` fijado77046d0. No mezclar cambios backend en ese árbol/autoridad ni iniciar otra revisión sobre el baseline.

Primera hipótesis a contrastar: referencias temporales de fixtures frente a Date.now/NOW PostgreSQL y precondiciones de reserva. Explorar no acredita una causa. Primera reproducción job11 usa ambos specs originales con stop previo, runner Vitest serial existente y globalguard de base `_test`. No abrir secretos/.env ni consultar inventario real; usar sólo fixtures propios y restaurar estado compartido de tests.

Preferencia de superficie: los dos specs si el defecto es de fixture/aserción. Si evidencia demuestra cambio productivo necesario en reserva/pausa, nombrar riesgo de datos/concurrencia y verificar independientemente; no debilitar políticas24h/Retry-After ni tocar catálogo/precios reales/migraciones/fuentes. No relajar asserts o introducir sleeps para obtener verde. No cambiar reloj del sistema o PostgreSQL.

Unidad objetivo pequeña y cohesiva (<400líneas autoradas), tests/docs con el comportamiento que corresponda; commit separado del baseline. Gate obligatorio `pnpm run check`, sin suites/DB/Redis/runtime compartidos en paralelo. Los docs previos sin commit quedan preservados, no incorporados incidentalmente.

### L3 — RED y causas contrastadas

Job11 salida1,2fallos14pasos16tests en12.53s, mismos fallos de job10 con specs originales. Worker `mvsrrlfi-h-wve7` leyó specs/config/setup/servicio/coordinador/error: el caso skew fija tanda ayer21UTC, luego clock=Date.now()+120s. Coordinator.active cierra tandas al llegar syncDate+45h (hoy21UTC), antes de reservar, por eso null. Padre spot-check de coordinator.active confirma umbral y failRemaining.

Caso429: reloj inyectado fijo hoy21UTC, until=clock+120s=21:02; al ejecutar23:51UTC UPSERT GREATEST(COALESCE(blockedUntil,NOW()),until) conserva NOW deDB. El valor observado está9ms detrás del Date.now utilizado en aserción, no120s adelante. ProviderRateLimitError conserva120000ms sin default. No es necesario cambiar servicio,24h ni429.

T2 autorizada como test-only: tanda válida correspondiente al instante de skew basado en NOW deDB; medir reserva contra inicio realmente consumido y no re-descarga. Caso429 usa override local de COMPARISON_CLOCK coherente con DB, exige vencimiento exacto+120000, conserva quinto fallo/no reinicio y restaura clock/spy. Mantener snapshots/cleanup deDBtest; no fixtures reales ni inspección operativa. Riesgo previsto:none (tests y docs;sin producción/contratos).

### L4 — GREEN focal y lectura de diff

Worker `mvsrupxq-i-rd7e`:3archivos+69/-13(82líneas autoradas), sólo2specs ydocs/testing. Job12 salida0:16/16 en13.33s, guard confirma pokemon_cards_test y3001libre. Padre lee diff completo y diff--check0. Caso reserva exige products/pricesconsumidos,reserva>=inicio+24h y rechazo reencolada inmediata sin alterarjob/reserva; caso429exige vencimientoexacto y bloqueo de GROUP_BOUNDARYelegible sinHTTP/cambiosjobs/contadores/pausa, manteniendo5fallos/no reinicio. Clock/spy/estado compartido restaurados.

ASSESS de main no evalúa candidato por untracked sin declarar; plan writerSelfVerification, independentVerifier:false (sin ítemalto riesgo). No modificar autoridad activa del baseline ni iniciar otro review por tests/docs. T3 ejecutará gate completo; no cambios productivos que necesiten diferencial CLI o flujo operativo de datos reales.

### L5 — Cierre verificado

Usuario: «Review the delivered subagent output and continue.» Job13 `pnpm run check` salida0 en2m36s: lint,tipos,tests,builds completos. Commit `d4c22bc` (`test(tcgcsv): anchor clock fixtures to valid batch windows`), sólo los3archivos autorizados,+69/-13. Slice `77046d0..d4c22bc` de82líneas, independiente de commits previos de la rama. Sin producción, inventario real, fuentes nuevas, cambios de reloj global, migraciones ni publicación.

Revisión nativa del baseline se retomó exclusivamente en su worktree aisladoHEAD77046d0; no se agregaron allí estos specs backend. Validador dirigido aprobó corrección del runner y ack exacto consumió `review-00efeeba6711dfb0`, authorityburned. No implica revisión nativa propia de esta unidad test-only. Los documentos locales previos permanecen preservados fuera de los commits de producto. No repetir suites/builds verdes intactos por el cierre documental.

Risk: none — cambios sólo de fixtures/aserciones y documentación de tests.



