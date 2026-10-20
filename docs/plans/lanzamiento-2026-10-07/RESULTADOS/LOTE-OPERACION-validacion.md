# Lote operación — validación integrada local

Fecha: 2026-10-08. Estado: **gate técnico local aprobado y consolidado; lote local cerrado**.

Entradas: INF-01 propuesta técnica, BE-03 readiness, FE-08 base SSR privada,
INF-02 packaging/runtime y INF-03 backup/restore local. Host/dominio/presupuesto
y destino off-host permanecen pendientes humanos; este gate no acredita
despliegue productivo ni recuperación ante pérdida del host.

Revisión/corrección: GPT-6.1 Sol HIGH. Coordinador único escritor de registro y
planes; escritores y suites DB/Redis serializados.

## Criterios de cierre local

- [x] Entregas enfocadas revisadas y reservas previas liberadas.
- [x] Integración API/web contra DB sintética restaurada: cantidades, atributos,
  UUIDs y ownership; replay de operación válida restaurada sin duplicación,
  conflicto de payload y nueva intención comprobados en SQL.
- [x] Readiness DB/Redis con scanner desactivado para este flujo; liveness,
  errores de autenticación/ownership y contratos preservados. DINOv2 real ya
  acreditado por INF-02, sin atribuir precisión a la fixture.
- [x] API pública/SSR usan allowlist, no-store/noindex y base SSR privada;
  revocación/reactivación/vencimiento con cachés calientes y sin filtración.
- [x] Suites infra enfocadas que no están incluidas en check de raíz.
- [x] `pnpm run stop` y `SCANNER_VISUAL_ENABLED=0 pnpm run check` completo en verde.
- [x] Cleanup de recursos/datos/secretos temporales propios y stack dev preservado.
- [x] Coordinación consolidó checklist/registro/planes; evidencia y límites entregados. BE-03/FE-08/INF-02 completadas localmente; INF-01/INF-03 conservan fases humanas/operación pendientes. Próximo lote BE-04/UX-03/FE-03; sin reservas activas.

La huella pública y el restore local no equivalen a un backup off-host ni
garantizan RPO/RTO. El flujo HTTP/SSR no acredita UI interactiva, teléfonos,
cámara, fotos consentidas, precisión o participantes. El check de raíz tipa
frontend y hace build Nest; no se presenta como un `tsc` amplio de todos los
specs backend. No se cierra el gate por declaraciones ni por resultados de
versiones anteriores.

## Integración real verificada

[Evidencia del recorrido](LOTE-OPERACION-integracion.json), run
`inf03-081247bac221`, **12:47:25.669–12:47:54.192 UTC**, y
[resumen del gate](LOTE-OPERACION-evidencia.json). Se ejecutó:

```sh
pnpm run stop
pnpm exec node scripts/inf03-smoke.mjs --download-tools --app-flow
```

El modo opcional agrega antes del dump otra operación con UUID y SHA-256 del
payload canónico, una nota privada sintética y un icono local. Conserva la fila
de idempotencia legado; no cambia la semántica ni la evidencia del modo habitual.
Se preservaron además [JSON focused beb6](INF-03-focused-beb6-evidencia.json) y
[reporte focused beb6](INF-03-focused-beb6-implementacion.md) mediante copias
exclusivas. `INF-03-evidencia.json`, su reporte y toda la evidencia INF-02 siguen
intactos. El nuevo modo escribe un JSON separado.

Primero se destruyó el origen propio después de confirmar ciphertext/recibo,
se autenticó age completo y se restauró en otro PostgreSQL vacío con rol
limitado. **1 positivo, 16 negativos de prevalidación, cero pg_restore durante
esos negativos y dos invocaciones SQL totales**: fallo controlado y positivo.
Dump **342351 B**, ciphertext **347416 B**, cinco chunks completos; age directo
produjo **327680 B** parciales y exit1 al alterar y truncar el final. Pasaron
checksums de 11 migraciones, comparación completa de los conjuntos de fixtures,
commit posterior excluido, 5 GIN y 33 constraints public. Son escenarios del
nuevo run, no una suma de los anteriores ni RPO/RTO.

Después de pasar las guardas y comprobar los datos, se unieron API/web/Redis
propios al destino. API y Redis sólo usaron la red interna; web tuvo una red
de ingreso propia y bind `127.0.0.1:63068`. La API no publicó puertos. Las
guardas originales de restore no se relajaron para admitir consumidores.

