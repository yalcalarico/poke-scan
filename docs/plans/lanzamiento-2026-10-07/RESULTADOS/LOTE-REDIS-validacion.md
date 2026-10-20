# Lote Redis BE-07 — gate integrado pendiente

2026-10-09 · Sol HIGH. **La ronda termina con gate estándar fallido, recursos propios retirados y reservas liberadas. BE-07 permanece abierto.** La revisión enfocada anterior sigue aprobada por root; esta ronda no la transforma en validación integrada ni acredita fallback API/PostgreSQL/Next.

Se ejecutaron dos `pnpm run check` estándar, con `pnpm run stop` antes de cada uno, sobre el mismo clon TEST propio y Redis dedicado. El primero falló en dos expectativas de persistencia frontend; root autorizó corregir sólo esos tests y exigió evidencia causal. El segundo, justificado por esa corrección, falló en un test HTTP de readiness. No hubo tercera corrida global ni cambio de readiness sin causa probada. Ninguno llegó a Nest/Next build.

## Resultados realmente ejecutados

| Ejecución | Resultado |
|---|---|
| [Primer estándar](LOTE-REDIS-anexos/check-standard.log) | Lint/guards y tipos aprobados; backend405/405, scripts13/13, e2e6/6; frontend484/486 con2fallos. Exit1; build no alcanzado |
| [Focal recibido, dos casos frontend](LOTE-REDIS-anexos/frontend-focal-repro.log) |2aprobados,22excluidos por filtro; diagnóstico, no gate |
| [Archivo frontend recibido](LOTE-REDIS-anexos/frontend-file-repro.log) |24/24aprobados; el pase aislado no resolvió el fallo contextual |
| [Reproducción causal](LOTE-REDIS-anexos/frontend-causal-premature.log) | La expectativa original de allocation1 falla cuando la respuesta sigue pendiente y se conservan allocations2+1;1fallo esperado,23excluidos por filtro |
| [Archivo frontend corregido](LOTE-REDIS-anexos/frontend-corrected-file.log) |24/24aprobados, sin omisiones |
| [Segundo estándar](LOTE-REDIS-anexos/check-standard-corrected.log) | Lint/guards y tipos aprobados; backend404/405,1socket hang up en readiness.http. Exit1; scripts/e2e/frontend/build no alcanzados |
| [Readiness focal](LOTE-REDIS-anexos/readiness-focal.log) |4/4aprobados; no acredita que el fallo global esté resuelto |
| [Ensayo de lifecycle](LOTE-REDIS-anexos/readiness-lifecycle-repro.json) |300requests200 secuenciales con Nest/controller/mockdeps y Supertest;0fallos, servidor cerrado al final |

Los check estándar conservaron la configuración vigente y los defaults de worker/crons, con Node22.20.0 y pnpm10.17.1. No webpack, flags debilitando pruebas, ampliación de timeout ni skips añadidos. El transporte Turbopack/workerThreads permanece igual; **no fue ejercitado por estas corridas**, porque no llegaron al build. La suite total prevista tiene910pruebas; en el primer check se ejecutaron910:908aprobadas y2fallidas, sin omisiones. El segundo ejecutó405:404aprobadas y1fallida. No se suman focales/ensayo a un total de gate aprobado.

## Corrección contextual frontend aceptada por root

Los únicos cambios de esta ronda están en `frontend/components/scanner/__tests__/organize-sheet.test.tsx`, en los casos:

- «mantiene el mismo UUID y payload para resolver una respuesta incierta, sin POST al montar».
- «persiste una separación qty 3 → 2+1 del mismo runId y guarda solo el grupo listo».

El primero inspeccionaba storage tras ver el alert DOM, antes de que terminara su efecto de persistencia: el fallo global mostraba `status=saving` donde esperaba `uncertain`. El segundo esperaba sólo `addItem` llamado, y luego inspeccionaba allocations finales antes de esperar que terminara la respuesta. El fallo mostró2+1 donde esperaba1.

[Diagnóstico](LOTE-REDIS-anexos/frontend-diagnostico.md), [recibido](LOTE-REDIS-anexos/organize-sheet.received.tsx), [hash](LOTE-REDIS-anexos/organize-sheet.received.sha256) y [diff](LOTE-REDIS-anexos/organize-sheet.correction.diff) se preservan. Para probar causalidad se agregó una promesa controlada al segundo caso sin corregir aún la expectativa: falló de la misma forma antes de resolver. El test final exige saving/ambas partes/ningún éxito mientras la respuesta está pendiente; después la resuelve y espera la allocation original restante exacta, operación confirmed y toast de2copias. El primer caso espera statusuncertain persistido. Se mantienen timeout y valores esperados; no se cambió OrganizeSheet, almacenamiento, API ni UI. Root corroboró la corrección y el archivo24verde antes del diagnóstico siguiente.

