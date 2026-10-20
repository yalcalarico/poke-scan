# BE-03 — Revisión del preflight y contrato técnico mínimo

Fecha: 2026-10-07 · Revisor: GPT-6.1 Sol, esfuerzo alto.

**Salida:** diagnóstico del preflight aceptado con las correcciones de abajo. El handoff técnico queda **resuelto para implementación local**, integrado con [INF-01-review](INF-01-review.md). No acredita implementación ni cierre de BE-03, INF-01 o del lote de operación. Esta revisión escribe documentos reservados, sin código.

## Evidencia contrastada

Se leyeron AGENTS.md raíz y frontend, los planes 02/10/11, BE-03-preflight y el código actual, incluidos los cambios locales del servicio visual. No se ejecutaron tests, procesos de aplicación, consultas DB/Redis, benchmarks ni proveedores. Se consultó documentación primaria para los límites de Prisma 6/PostgreSQL 16; esto verifica soporte documental, no demuestra todavía el plazo efectivo en este entorno.

| Hallazgo | Evidencia y conclusión |
|---|---|
| Liveness ya tiene consumidor | `backend/src/app.controller.ts:39-47` devuelve 200/`ok` sin DB/modelo. `backend/Dockerfile:67-68` consulta `/api/health`. Preservar ruta, payload y status; no sustituirla por readiness. |
| Redis falla abierto | `backend/src/redis/redis.service.ts:126-145` permite consultar estado sin comandos ni secretos. El comentario en `:130-137` distingue ausencia de caché de caída. `app.controller.ts:44` igualmente marca degradado cuando no hay Redis; el test no verifica ese booleano. Es un detalle preexistente, ajeno al gate de disponibilidad; BE-03 no necesita modificar health. |
| Arranque DB conserva fail-fast | `backend/src/prisma/prisma.service.ts:14-16` espera `$connect()`; `main.ts:46` recién escucha después de inicialización. Sin DB puede no existir respuesta HTTP. Eso sigue significando «no listo», no un falso 200. No hace falta rediseñar arranque/jobs para este ID. |
| Scanner realmente lazy | `visual-identify.service.ts:74-103` habilita sólo con flag `1` y crea el child desde `identify()`. `scanner-visual-worker.mjs:44-53` carga ONNX, valida índice y recién después hace embedding. Hoy no hay warmup ni estado barato. Un getter que espere un primer identify exitoso quedaría atrapado detrás del gate de tráfico. |
| Validación reutilizable | `scanner-visual-index.mjs:7-20,72-120` verifica hash del modelo, metadata, dimensiones, vectores, duplicados y no vacío; `refreshIndex():123-134` conserva un snapshot anterior ante fallo. En arranque frío no hay snapshot anterior que permita fingir compatibilidad. `stat` o un manifiesto sin validación local no prueban que ONNX cargue en ese runtime. |
| Recuperación actual depende de tráfico | `visual-identify.service.ts:93-103,107-120,144-165` libera/mata child y conserva protección frente a eventos de una generación anterior. `visual-identify.lifecycle.spec.ts` cubre esos casos, pero reemplaza mediante la consulta siguiente. Readiness necesita recuperación fuera del probe y sin esperar otro request. |
| Wiring faltante en propuesta | `cards.module.ts:14` sólo exporta `CardsService`. Inyectar `VisualIdentifyService` desde un servicio/controller externo requiere exportarlo desde ese módulo; no crear una segunda instancia con otro provider. |
| Packaging aún pendiente | Docker runner no copia scripts/modelo/índice y Compose deploy no activa scanner. Es handoff de INF-01/INF-02, no arreglo de packaging realizado por esta revisión. |

Corrección de evidencia del preflight: `backend/test/app.e2e-spec.ts` contiene un caso de health y además casos de catálogo, colecciones, compartir y jobs. No es una suite que únicamente pruebe health. La afirmación válida es que no se encontró un caso de readiness. Las referencias correctas del accessor Redis son `:126-145`; la distinción entre Redis ausente y degradado está explícita en comentarios del servicio, sin atribuir una frase literal inexistente a API docs.