| Contrato/consumidor | Resultado observado y exigido |
|---|---|
| BE-03 | Liveness200; readiness200/no-store, DTO allowlist, DB/Redis ready, scanner disabled, degraded=false. |
| Restauración privada | UUIDs originales y dos grupos: normal/NM cantidad2 con nota privada; holofoil/LP cantidad3 y para intercambio. |
| Auth/ownership | Sin JWT401; otra cuenta obtuvo404 en GET/POST colección y PATCH/DELETE share. Snapshot SQL de cantidad/actividad intacto. |
| Replay restaurado | Misma UUID/payload retornó201, mismo item y cantidad2; DB conservó2/3. Cambiar cantidad con esa UUID produjo409. |
| Nueva intención | Otra UUID/cantidad1 retornó201; DB quedó3/3. Dos operaciones válidas referencian el mismo item, con hashes exactos. |
| Público | API200/no-store; allowlist top/item/stats, notas/email/hash/IDs privados ausentes; total6/grupos2, valor desconocido null. |
| FE-08/SSR | Share200 con colección/carta, noindex y sin hostname privado; carta200 desde base privada. Web loopback200. 44 archivos `.next/static` sin hostname privado ni env interna. |
| Revocación/reactivación | API y Next calentados; dueño DELETE204 → API404/no-store y nueva SSR genérica sin título/datos/metadatos protegidos. PATCH del dueño reactivó200 y público/SSR volvieron a entregar el recurso. |
| Expiración | Con key Redis todavía presente, SQL propio llevó expiresAt al pasado. API404/no-store y SSR genérica/noindex; key seguía caliente después del rechazo. |

Pasaron **28 comprobaciones API/SSR/SQL**. Los estados terminales de Next
aceptan200 genérico o404 si no entregan payload ni metadata protegida, según
DEC-02; no se exige404 a una página que utiliza streaming. La expiración se
forzó sólo en el link propio porque el DTO admite días, no segundos.

Los JWT HS256 eran sintéticos; passwordHash sigue siendo fixture y no se probó
login ni Argon2 aquí. El SSR del gate utiliza HTTP loopback y transporte interno;
la configuración de sesiones declara origen HTTPS para conservar el guard de
production. HTTPS/cookies/auth reales y DINOv2 scanner=1 permanecen acreditados
por INF-02, sin repetir warmup, rebuild ni atribuirlos a este escenario.

Queue/crons apagados, API en red interna, **0 filas de precio, 1 job propio
pending y 0 jobs ejecutados**. El replay puede encolar precio; ese job se retiró
con la DB descartable. No se hicieron requests reales a proveedores ni se
leyeron datos de desarrollo, fotos o inventario del usuario.

## Imágenes, revisión y correcciones del harness

Se reusaron los IDs exactos aceptados de INF-02:

- Backend `sha256:1e92edf09a920cf1e42017644cf054a11b90b20d2d54ef6bf41dd58dd6c647f3`, Created **2026-10-08 00:17:55.993 UTC**.
- Frontend `sha256:c89a6a501f8929b82ff562c8b3e06e8337f6d53beaf0f744bd0395e6d8241c5f`, Created **2026-10-07 23:54:05.469 UTC**.

[Registro de fuentes](LOTE-OPERACION-runtime-fuentes.json): antes del gate, el
latest mtime de los árboles app/FE-08/BE-03 era anterior al build correspondiente
(backend/src23:00:27, scripts22:40:23, prisma12:53:57; frontend/lib23:34:22,
types22:41:48, app19:22:01, components19:50:21 del7/10). Ésta es evidencia
razonable de continuidad junto con los mismos IDs y la entrega INF-02, no una
attestation por digest de un snapshot de fuente anterior. El Dockerfile frontend
tiene metadata posterior a su imagen cacheada: se conservó la imagen real ya
revisada por INF-02, sin presentar un rebuild del Dockerfile actual. El único
archivo backend posterior modificado aquí fue un test, sin impacto runtime.

Se preservan tres intentos fallidos del harness:

- [Intento1](LOTE-OPERACION-intento-1.json), `inf03-5cc1defa3e75`: guarda frontend esperaba bind sobre una única red Internal. Se corrigió agregando ingress propio, validando dos redes exactas sólo para web. Cleanup fallback retiró todos los recursos; no pasaron checks del consumidor.
- [Intento2](LOTE-OPERACION-intento-2.json), `inf03-26f0e40e5278`: backend no arrancó, porque el helper declaraba CORS/FRONTEND HTTP en production; cleanup completo.
- [Intento3](LOTE-OPERACION-intento-3.json), `inf03-f73bad678a85`: diagnóstico sanitizado confirmó backend exit1 y otros consumidores running, con cleanup completo. La lectura de `readJwtSecret()` identificó el requisito HTTPS; se corrigió sólo el env del harness.

Ninguno se cuenta como éxito del consumidor. Se añadieron clasificación de
errores sin stderr crudo y diagnóstico de estado/categorías sin secretos. No
hubo cambio de producción, DTO ni consumidor frontend para satisfacer el gate.

## Suites y check global