## Readiness: causa pendiente

El segundo global falló en «scanner ocupado conserva HTTP 200 y deja busy como dato informativo», en `readiness.http.spec.ts`, con **socket hang up sin respuesta HTTP**, no con un assertion200/503 ni deadline de readiness agotado. Ese spec usa Redis/DB/scanner simulados y `app.init()` sin escucha estable; Supertest inicia/cierra el servidor efímero por request. La falla no demuestra una regresión de RedisService ni del scanner.

La lectura de Supertest7.3.0 instalado muestra espera de listening y cierre tras pending0. Superagent10.3.x usa `_agent=false` por defecto, sin pooling: no hay evidencia para atribuir el fallo al keepalive global. El focal4y un ensayo acotado de300requests con el mismo controller y mocks pasaron. El ensayo registró el lifecycle y cerró su servidor propio; no es una API completa, no usa readinessDB real y no sustituye integración.

**Causa definitiva no localizada.** No se modificó readiness, node_modules, versiones, timeouts, guards ni la estrategia de server del test. Los pases diagnósticos se conservan con ese límite; no vuelven verde el global. Hace falta capturar el ciclo listen/close/socket en el contexto donde reaparece el fallo o demostrar una causa verificable mediante comparación controlada, antes de proponer una corrección y un nuevo estándar. No se hizo un rerun idéntico para obtener verde.

## Aislamiento, preservación y cleanup

Ownership y hashes se guardaron antes de crear recursos en `/private/tmp/be07-gate-sol-20261009`. [Baseline](LOTE-REDIS-anexos/received-source-sha256.json):501fuentes y manifests de outputs previos; puertos3000/3001/56383sin listeners. [Preservación final](LOTE-REDIS-anexos/source-preservation.json):500/501idénticas; el único cambio es el test frontend autorizado. Las cinco fuentes/docs revisadas de Redis y los35artefactos de esa fase siguen con sus hashes aceptados.

Base propia `be07_gate_sol_20261009_test`, clon de TEST; comentario exacto `be07-gate-sol-20261009-owned`, propietario pokemon y contenedor Postgres registrado por ID completo. Redis propio ID `af3939d5374123091a129592675e5fd379c1d9963fc53db3f7a9fb1ba2dd3048`, label `gate.owner=be07-gate-sol-20261009`, bind `127.0.0.1:56383`, `/data` tmpfs sin volúmenes anónimos, snapshots/appendonly apagados. Las suites mutaron únicamente el clon/Redis propios. Sin reset, migrate-dev, FLUSHDB ni mutación de infra/datos compartidos.

[Ownership final](LOTE-REDIS-anexos/ownership.json) y [cleanup](LOTE-REDIS-anexos/infra-cleanup.log): comentario/propietario verificados,0conexiones al clon antes de DROP y ausencia después; Redis retirado por ID completo tras verificar nombre/label/bind, sin recurso propio restante. Puertos3000/3001/56383/56384libres. La corrida diagnóstico Node PID11860 terminó exit0 y confirmó `serverListeningAfterClose=false`.

API, Next y proxy de corte **nunca se iniciaron**. Se preparó un proxy loopback para preservar Redis en memoria al cortar, pero no se ejecutó, no hubo sus sockets ni fixtures de API ni sesiones/tokens generados; no existe runtime-state con credenciales. No se acredita login real, corte/restauración API, fallback PostgreSQL, vigencia de cachés calientes, ARS ni consumidor SSR. Los archivos de preparación permanecen privados y explícitamente sin ejecutar.

[Inventario antes](LOTE-REDIS-anexos/source-inventory-before.json)/[después](LOTE-REDIS-anexos/source-inventory-after.json): IDs dev Postgres/Redis idénticos y healthy; conteos dev y TEST preservados: dev20670cartas/176sets/11migraciones/5GIN/22usuarios/22colecciones/69ítems/13shares/29325precios/18721jobs/1snapshot; TEST20670/176/11/5GIN/2usuarios/3colecciones/2ítems/1share/188precios/0jobs/0snapshots. Es una comparación agregada acotada, **no un snapshot de todas las filas**. No se afirma aislamiento de red universal de las suites: las fuentes existentes de los tests mockean proveedores; el guard externo y la medición de intentos del runtime preparado no llegaron a ejecutarse.

**Reservas de suites/build/runtime/writer liberadas; recursos propios activos0.** Root conserva la decisión de cierre y el próximo diagnóstico. [Evidencia estructurada](LOTE-REDIS-evidencia.json).
