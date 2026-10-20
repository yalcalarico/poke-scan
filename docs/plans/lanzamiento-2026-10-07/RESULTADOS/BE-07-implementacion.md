# BE-07 — Recuperación de Redis

Fecha: 2026-10-09 · Implementación local Luna · Revisión Sol HIGH y gate integrado pendientes.

## Resultado

Se corrigió la terminación de reconexiones que causaba `retryStrategy(times > 3) => null`. Redis ahora reintenta indefinidamente con backoff exponencial limitado a 15 s. Se conservan `enableOfflineQueue: false` y `maxRetriesPerRequest: 1`: un request sin Redis recibe un cache miss inmediato, sin comandos diferidos para replay.

`RedisService` pasa a degradado en `close`, `reconnecting` y `end`, y vuelve a disponible en `ready`. El cierre marca el cliente como apagado, quita sus listeners y llama `disconnect()` para cancelar el timer de ioredis sin esperar una respuesta de Redis. Los logs de conexión y comandos ya no incluyen URL, mensajes crudos de error ni keys.

## Reproducción anterior

Se usó el contenedor aislado BE-07 con Redis detenido. El harness de [reproducción pre-fix](BE-07-evidencia/legacy-retry-repro.mjs) aplica exactamente la estrategia recibida y los flags vigentes. Observación real de ioredis 6.0.0:

```text
reconnecting #1 500 ms
reconnecting #2 1000 ms
reconnecting #3 1500 ms
end, status=end
```

La conexión terminó después del tercer intento, antes de restituir Redis. Así se confirmó que la falla del plan seguía vigente.

## Verificación con el fix

El [harness de recuperación](BE-07-evidencia/recovery-harness.mjs) mantuvo un único proceso Node con el `RedisService` compilado, sin Nest API, base de datos ni proveedores:

- Arranque con Redis apagado: el servicio se mantuvo degradado, con backoff `500, 1000, 2000, 4000, 8000 ms`; al quinto reintento seguía vivo. Tras restaurar Redis, el siguiente intento tuvo un máximo de `15000 ms` y el mismo proceso reportó `available: true`, `degradedSince: null`.
- Corte después de quedar sano: `reconnecting` actualizó el estado a degradado. Tras cuatro intentos fallidos y restaurar Redis, el proceso volvió a `available: true` y limpió `degradedSince` sin reiniciarse.
- Shutdown real con Redis conectado: SIGTERM al PID exacto `9528` produjo el estado final degradado esperado y el proceso salió; no quedó un timer de reconexión ni listener en el puerto del Redis temporal.
- El harness observó un aviso genérico de conexión y no imprimió URL, credenciales ni contenido de error. La prueba unitaria comprueba también que las claves no aparecen en avisos de comando.

Los scripts no contienen credenciales reales; la URL de integración es loopback y sin autenticación.

## Pruebas y checks

Después de `pnpm run stop`, el comando focal final fue:

```text
REDIS_URL=redis://127.0.0.1:56381/15 pnpm --dir backend exec vitest run src/redis/redis.recovery.spec.ts src/redis/redis.service.spec.ts
Test Files 2 passed (2)
Tests 16 passed (16)
```

Incluye cinco regresiones nuevas de política, estados, fallback sin comandos, logs sin secretos y shutdown/listeners; los once tests existentes de locks/degradación se ejecutaron contra el Redis propio. Una primera corrida desde sandbox omitió los tests de socket por `EPERM`; la repetición autorizada con red local alcanzó Redis. Una corrida intermedia encontró dos expectativas antiguas que filtraban por el texto crudo `WRONGTYPE`; se adaptaron al mensaje genérico y la corrida final pasó 16/16.

También pasaron `pnpm --dir backend run lint` y `pnpm --dir backend run build` (Nest). No corrí `pnpm run check` ni el gate de lote, según el scope de esta tarea.

## Aislamiento, ownership y cleanup

Antes de editar o crear recursos se guardaron hashes, copias del spec recibido y el diff dirty previo en [evidencia](BE-07-evidencia/). El spec ya tenía una modificación local que aísla `process.env.REDIS_URL`; se conservó y se extendió sin reemplazarla.

Redis fue un contenedor propio `redis:7-alpine`, ID completo `52712641e5de50bcfe13ce2d0d2be42a8ece9363ede523845be01d48190cae18`, labels `codex.owner=be07-20261009` y `codex.task=BE-07`, bind `127.0.0.1:56381` y `/data` en tmpfs. No se consultó ni mutó `pokemon-scanner-redis`, no se ejecutó `FLUSHDB`, y los specs focales no escribieron PostgreSQL. El contenedor fue eliminado por su ID completo; la consulta final no encontró contenedores con el label, listener en `56381` ni harness vivo. El output de [baseline](BE-07-evidencia/baseline.sha256) y el diff recibido son parte del recibo para Sol.

## Límites pendientes

La nueva suite de política usa un doble determinista de ioredis; el corte/restitución real quedó como ensayo reproducible aparte con Redis propio. No se ejercitó PostgreSQL porque `RedisService` solo devuelve cache misses y no espera ni encola; el fallback de datos sigue perteneciendo a los servicios consumidores. Esta entrega no cierra BE-07: faltan revisión Sol HIGH, gate estándar del lote y flujo API/web aislado final.