```sh
pnpm exec node --test scripts/infra/inf02-runtime.test.mjs scripts/inf03-app-flow.test.mjs
pnpm run stop
SCANNER_VISUAL_ENABLED=0 REDIS_URL=redis://localhost:6379/15 pnpm run check
```

Suite enfocada final: **50/50, cero fallos/skips** =45 INF-02 y5 del helper.
[Log final](LOTE-OPERACION-infra-tests-escalated.log). El intento sin escalación
pasó42 y falló8 por `listen EPERM` del sandbox; [se conserva](LOTE-OPERACION-infra-tests.log).
El rerun autorizado habilitó los binds loopback. No se cambió INF-02 ni se
volvió a ejecutar su smoke completo.

El primer global terminó con **376/377 tests backend**: el test existente
“sin REDIS_URL” construía un servicio sin URL de ConfigService, pero heredaba
`process.env.REDIS_URL` del runner. [Intento preservado](LOTE-OPERACION-check-intento-1.log).
Con microreserva explícita, se cambió solamente ese caso de
`backend/src/redis/redis.service.spec.ts`: aislar la variable, cerrar el servicio
y restaurar exactamente el entorno en finally, también ante una assertion fallida.
RedisService de producción permanece intacto. [Focal11/11](LOTE-OPERACION-redis-focal.log)
y [lint backend](LOTE-OPERACION-redis-lint.log) pasaron antes del rerun.

**Check global final exit0**, [log completo](LOTE-OPERACION-check.log):

| Suite | Pasadas | Skips |
|---|---:|---:|
| Backend Vitest · 25 archivos | 377 | 0 |
| Backend scripts Node | 13 | 0 |
| Backend e2e · 2 archivos | 6 | 0 |
| Frontend Vitest · 56 archivos | 458 | 0 |
| **Total del check** | **854** | **0** |

Lint backend/frontend, guards de colores/URLs, typecheck frontend y builds
Nest/Next pasaron. Los11 focales están incluidos en377, y los50 infra son una
suite adicional: no se suman ni se presentan como nuevos casos globales. No se
ejecutó un `tsc` amplio de specs backend ni se repitió global después de cambios
exclusivamente documentales o cleanup de fixtures. Runtime Node22.20.0,
pnpm10.17.1, macOSARM64. No se cambiaron versiones, packages, locks ni migraciones.

## Aislamiento y cleanup final

El resolver real confirmó `pokemon_cards_test`, distinto de desarrollo, local
55432. Redis15 estaba vacío antes del primer global, tras su fallo, antes del
rerun y al final; no hubo FLUSHDB ni acceso a Redis0.

Helper retiró API/web/Redis después de verificar IDs/imágenes/labels/mounts/binds,
retiró ingress propio y acreditó que destination-net volvió a tener sólo PG.
La guarda original de destino pasó de nuevo. El runner retiró después DBs,
volúmenes, redes y staging host/contendedor. Verificación final independiente:
cero recursos INF-03 con labels, cero temporales de los cuatro runs del gate;
puertos3000/3001/63068 libres. IDs shared idénticos y healthy:
`pokemon-scanner-db 18aa2f693752` y `pokemon-scanner-redis f2d2ca0ad580`.

Después del check DBtest tenía **5 usuarios, 3 colecciones, 0 operaciones y
5 GIN válidos**. El afterAll de Friends sólo limpia cartas y dejó sus tres
cuentas constantes. Se retiraron únicamente los pares exactos
friends-user-a/friendalpha, friends-user-b/friendbravo y friends-user-c/friendcharlie
(emails@test.local), en transacción con guard `current_database`, conteo previo3
y count de IDs devueltos internamente3. No se publicaron UUIDs/filas privadas.
Quedaron **2 usuarios, 3 colecciones, 0 operaciones y cero cuentas@test.local**;
se preservaron todas las otras filas. No había snapshot de filas anterior a
la suite y no se afirma que DBtest haya quedado vacía. Conteos posteriores:
cero cartas test-friends y cero jobs con prefijo test-. No se editó Friends spec.

Los dumps/ciphertexts/tars/pgpass/identidades age/envs/counters y fotos sintéticas
temporales ya no existen. Las imágenes cacheadas permanecen para reuso; no se
afirma limpieza de toda la caché Docker. Fuentes scanner y artefactos INF-02 no
se tocaron. Se liberan writer, Docker, DB y suites al coordinador, que conserva
la consolidación de planes/registro y decide el siguiente lote.

Host/dominio/presupuesto, destino off-host, retención/calendario/alertas/claves
duraderas y recuperación por pérdida del host permanecen pendientes humanos.
INF-01/INF-03 completos y beta operativa no se cierran por este gate local.
No acredita UI interactiva, dispositivos físicos, fotos consentidas, accuracy,
participantes, carga prolongada ni RPO/RTO productivos.
