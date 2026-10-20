# BE-07 — Revisión y corrección Sol HIGH

Fecha: 2026-10-09. **Fase enfocada aprobada; aceptación root y gate integrado pendientes.** No cierra el ID BE-07 ni acredita todavía el fallback PostgreSQL/API/web.

La entrega Luna corrigió el abandono después del tercer intento. Su reproducción previa y el ensayo de corte/restitución con Redis propio se preservaron. La revisión encontró cinco problemas adicionales y los corrigió exclusivamente en `RedisService` y su suite de recuperación; actualizó las secciones Redis de gotchas/testing.

## Hallazgos reproducidos y correcciones

| Hallazgo | Evidencia recibida | Corrección y regresión |
|---|---|---|
| Un comando ya enviado podía repetirse al recuperar, aunque la cola offline estuviera desactivada | ioredis 6.0.0 real sobre servidor RESP propio: un solo `service.set()` produjo **dos SET** tras perder su primera respuesta | `autoResendUnfulfilledCommands: false`; la prueba observa un solo SET, recuperación del mismo cliente y terminación de la promesa |
| Shutdown durante handshake podía dejar `connect()` pendiente | Con socket propio aceptado y handshake sin respuesta, quitar todos los listeners eliminó los `once(ready/close)` internos. La promesa no se resolvió/rechazó en la ventana de 3 s del test | Se conserva el ownership de listeners de ioredis; `disconnect()` cancela retries y los handlers del servicio ignoran eventos tardíos |
| `ready → close → callback then(connect)` podía borrar `degradedSince` después del corte | Doble con promesa controlada: `available=false` pero `degradedSince=null` | Los eventos gobiernan disponibilidad; `then` sólo loguea si el cliente sigue ready |
| Un rechazo anterior de `connect()` podía degradar una conexión recuperada | Doble: rechazo pendiente seguido de ready terminó `available=false` | `catch` no cambia disponibilidad y descarta el rechazo cuando el cliente ya está ready |
| Errores de comando suprimidos no actualizaban `lastErrorAt` | Dos GET fallidos separados por 1 s mostraron el timestamp del primero | El timestamp se actualiza antes del rate limit; los avisos siguen acotados por operación |

El primer ensayo completo de regresiones sobre Luna registró seis fallos. Uno era una expectativa demasiado fuerte del test —exigir `client.status=end` después de desconectar un cliente que ya estaba en `reconnecting`— y se corrigió sin modificar producción: en ese estado ioredis puede conservar el string anterior aunque haya cancelado su timer y no tenga socket. La regresión exige timer nulo, cero sockets y ausencia de nuevos intentos. El fallo de handshake se reprodujo después de esperar que el socket y los listeners internos estuvieran instalados. Los logs anteriores se conservaron, sin presentar esa expectativa del test como defecto de producto.

Los [fallos recibidos](BE-07-review-evidencia/received-regression-local.log) y la [reproducción específica de handshake](BE-07-review-evidencia/received-shutdown-handshake.log) preceden al cambio de producción. La primera corrida bloqueada por `listen EPERM` también se conserva como limitación histórica, sin acreditarla como integración. La prueba anterior de abandono y la evidencia original Luna no se reescribieron.

## Política y límites observados

Se conserva el backoff permanente de Luna: 500 ms, 1 s, 2 s, 4 s, 8 s y cap de 15 s. El cálculo limita el exponente antes de multiplicar, también para un contador muy grande. `enableOfflineQueue=false` y `maxRetriesPerRequest=1` permanecen.

**3 s es el límite por comando; 15 s es el máximo entre intentos de reconexión.** Una operación iniciada cuando el cliente no está ready retorna cache miss/no-op/lock no adquirido sin enviar comandos. Una operación que ya fue enviada puede esperar su respuesta hasta 3 s antes de devolver el fallback del `RedisService` (GET → null; SET/DEL → no-op; lock → false). Eso no demuestra que la escritura no se haya aplicado en el servidor. Se elimina su replay automático, sin prometer una reversión de lo que Redis haya recibido.

El timeout por comando también es necesario con `autoResendUnfulfilledCommands=false`: la fuente instalada descarta la cola previa al recuperar y una respuesta perdida podría dejar la promesa pendiente sin ese límite. La prueba real de blackhole verifica una espera entre 2,5 y 4 s para un GET sin respuesta y su resultado null. **El socket puede seguir ready:** el test exige `available=true` y `degradedSince=null`, con aviso de comando y `lastErrorAt`. Un WRONGTYPE o un timeout de comando no se equiparan con `close/reconnecting/end`; no se cambió readiness ni el contrato HTTP/DTO.

Los avisos no incluyen URL, key, payload ni mensaje crudo de error, y sólo salen una vez por minuto por operación con cuenta de suprimidos. Durante shutdown se ignoran tanto eventos como errores de comandos que estaban en vuelo. El cliente se asigna al servicio antes de iniciar `connect()` para conservar ownership aun si falla ese llamado.