## Contrato HTTP propuesto

`GET /api/health` conserva su liveness actual. Agregar `GET /api/ready`, público, sin input y con `Cache-Control: no-store`; responder 200 sólo con DB disponible y scanner `ready` o `disabled`. Todo otro estado retorna 503 con el mismo shape explícito:

```json
{
  "status": "not_ready",
  "degraded": false,
  "detail": {
    "database": { "state": "ready" },
    "scanner": { "state": "initializing", "busy": false },
    "redis": { "state": "disabled" }
  }
}
```

- `status`: `ready | not_ready`, coherente con HTTP.
- DB: `ready | unavailable` después del probe acotado; error/timeout equivalen a unavailable.
- Scanner: `disabled | initializing | ready | unavailable | incompatible`. `busy` informa una inferencia activa y no cambia ready. `disabled` dice que ese runtime sirve la API general con reconocimiento apagado; no promete reconocimiento disponible ni habilita un piloto que lo requiera.
- Redis: `disabled | ready | degraded`. Su caída no impide readiness, por el fallback existente. `degraded` global vale true sólo cuando Redis configurado está caído. No cambiar con esto el booleano histórico de `/health`.

No devolver paths, DSN/URL, mensajes de excepción, stacks, env, contenido de fotos ni datos del usuario. Tampoco se necesitan hashes/versiones en el payload para cumplir este ID. Infraestructura puede verificar versiones por el manifiesto de despliegue privado. Los probes no llaman fuentes externas.

El guard global actual limita 100 requests/minuto (`app.module.ts:33,46`). La nueva ruta debe quedar exenta del throttler mediante la capacidad existente del paquete, para que tráfico público no convierta un proceso sano en 429 durante el probe; no ampliar la excepción a endpoints de negocio. Propuesta inicial de infraestructura: readiness cada 10 s, timeout 5 s, tres fallos consecutivos para retirar tráfico. Liveness conserva Docker 30 s/5 s/20 s de gracia/tres fallos. Son parámetros técnicos iniciales, no mediciones de capacidad.

## Scanner frío y recuperación sin inferencia en probes

La corrección necesaria del preflight es elegir una fuente validada concreta, no dejarla indeterminada ni esperar la primera foto. Propuesta mínima: **warmup IPC único por generación del worker, disparado por lifecycle/background fuera del handler**.

1. Con scanner apagado, no programar warmup ni crear child. Con scanner activo, iniciar una tarea no bloqueante de lifecycle y publicar `initializing`; permitir que Nest escuche mientras prepara el scanner, sin descargar ni indexar nada.
2. Añadir un mensaje IPC interno discriminado de warmup y su respuesta propia. Reutilizar `load()` y `refreshIndex()` del worker actual: crear sesión ONNX, calcular compatibilidad y cargar snapshot. **No llamar `embedding`, no usar una foto sintética, no inferir y no crear otro camino de reconocimiento.** Retener esa sesión/snapshot en el mismo child que atenderá identify.
3. Marcar ready sólo tras el acuse validado de esa generación viva. La respuesta warmup debe diferenciarse de `VisualWorkerResult`; no dejar que un acuse tardío satisfaga una inferencia ni que un mensaje de un child antiguo reactive ready. Serializar inicialización e inferencia, con una sola inicialización en curso. Durante inicialización no admitir identify: responder 503 seguro conservando la forma del contrato HTTP existente; flag apagado conserva 404 y cero worker.
4. Al liberar child por exit/error/disconnect/timeout/cancelación, invalidar inmediatamente su estado y programar recuperación automática fuera del probe. Propuesta inicial: deadline de warmup 60 s y backoff 5/15/30/60 s, con tope 60 s y un solo intento activo. No son tiempos medidos: se revalidan en la fase de runtime del lote. Un timeout debe matar esa generación, limpiar listeners/timers y dejar de usarla antes del reemplazo. No resucitar durante shutdown ni con flag apagado.
5. Modelo/índice faltante: unavailable; metadata/vectores incompatibles: incompatible; error de runtime no clasificado: unavailable. Clasificar sólo errores conocidos en el warmup, con códigos internos acotados; no exponer textos ni cambiar el contrato HTTP de identify. Un intento posterior validado vuelve a ready; no requiere tráfico para salir de un fallo transitorio.
6. El handler ready sólo lee ese snapshot de estado; no crea child, inicia warmup, carga ONNX, hace hash, inventaría JSONL ni inicia reintentos. El background puede estar trabajando cuando llega un probe, pero no lo dispara el probe.

