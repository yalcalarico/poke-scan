# BE-03 — revisión y correcciones de implementación

Revisor/ejecutor de correcciones: Sol HIGH. Implementación original: Luna. Fecha: 2026-10-07.

**Dictamen: aceptada con correcciones para continuar INF-02.** No quedan hallazgos de código abiertos que bloqueen esa fase. BE-03 y el lote operativo no se declaran completos: faltan las verificaciones de runtime/packaging y el check global del lote. No se ejecutó Docker, Redis, stack normal, benchmark ni tráfico a proveedores; no se editaron paquetes, schema, handlers de negocio, UI o registros de orquestación.

## Correcciones aplicadas

| Hallazgo en la entrega | Corrección y evidencia enfocada |
|---|---|
| Warmup `incompatible`/`unavailable` retenía la sesión y podía repetir la validación con un modelo anterior tras repararlo. | Se retira esa generación, se limpia su listener y se valida en un child nuevo tras backoff. El test de incompatibilidad ahora exige reemplazo de generación antes de ready. |
| `child.send()` podía lanzar síncronamente y dejar timers/listeners de la operación; un callback de warmup tardío podía retirar el worker sin actualizar readiness. | Ambos envíos manejan excepción y callback. Warmup usa el fallo de generación, que publica unavailable y reintenta automáticamente. Se cubren throw, callback y callback tardío de generación retirada. |
| Identify consumía el primer mensaje IPC, incluyendo un acuse warmup duplicado. | El listener ignora `warmup-result` y permanece hasta resultado/error de inferencia. Se prueba que el acuse viejo no liquida la foto pendiente. |
| Shutdown de una inferencia esperaba exit/timeout del child; retirar todos los listeners de `error` podía dejar sin handler un error tardío de IPC/kill. | Shutdown cancela explícitamente la operación y limpia timers, abort y listeners de request. Cada worker retirado conserva un handler inocuo de error hasta close; no modifica el estado actual y se retira al cerrar. Se cubren error/disconnect/exit tardíos, cancelación y veinte consultas hot sin crecimiento de listeners. |
| DB compartía query pero creaba un deadline por request, admitía nuevos probes al cerrar y podía cachear como ready un éxito posterior al deadline. | Una respuesta/deadline por operación; la query real sigue single-flight hasta finalizar. Se descarta el éxito tardío, shutdown resuelve unavailable y prohíbe nuevos probes/conexiones. Tests cubren un único timer, resultado tardío y shutdown. |

Se preservan el guard busy, cancelación, muerte idle, recuperación, límites de imágenes y metadatos de retrieval de los cambios locales del scanner. La foto inválida queda como error de identify y no se clasifica como incompatibilidad del índice. Las regresiones de concurrencia/recuperación pasan por el worker simulado listo, sin eliminar la cobertura funcional por el nuevo estado de inicialización.

El getter de scanner sigue puro: no crea, carga, cancela ni programa trabajo. Los flags se aplican al arranque/restart; arrancar apagado crea cero worker/timers. El checkpoint background de warmup/retry y identify descartan trabajo si encuentran el flag apagado. No se introduce hot-enable ni un observer de variables de entorno.

## Contrato aceptado

- `/api/health` conserva payload y HTTP de liveness existentes.
- `/api/ready` es público, `no-store`, exento de throttler y 200 solamente con DB ready y scanner ready/disabled; el piloto scanner requiere ready, no disabled. Busy es informativo y conserva 200.
- DTO allowlist sin secretos, rutas, hashes, excepciones ni datos de usuarios; espejo mínimo en `frontend/types/api.ts`, cumpliendo AGENTS §1 sin agregar UI.
- Prisma 6 dedicado: pool/conexión/adquisición/socket limitados, `statement_timeout=750 ms` real y deadline HTTP compartido de 4 s. El deadline HTTP no se presenta como cancelación de Prisma.
- Warmup del mismo child: `load()` y `refreshIndex()` antes de ready; no embedding/foto/inferencia ni descarga desde lifecycle/probe. Recuperación automática con backoff, deadline y correlación generation/attempt; no requiere tráfico para salir del frío.

