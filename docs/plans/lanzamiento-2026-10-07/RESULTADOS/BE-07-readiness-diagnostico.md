# BE-07 — diagnóstico focal de `socket hang up`

2026-10-09 · Sol 6.1 HIGH. **Causa original no localizada; BE-07 y su gate siguen abiertos.** No se cambió producto, spec, configuración permanente, paquetes, `node_modules` ni outputs de build. No se ejecutó un nuevo global estándar ni la suite backend 405 propuesta. La decisión humana final fue **«Continuar sólo con el diagnóstico focal»**; no queda una consulta de permiso pendiente.

## Hallazgos que sí sostiene la evidencia

El fallo recibido del segundo estándar ocurrió en el cuarto caso de `readiness.http.spec.ts`, «scanner ocupado conserva HTTP 200 y deja busy como dato informativo»: `socket hang up`, sin respuesta HTTP. Ese archivo simula Redis, PostgreSQL y scanner. No se atribuye el incidente a una dependencia real ni se acredita recuperación Redis.

El spec original instrumentado entrega cinco respuestas `200,200,503,200,200` y abre/cierra el mismo servidor por cada request. En sus cinco requests, `agentKeepAlive=false`, `reusedSocket=false` y `Connection: close`. Eso confirma ausencia de pooling en los ensayos observados; no reconstruye el socket del incidente histórico.

El cierre del cliente anterior ocurre **después** del siguiente `listen` del mismo servidor. Se observó en los cuatro pares del spec original y en todos los 480 pares de la comparación acotada, sin falla. La comparación con `setImmediate` conserva ese orden en sus 240 pares. **Ese solapamiento observado no demuestra la causa y `setImmediate` no sustenta una corrección.** No se forzaron cierres, resets ni demoras de respuesta para fabricar el error.

La lectura del Node 22.20.0 instalado muestra que `setupConnectionsTracking` conserva `ConnectionsList` por servidor y limpia el intervalo anterior antes de rearmarlo; `Server.close` llama a `closeIdleConnections` antes de `net.Server.close`. No hay evidencia en estas trazas de un timeout viejo activo por relisten. Vitest instalado usa `isolate=true` y pool `forks` por omisión, con runners independientes para tareas aisladas; no se alteró esa configuración. Esa lectura reduce la plausibilidad de atribuir el incidente a una fuga de fake timers entre archivos, pero no descarta una carrera nativa no observada.

## Ejecuciones y límites

| Ejecución | Resultado y alcance |
|---|---|
| Spec original + observer buffered inicial, dentro del sandbox | Cuatro fallos por dirección nula al construir URL; la traza captura `server-error=EPERM` en `listen`. Limitación de bind distinta del incidente `socket hang up`; no prueba una regresión |
| Mismo spec fuera del sandbox, apertura autorizada de sockets | 4/4. El worker terminó sin disparar el flush `exit` del observer; no se presenta como captura de lifecycle completa |
| Spec original + log incremental | 4/4; 92 eventos, cinco listens/requests/respuestas y seis cierres de servidor, incluidos `app.close()` |
| Secuencia exacta + despacho inmediato | 60 ciclos nuevos de app, 300 requests; cero fallos |
| Secuencia exacta + `setImmediate` | 60 ciclos nuevos de app, 300 requests; cero fallos; el cruce entre client-close y siguiente listen sigue presente |
| Último control: spec original + buffer en memoria/flush `afterAll` temporal | 4/4; 89 eventos, cinco respuestas y seis server-close. El flush precede al último client-close; no se afirma que esa traza contenga el cierre final del cliente |
| Suite backend instrumentada 405 | **No ejecutada:** rechazo de revisión automática, sin retry directo ni indirecto |

Antes de cada ejecución se corrió `pnpm run stop`. Se conservaron Node 22.20.0, pnpm 10.17.1, defaults, guards, assertions, timeouts y versiones. El último control hereda `backend/vitest.config.ts` mediante un config temporal fuera del repositorio y sólo agrega un hook de flush. El spec original se leyó sin transformarlo ni editarlo. Los observers registran stacks y eventos; el incremental escribe al filesystem durante los requests y puede cambiar el timing. El control buffered evita esas escrituras, pero la instrumentación aún tiene costo y tampoco reproduce el contexto global.

