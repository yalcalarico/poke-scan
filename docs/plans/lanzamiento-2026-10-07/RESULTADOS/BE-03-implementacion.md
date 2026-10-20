# BE-03 — implementación para revisión

Estado: implementación local revisada y corregida por Sol HIGH; ver [BE-03-validacion.md](./BE-03-validacion.md). No se declara BE-03 completo ni el gate operativo verde. Se preservaron los cambios locales ajenos; no se hizo stage, commit, reset, stash ni deploy.

## Resultado

Se conserva `GET /api/health` con su semántica HTTP y payload existentes. Se agrega `GET /api/ready` con `Cache-Control: no-store`, exención del throttler global y estado HTTP 200/503 según la base responda y el scanner esté `ready` o `disabled`. El cuerpo expone estados acotados de database, scanner y Redis, y `busy` solo como dato informativo. Redis caído degrada la respuesta sin matar el proceso ni invalidar readiness. La respuesta no incluye secretos, rutas locales, detalles de error ni identificadores del modelo.

La prueba de DB usa un Prisma Client dedicado y una consulta fija `SELECT 1`, con `connection_limit=1`, `connect_timeout=1`, `pool_timeout=1`, `socket_timeout=1` y `statement_timeout=750`. Consulta y deadline se comparten en vuelo y el resultado se cachea un segundo; cada request espera como máximo cuatro segundos. Un éxito posterior al deadline no se cachea como ready ni se apilan reemplazos mientras la operación anterior siga pendiente. El timeout HTTP no se presenta como cancelación de la promesa Prisma: los límites del cliente y del servidor acotan la operación. Shutdown resuelve los probes pendientes como unavailable y evita reconectar. La inicialización normal de Prisma sigue siendo fail-fast.

El scanner calienta en background al iniciar el módulo, solo si `SCANNER_VISUAL_ENABLED=1`. El worker recibe un IPC de warmup con generación e intento y reutiliza `load()`/`refreshIndex()`; el probe no inicia ni acelera trabajo. El proceso informa `initializing`, `ready`, `unavailable` o `incompatible`; apagado queda `disabled` sin crear worker ni timers. Fallos, timeout de 60 s y respuestas incompatibles retiran el worker y reintentan fuera del probe con backoff 5/15/30/60 s. La correlación generation/attempt descarta respuestas viejas sin consumir el listener vigente; shutdown limpia timers y listeners. No se agrega inferencia ni descarga al camino de probe. Identify conserva ruta, DTO, autenticación, forma de resultado y límite de 30 s.

El espejo frontend agrega únicamente el tipo DTO, sin UI.

## Archivos de esta reserva

- `backend/src/app.controller.ts`, `backend/src/app.controller.spec.ts`, `backend/src/app.module.ts`
- `backend/src/readiness.service.ts`, `backend/src/readiness.service.spec.ts`, `backend/src/readiness.http.spec.ts`
- `backend/src/modules/cards/cards.module.ts`, `backend/src/modules/cards/visual-identify.service.ts`, `backend/src/modules/cards/visual-identify.service.spec.ts`, `backend/src/modules/cards/visual-identify.lifecycle.spec.ts`
- `backend/scripts/scanner-visual-worker.mjs`
- `backend/docs/api.md`, `backend/docs/testing.md`
- `frontend/types/api.ts`
- `docs/plans/lanzamiento-2026-10-07/RESULTADOS/BE-03-implementacion.md`

Hay cambios locales previos en archivos compartidos, incluidos `backend/docs/api.md`, `backend/docs/testing.md`, `frontend/types/api.ts` y el service visual. Esta entrega los preserva; revisar hunks antes de cualquier integración. `backend/src/app.controller.spec.ts` y `backend/scripts/scanner-visual-worker.mjs` estaban limpios al handoff inicial: sus cambios no se atribuyen a trabajo previo ajeno a BE-03.

## Verificación ejecutada

- `pnpm run stop` antes de los specs focalizados.
- `pnpm exec vitest run src/app.controller.spec.ts src/readiness.http.spec.ts src/readiness.service.spec.ts src/modules/cards/visual-identify.service.spec.ts src/modules/cards/visual-identify.lifecycle.spec.ts`: 5 archivos, 30 tests pasaron. Incluye Nest/Supertest in-process: readiness 200/503 y `no-store`, health 200 con Redis no disponible, y throttler bypass de `/ready`.
- `pnpm run lint` del backend: pasó.
- `pnpm run build` del backend: pasó.
- `pnpm exec tsc --noEmit` del frontend: pasó.
- `pnpm exec tsc --noEmit --pretty false` del backend: aún reporta errores TypeScript en specs existentes fuera de esta reserva: `sync-prices.service.spec.ts`, `tcgdex-set-mapping.service.spec.ts`, `cards.service.spec.ts`, `redis.service.spec.ts` y dos e2e specs que no resuelven `supertest/types`. No reportó errores en readiness ni en sus specs.
- La primera prueba contra la URL de desarrollo fue rechazada por un guard local antes de conectar; luego se resolvió la URL con el mecanismo documentado de DB_TEST y se exigió un nombre que contenga `test`. En esa base, `SELECT 1` pasó. `SELECT pg_sleep(2)` terminó por timeout a ~794 ms y una consulta posterior a `pg_stat_activity` (excluyendo la sesión observadora) encontró cero sesiones de `pg_sleep` activas. No se alteraron datos. También pasó el fixture TCP blackhole local con el Prisma Client dedicado bajo cuatro segundos, verificando el límite del lado cliente.
- El sandbox bloqueó el bind loopback del fixture con `EPERM`; se repitió el comando focalizado con escalación aprobada y pasó. No hubo rechazo de auto-review.
- No se ejecutaron suites globales, Redis, stack normal, benchmarks ni llamadas a proveedores externos.

## Revisión y pendientes

La revisión Sol HIGH corrigió retiro de generaciones fallidas, excepciones síncronas/callbacks tardíos de IPC, acuses de warmup durante inferencia, cleanup al cerrar y deadline DB compartido. Ver el detalle y resultados finales en [BE-03-validacion.md](./BE-03-validacion.md). La prueba read-only contra DB_TEST ya verificó `statement_timeout` y ausencia de consultas huérfanas, y se repitió con un fixture reproducible. Quedan el runtime real con bundle completo, packaging/gateway de INF-02/03 y el check global al finalizar ese lote. Esta entrega no cambia Docker ni la semántica de sus probes persistentes.