## Verificación ejecutada

Después de `pnpm run stop`, desde `backend/`:

```sh
pnpm exec vitest run src/app.controller.spec.ts src/readiness.http.spec.ts src/readiness.service.spec.ts src/modules/cards/visual-identify.service.spec.ts src/modules/cards/visual-identify.lifecycle.spec.ts
pnpm run lint
pnpm run build
```

Resultado final: **5 archivos, 49/49 tests; lint y Nest build pasaron**. Incluye HTTP Nest/Supertest, throttler/no-store/503/200, busy, TCP blackhole aislado, lifecycle y ejecución del branch real IPC del worker con ONNX/sharp/índice simulados. Esa prueba exige ready después de terminar la validación, reutilización del runtime y cero llamadas a embedding/sharp; no demuestra compatibilidad nativa ni tiempo de arranque del bundle completo. No se ejecutaron tests antes de los fixes; no se atribuyen fallos previos reproducidos a estas regresiones.

Los binds temporales loopback y la conexión read-only DB_TEST requirieron escalación de sandbox, autoaprobada; no hubo rechazo de auto-review. Las corridas parciales anteriores se solapan con las 49 finales y no se suman como pruebas distintas.

`pnpm exec tsc --noEmit --pretty false` del backend sigue fallando con el baseline comunicado por Luna: ocho diagnósticos en `sync-prices.service.spec.ts`, `tcgdex-set-mapping.service.spec.ts`, `cards.service.spec.ts`, `redis.service.spec.ts` y los dos e2e que importan `supertest/types`. La repetición no reportó errores de los archivos de esta reserva. Esto se distingue del Nest build, que excluye specs y pasó. El typecheck frontend había pasado en la entrega Luna; la revisión no volvió a modificar el DTO espejado.

Prueba PostgreSQL reproducible, desde `backend/` y después de build:

```sh
pnpm exec node ../docs/plans/lanzamiento-2026-10-07/RESULTADOS/BE-03-db-smoke.mjs
```

El fixture usa exactamente `resolveTestDatabaseUrl()` del proyecto y rechaza una base sin `test` o indistinguible de desarrollo antes de crear clientes. Fuerza y verifica transacciones read-only, timeout y application_name único. Sólo ejecuta constantes `SELECT 1`, settings, `pg_sleep(2)` y conteo de su propia actividad. No consulta datos de usuarios ni modifica tablas. Cierra ambos clientes en finally y no imprime URL/credenciales/errores del datasource.

Resultado anónimo observado en esta revisión:

```json
{"database":"DB_TEST","readOnly":true,"select1":"ready","sqlstate":"57014","elapsedMs":765,"orphanedSleepQueries":0}
```

Confirma cancelación **server-side**, no una carrera HTTP: SQLSTATE 57014 cerca de los 750 ms configurados y ninguna consulta pg_sleep de ese cliente activa después del error. El blackhole prueba por separado el timeout de transporte y un único intento/conexión. No extrapolar esta medición a latencia de producción.

## Handoff pendiente del lote

INF-02 conserva dos escenarios aislados: warmup/readiness/restart con ONNX y las 175 colecciones reales, y fixture de un vector/foto sintética autenticada para HTTP/inferencia sin certificar accuracy. Verificar allí límite cold 60 s, memoria, imports .mjs, módulos nativos y gateway frío/fallos; no se declararon verdes aquí.

Para el check global futuro, fijar `SCANNER_VISUAL_ENABLED=0` durante suites generales que inicializan `AppModule`, porque `.env` puede habilitarlo; la prueba de runtime scanner vive en el escenario específico INF-02. No se cambió Vitest/config fuera de reserva. Completar INF-02/03 y luego el check global requerido por AGENTS; esos gates quedan pendientes. La elección comercial de hosting continúa independiente.

Se libera la reserva de código BE-03, el reporte y estos artefactos de validación para que el coordinador continúe el siguiente writer serial.