La comparación de 600 requests usa el controller compilado existente, Nest, throttler y los mismos dobles; cada ciclo reproduce `ready/disabled → ready/disabled → unavailable/incompatible → health → ready/busy`. Comprueba cuerpos exactos, status y `no-store`. Sus 120 servidores se cerraron; PID 14096 terminó exit0. No corre el runner Vitest ni las otras 28 suites. No se suman esos requests ni los focales al gate: el resultado vigente continúa siendo backend 404/405 en el segundo estándar, con builds y API/web pendientes.

## Rechazo y cleanup

La revisión automática rechazó `pnpm --dir backend exec vitest run` instrumentado con esta razón literal: «Aunque usa recursos propios, `vitest run` ejecuta toda la suite backend en lugar de la única suite diagnóstica autorizada, excediendo explícitamente el alcance y pudiendo mutar ampliamente el clon TEST.» La [acción completa y rechazo](BE-07-readiness-diagnostico-anexos/auto-review-rejection.json) están preservados. No existe log de esa suite porque el proceso nunca se creó. Después de informar el rechazo, root consultó una vez al usuario y transmitió su decisión de continuar sólo focal. No se busca eludir esa decisión.

Los recursos nuevos se crearon para ese intento contextual y se retiraron inmediatamente tras el rechazo, antes del harness focal posterior:

- Clon `be07_readiness_diagnostico_sol_20261009_test`, desde TEST; comentario exacto `be07-readiness-diagnostico-sol-20261009-owned`, propietario `pokemon`, PostgreSQL fullID `18aa2f6937521ae010930ae98cbee45f2fa435b554c65cf90daaffba0c641ba8`. Comentario/propietario verificados y **0 conexiones** antes de DROP; ausencia posterior comprobada.
- Redis propio fullID `c5a6a0b72d5c719527026e4487f565d08491d44103341e70857fe2a79c3f80c2`, nombre `be07-readiness-diagnostico-sol-20261009-redis`, label `gate.owner=be07-readiness-diagnostico-sol-20261009`, bind `127.0.0.1:56385`, tmpfs `/data`, sin volúmenes anónimos ni persistencia. FullID/nombre/label/bind verificados antes de stop/rm; ausencia posterior comprobada.

Conteos agregados dev y TEST e IDs/health de los contenedores fuente coinciden antes/después; no es un snapshot de todas sus filas. No hubo FLUSHDB compartido, uso de DB/Redis dev por las pruebas ni reutilización de recursos retirados de la ronda anterior. El harness posterior no necesita DB/Redis reales y sólo abre sockets propios efímeros. Puertos 3000/3001/56385 libres al cierre; recursos propios activos **0**. Ownership y logs exactos en los anexos.

Baseline propio tomado antes de crear recursos: **451 archivos** sin cambios al final. Además se cotejó el manifest recibido de **501 fuentes** y las **277 salidas dist**: cero mismatches. No reset, stash, stage, commit ni cambios de producto. La única escritura en el repositorio de esta fase son este reporte, su evidencia y anexos nuevos; los documentos centrales siguen a cargo de root.

## Propuesta y siguiente paso

**No hay corrección justificada para aprobar ahora.** No cambiar a escucha estable, agregar `setImmediate`, ampliar timeouts, skips o modificar dependencias sólo porque los focales pasan. La comparación capturó un orden de eventos normal que también pasa en el control menos invasivo; no lo convierte en causa histórica.

Un siguiente control focal sólo tendría sentido con una pregunta nueva verificable: capturar `clientError` del HTTP server, parser/aborted y bytes leídos/escritos junto al socket que falla, para distinguir un reset antes de que el parser reciba el request de un cierre posterior a la respuesta. Se puede preparar esa observación buffered sobre el spec original sin datos ni cierres artificiales. **No se ejecutó ni se propone repetir ciclos indiscriminadamente**: sin reaparecer el error o nueva diferencia contextual, esos datos tampoco localizarían la causa. La suite contextual 405 queda fuera de la autorización humana vigente, y no se vuelve a pedirla en esta entrega.

Reserva propia de suites/runtime liberada al entregar. El coordinador decide la próxima fase dentro del alcance focal; esta entrega no habilita specfix ni global especulativo, ni cierra BE-07.

[Evidencia estructurada y hashes](BE-07-readiness-diagnostico-evidencia.json) · [Resumen de trazas](BE-07-readiness-diagnostico-anexos/trace-summary.json) · [Ensayo acotado](BE-07-readiness-diagnostico-anexos/lifecycle-sequence-comparison.json) · [Preservación](BE-07-readiness-diagnostico-anexos/source-preservation.json).