## Auditoría de ioredis y shutdown

Se auditó la [fuente instalada, con hashes](BE-07-review-evidencia/ioredis-source-audit.json), sin actualizar paquetes. `readyHandler` maneja `prevCommandQueue` separadamente de `offlineQueue`; el default de auto replay es true. `_connect()` registra los listeners internos de promesa. `disconnect()` cancela el timer de reconexión y el connector cierra el socket, con un fallback interno de desconexión de 2 s; el módulo no espera una respuesta de Redis.

`silentEmit()` no es un `emit('error')` incondicional: ignora errores en end y ciertos errores durante cierre manual; otros podrían ir a stderr sin listeners. **No se reprodujo una filtración real de error tardío**, y no se afirma ese defecto. La corrección de no quitar todos los listeners se justifica por la promesa de handshake que sí quedó pendiente. Conservar el handler de error con guard de shutdown también mantiene cubiertos los callbacks tardíos.

Las pruebas reales observan shutdown durante handshake, reconnecting, ready y un GET en vuelo: la promesa inicial y el comando pendiente terminan, los sockets se cierran, el timer de reconexión queda nulo y no aparece un nuevo socket después de 600 ms. Vitest final no reportó errores sin manejar. Los tests cierran cada servidor TCP propio en `afterEach`. No se dejaron procesos harness ni un servidor de prueba persistente.

## Validación enfocada

Se ejecutó `pnpm run stop` antes de los specs. [Corrida final](BE-07-review-evidencia/focused-final-confirmed.log):

```text
REDIS_URL=redis://127.0.0.1:56382/15 pnpm --dir backend exec vitest run src/redis/redis.recovery.spec.ts src/redis/redis.service.spec.ts
Test Files 2 passed (2)
Tests 27 passed (27), 0 omitidos
```

Son 16 regresiones de recuperación, incluidas seis con ioredis/socket real, y los 11 tests existentes de Redis. Las pruebas existentes de locks/TTL/compare-and-delete y WRONGTYPE pasaron contra Redis privado real. `redis.service.spec.ts` se mantuvo byte a byte como se recibió, incluido el aislamiento previo de `process.env.REDIS_URL` y las expectativas de aviso genérico incorporadas por Luna.

Pasaron [lint sin warnings](BE-07-review-evidencia/backend-lint-clean.log) y [Nest build](BE-07-review-evidencia/backend-build-final.log). El warning de método sin bind en una versión intermedia del test fue corregido; sus logs se conservan. No se corrió `pnpm run check` global ni suite DB/API/web: ese gate pertenece a la próxima reserva y no se reemplaza por estos resultados.

## Preservación y recursos

Antes de editar se guardaron [dirty diff](BE-07-review-evidencia/received-diff.patch), status, copias de los cinco archivos reservados, manifiesto de 501 fuentes y hashes de toda la entrega/evidencia Luna. [Preservación final](BE-07-review-evidencia/source-preservation.json): **499/501 fuentes intactas**, con cambios sólo en RedisService y recuperación. Las dos docs reservadas cambian sus secciones Redis. Los originales de los cuatro archivos del baseline de Luna coinciden con sus hashes, y los 11 artefactos de su evidencia/reporte permanecen intactos.

Redis de revisión fue propio: ID completo `9b3f761949c7915487ad19e56fae3636ad088c9a639a7897500d7923123ab59a`, labels `codex.owner=be07-review-sol-20261009`, `codex.task=BE-07-review`, bind `127.0.0.1:56382`, `/data` tmpfs, sin snapshots ni appendonly. Antes de crear no había listener en 56382 ni PID 9528 vivo. El [cleanup](BE-07-review-evidencia/ownership-cleanup.json) verificó labels/bind por ID completo, DB15 con cero claves tras los specs, eliminación por ese ID y ausencia final de contenedor propio/listener. También corroboró que el contenedor Luna `52712641e5de50bcfe13ce2d0d2be42a8ece9363ede523845be01d48190cae18` ya no existe.

No se consultó ni escribió Redis de desarrollo, no se ejecutó FLUSHDB, no hubo mutaciones PostgreSQL ni requests a proveedores. Los sockets RESP fueron efímeros y del proceso Vitest propio. Los [hashes finales revisados](BE-07-review-evidencia/final-source.sha256) identifican esta fase.

**Reserva de revisión enfocada liberada.** Solicito aceptación root de estas correcciones antes de activar el único gate estándar y el flujo API/web aislado. Ese gate debe observar ready→degradado→ready después de más de tres intentos en el mismo proceso API, fallback PostgreSQL de consumidores durante el corte y recuperación, cachés/vigencia del flujo afectado y cleanup. El ensayo de Luna con `RedisService` compilado es antecedente de reconexión del servicio; no fue una API Nest ni prueba de fallback PostgreSQL.
