# LOTE-REDIS — revalidación global autorizada

Fecha: 2026-10-09. Run: `be07-global-469af22a0f8f`. Responsable: Sol 6.1 HIGH, reserva única del runtime y evidencia; root consolida los registros y decide el cierre BE-07.

**Resultado: gate global e integración Redis verdes.** Pedido humano vigente: «bueno, avanza entonces con la validacion global». Esta autorización reemplaza el límite focal anterior para esta ejecución. No se repitió el check ni se modificó app, specs, configuración o paquetes.

## Check estándar

`pnpm run stop`, seguido por `pnpm run check` **exacto desde la raíz**, Node 22.20.0 / pnpm 10.17.1. PostgreSQL clonado propio mediante `DATABASE_URL_TEST` y `DATABASE_URL`; Redis propio. Sin `NODE_OPTIONS`, flags para desactivar worker/crons ni configuración alternativa en el lanzamiento global. Los flags heredados y seleccionados de `.env` constan en [entorno](LOTE-REDIS-revalidacion-global-anexos/selected-global-environment-flags.json).

| Etapa | Resultado |
|---|---|
| Lint backend/frontend y guards frontend | Verde |
| Typecheck backend/frontend | Verde |
| Backend Vitest | 405/405, 29 archivos, incluido `readiness.http.spec.ts` |
| Scripts backend | 13/13, 0 skipped |
| E2E backend | 6/6, 2 archivos |
| Frontend Vitest | 486/486, 59 archivos |
| Total estándar | **910/910, 0 skipped** |
| Build Nest + Next Turbopack | Ambos verdes, estrategia actual `workerThreads` |

Check PID 20637, 19:42:21.862–19:43:42.022 UTC, exit 0. [Log completo](LOTE-REDIS-revalidacion-global-anexos/check-standard.log), [resultado](LOTE-REDIS-revalidacion-global-anexos/check-result.json) y [stop](LOTE-REDIS-revalidacion-global-anexos/stop-before-check.log). El pase actual no localiza ni demuestra arreglada la causa del `socket hang up` histórico; esas evidencias quedan preservadas.

## Matriz integrada sobre los outputs de ese check

API `backend/dist/main.js` + Next start sobre `.next` recién generado. Sólo en este runtime aislado: scanner, worker de precios y tres crons apagados para evitar proveedores; sin cambio permanente. Un guard externo del runner permitió fetch de loopback y rechazaba hosts externos: **0 intentos fetch externos de Node observados**. Esta evidencia no pretende auditar todas las posibles APIs de red del sistema.

API PID **21371**, nonce `be07-global-469af22a0f8f-api-one-process`; Next 21384 y proxy 21364. Mismos procesos vivos/listeners al final. Redis ID `06e0661bf4edda67fc9e6207fb4d39719e27a382bf6e9b06887fc050336b5d31` se conservó hasta completar la matriz. Corte TCP propio 127.0.0.1:56392 → Redis 127.0.0.1:56391; nunca se apagó ni recreó Redis para probar caché caliente.

| Caso real | Evidencia obtenida |
|---|---|
| Arranque con proxy Redis inaccesible | API arrancó, readiness HTTP 200 `ready`, `degraded:true`; PostgreSQL listo; health Redis no disponible |
| Persistencia/reconexión startup | 4 conexiones rechazadas adicionales; recuperación mismo PID/nonce, 14.994 ms desde habilitar proxy |
| Auth propia | Registro/login reales, cookie refresh y bearer; 401 sin auth y 404 para dueño ajeno; logout 200 con `success:true` y cookie borrada |
| Calentamiento | Precio USD + conversión ARS sintética cacheada; tres shares, DTO público permitido y SSR real |
| Corte sostenido posterior | `ready → degraded → ready`, otras 4 conexiones rechazadas; recuperación mismo PID/nonce en 7.957 ms |
| Fallback PostgreSQL | Precio fixture cambiado de 10 a 17 USD en PG; API de carta, items, stats, share y SSR mostraron referencia actual; 5–19 ms en las seis lecturas muestreadas |
| ARS desconocido durante corte | USD conservado, sin `conversion` ni `priceArs`; sin consulta FX |
| Revocación con caché caliente | DELETE autenticado 204 durante corte; GET público 404 tanto degradado como recuperado, pese al payload anterior aún presente |
| Vencimiento con caché caliente | Inyección controlada `expiresAt` pasado en PG sobre fixture antes válida; misma denegación 404 con caché anterior presente |
| SSR y metadata de links denegados | HTTP 200 de la página genérica/indisponible, `no-store` y `noindex`; sin nombres/cartas/datos privados protegidos, también con User-Agent de bot |
| Recuperación de caché | Tres hashes de payload idénticos durante corte y antes del primer GET recuperado; validación PG impidió revivir revocado/vencido; share válido SSR y ARS cacheado disponibles |
| Jobs propios | Un job fixture pendiente, attempts 0; no ejecutado |