Esto es una extensión de inicialización/lifecycle del worker actual, justificada por BE-03. Preservar `identify-visual` autenticado, DTO/resultados, cancelación, deadline de inferencia 30 s, exclusión busy y los cambios locales ya presentes. No construir un manager nuevo ni ampliar calibración/benchmark.

Contrato para INF-02: bundle de scripts y dependencias nativas compatibles, modelo e índices JSONL/metadata verificables, artefactos inmutables/read-only durante una generación. Actualizar modelo/índice con despliegue/restart y warmup nuevo. El manifiesto ayuda al packaging; no reemplaza el warmup. No declarar compatible un archivo mutable únicamente porque fue validado antes. Si la topología necesita actualización in-place, requiere un handoff distinto de invalidación explícita; no incorporarla por defecto.

## Probe DB con límites efectivos

Propuesta de menor impacto: un **PrismaClient 6 dedicado y singleton para salud**, sin nuevas dependencias, sin modificar el pool/timeout de queries de negocio. Derivar la URL con `URL`/`searchParams`, conservar schema/TLS/parámetros existentes, agregar `connection_limit=1`, `connect_timeout=1`, `pool_timeout=1`, `socket_timeout=1` y, mediante `options`, `-c statement_timeout=750` para esa sesión de salud. Conservar opciones existentes y asegurar que el límite de salud prevalezca; no imprimir la URL. Ejecutar sólo `SELECT 1` mediante query parametrizada fija y cerrar ese cliente en shutdown.