**34 aserciones integradas pasaron**, separadas de las 910 pruebas estándar. [Resultado detallado](LOTE-REDIS-revalidacion-global-anexos/runtime-results.json), [log](LOTE-REDIS-revalidacion-global-anexos/runtime-flow.log), [API](LOTE-REDIS-revalidacion-global-anexos/api-runtime.log) y [Next](LOTE-REDIS-revalidacion-global-anexos/web-runtime.log).

La prueba de vencimiento usa una **stale fixture inyectada**, no espera un día ni acredita comportamiento del reloj/TTL completo. La fuente autoritativa PG y la presencia del caché viejo se verificaron con hashes. Los tiempos son observaciones de esta ejecución local, no garantías de producción. Scanner figuró `disabled`; no se volvió a ensayar reconocimiento, temas o viewports ya aceptados.

## Incidente del runner y preservación

Intento runtime 1: error de sintaxis en mi adaptación de la aserción logout, antes de importar/ejecutar el flujo HTTP o crear fixtures. Los tres procesos arrancados se retiraron con verificación de PID, padre y listener. [Intento 1 preservado](LOTE-REDIS-revalidacion-global-anexos/runtime-attempt-1/runtime-flow.log). Se corrigió **sólo el helper reservado**, `node --check` pasó y se ejecutó la matriz completa del intento 2. No se repitió `pnpm run check` ni se cambió la app para obtener verde.

## Ownership, integridad y cleanup

DB desechable `be07_global_469af22a0f8f_test`, clon del catálogo TEST existente, comentario exacto `be07-global-469af22a0f8f-owned`, owner `pokemon`. Redis propio: label `gate.owner=be07-global-469af22a0f8f`, bind loopback, `/data` tmpfs, sin volumen, snapshots ni appendonly. No migrate dev, FLUSHDB compartido, deploy, correo ni proveedores reales.

Fixture exacta retirada: 2 users (relaciones en cascade), 1 price, 1 job, 1 card y 1 set. Procesos detenidos por PID/parent/comando/listener propios; proxy cerró sockets y servidor, `liveSockets:0`. DB retirada después de verificar comentario/owner y **0 conexiones**; Redis retirado por full ID/label/bind. [Ownership final](LOTE-REDIS-revalidacion-global-anexos/ownership.json), [cleanup fixture](LOTE-REDIS-revalidacion-global-anexos/fixture-cleanup.json) y [proxy](LOTE-REDIS-revalidacion-global-anexos/proxy-stats.json).

Conteos antes/después de dev/TEST idénticos: dev cards20670/sets176/migrations11/users22/collections22/items69/shares13/prices29325/jobs18721/snapshots1/GIN5; TEST cards20670/sets176/migrations11/users2/collections3/items2/shares1/prices188/jobs0/snapshots0/GIN5. IDs Postgres/devRedis originales idénticos y saludables. Es una comparación **acotada de conteos e identidad de infraestructura**, no snapshot de cada fila. [Inventario antes](LOTE-REDIS-revalidacion-global-anexos/source-inventory-before.json) y [después](LOTE-REDIS-revalidacion-global-anexos/source-inventory-after.json).

Puertos3000/3001/56391/56392 libres. **501 hashes de fuentes/spec/settings sin cambios** entre baseline y cierre. Outputs compilados usados por runtime conservan sus hashes: backend277 y Next2082 archivos, sin agregados/eliminados/cambios durante el runtime. [Integridad final](LOTE-REDIS-revalidacion-global-anexos/final-integrity.json). Los outputs previos al nuevo build fueron copiados íntegros con symlinks al staging privado `/private/tmp/be07-global-469af22a0f8f/received-backend-dist` y `received-next`; manifests recibidos en anexos. La evidencia histórica no se sobrescribió.

Entrega del gate disponible para aceptación y cierre **por root**; esta reserva no modifica planes/registro/estado ni cierra IDs. [Evidencia consolidada](LOTE-REDIS-revalidacion-global-evidencia.json) y [hashes finales](LOTE-REDIS-revalidacion-global-anexos/artifact-sha256.json). Reserva de suites/runtime/infra liberada al entregar.