Estos parámetros del conector PostgreSQL están documentados para Prisma 6: límites de conexión, adquisición y espera de query en segundos; `options` permite configuración al conectar. [Documentación primaria Prisma 6](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql#arguments), consultada el 7/10/2026. El cliente instalado declara `datasourceUrl`/`datasources` en `backend/node_modules/@prisma/client/runtime/library.d.ts:2639-2647`; el schema actual usa el conector incorporado, sin adapter.

El `statement_timeout` de PostgreSQL 16 **aborta la ejecución en el servidor** y evita queries abandonadas aunque el cliente deje de esperar; el socket timeout acota la espera del cliente ante una conexión sin respuesta. Aplicarlo únicamente a la sesión dedicada evita cambiar la API general. [Documentación primaria PostgreSQL 16](https://www.postgresql.org/docs/16/runtime-config-client.html#GUC-STATEMENT-TIMEOUT), consultada el 7/10/2026.

Una alternativa soportada si la topología/pooler no conserva `options`: transacción acotada con `maxWait`, `timeout` y `SET LOCAL statement_timeout` antes de `SELECT 1` en esa misma conexión, conservando límites de conexión/socket del cliente dedicado. Prisma documenta adquisición y duración de transacciones; el límite servidor sigue necesario y no se reemplaza por el timeout HTTP. [Transacciones Prisma 6](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions#transaction-options).

Coalescer requests simultáneos en una única consulta y cachear su resultado como máximo 1 s desde finalización; vencido, repetir. Deadline HTTP propuesto 4 s, inferior al timeout del consumidor 5 s. Si se usa una carrera de promesas para ese deadline HTTP, no llamarla cancelación DB: la protección real son los límites driver/servidor y el single-flight que impide acumular queries. Nunca lanzar reemplazos mientras la anterior siga pendiente ni servir un éxito vencido como ready. Los límites cubren fases distintas; no afirmar un plazo exacto de extremo a extremo sin validación enfocada en el runtime real.

Conservar por ahora el fail-fast de Prisma al arranque; INF-01 debe documentar restart/gracia cuando no existe listener. DB caída después del arranque devuelve 503 acotado y vuelve a 200 tras recuperación. No requiere rediseñar JobsRecovery ni la cola de precios.

Antes de aceptar el timeout como verificado, la implementación debe probar con DB aislada la sesión real: comprobar statement_timeout efectivo y provocar una query de prueba lenta (por ejemplo pg_sleep, sólo desde fixture interno, nunca parámetro público). Tras vencer debe fallar y no quedar ejecutándose en pg_stat_activity observado por otra conexión; repetir y comprobar recuperación del cliente. Cubrir también adquisición/conexión sin respuesta con un simulador TCP local o fixture equivalente, respuesta HTTP acotada y cero acumulación de operaciones. Los mocks del reloj/controlador no demuestran cancelación del servidor. Si la topología no transmite options, usar la alternativa SET LOCAL y documentar esa elección antes de integrar.

## Espejo y reservas de implementación

**Se rechaza la excepción del preflight al espejo por falta de consumidor UI.** AGENTS.md §1 exige actualizar ambos lados si se toca un DTO; el alcance de `02-backend.md` incluye esa excepción explícita de escritura. Si se agrega un DTO/tipo público `ReadinessResponse`, reservar y duplicar su forma mínima en `frontend/types/api.ts` en la misma entrega, aunque no haya pantalla ni cliente HTTP nuevo. No agregar UI, fetch o schema de validación sin consumo. No eludir esta regla renombrando el DTO como interface.

Reservar luego del handoff: controller y sus specs; helper/service DB y specs; servicio visual/lifecycle specs y worker IPC; `cards.module.ts` para exportar el singleton; API/testing docs; espejo `frontend/types/api.ts`; HTTP specs aislados si hacen falta. Docker/Compose/manifiestos son INF-02. Los archivos visuales y tipos frontend ya tienen cambios locales: inspeccionar hunks y coordinar un solo escritor. Sin reset/stash/stage.

## Gate para la siguiente fase

El handoff [INF-01-review](INF-01-review.md) fija consumo interno por gateway, gate inicial antes de tráfico, retirada/reincorporación, startup fail-fast DB y validación visual no bloqueante, scanner activo para el piloto y artefactos inmutables/read-only por versión. La compatibilidad nativa real queda como prueba INF-02, sin impedir escribir BE-03. Presupuesto, hardware comprado, dominio/cuentas y contratación son elecciones/datos humanos pendientes de DEC-06; no bloquean resolver este contrato ni preparar implementación local aislada. No implican autorización de despliegue o compra.

Con el handoff consolidado, el coordinador puede reservar **implementación BE-03 por Luna**, con revisión/correcciones Sol HIGH. Verificaciones enfocadas necesarias: warmup sin embedding, transición frío→ready sin tráfico, fallo/reintento sin probes, cancelación/restart y eventos de generaciones viejas, apagado/shutdown sin worker/timer, busy informativo, probes repetidos sin inicialización, DB caída/timeout/recuperación y ausencia de queries pendientes, status 200/503 y allowlist sin secretos; regresiones de health/identify. Son pruebas futuras, no ejecutadas aquí.

Sólo al final del lote de operación: revisión de integración, `pnpm run stop`, `pnpm run check` global y flujo real aislado correspondiente. No afirmar que INF-01 o BE-03 quedaron completos por aceptar esta preparación.
