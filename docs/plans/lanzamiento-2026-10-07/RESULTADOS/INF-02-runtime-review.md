# INF-02 — revisión y correcciones del runtime

Fecha: 2026-10-08. Revisor/ejecutor de correcciones: GPT-6.1 Sol HIGH. Implementación original: Luna. **Dictamen: fase de packaging/runtime revisada con correcciones; habilita INF-03. Gate OPERACION_PENDIENTE.** No se cierra el ID ni el lote hasta su validación integrada.

Se revisaron AGENTS raíz/frontend, infraestructura, decisiones/orquestación, estado, BE-03 y FE-08; Dockerfiles/ignores, manifiestos, helpers y evidencia. Se preservaron cambios locales de negocio, schema/DTO, scanner, UI, API client, paquetes/locks y Compose de desarrollo. No hubo commit, reset, stage, deploy, compra, contacto externo, fotos guardadas ni requests a proveedores de precios.

## Hallazgos y correcciones

| Hallazgo | Corrección y evidencia |
|---|---|
| El modo single-reference original declaraba 1 pero copiaba 207 líneas. | Luna corrigió la escritura de una sola línea. Esta revisión verificó JSONL físico, conteo del manifest y HTTP autenticado `references=1`; se conserva la falla histórica. |
| Hashes coherentes no alcanzaban para garantizar semántica del bundle. | Verificador exige metadata/revisión/int8/384/model/preprocessing, vectores finitos y normalizados, IDs únicos y count real. Reject de payloads alterados incluso con hashes recalculados. Allowlist rechaza extras, fotos, traversal, pares incompletos, paths duplicados y symlinks. Se preservan nombres reales con Unicode/espacios. |
| Manifiesto confundía plataforma de construcción con la del runtime. | `buildHost={darwin,arm64}` y `target={linux,arm64}` separados. Start/recreate verifican destino contra imagen; nuevos hashes canónicos registrados abajo. |
| Request/intervalo del gate podían extender el plazo; HTTPS debía cubrir body además de conexión. | Deadline total finito en gate y helper HTTPS, con negativos de headers/body colgados. Gate exige scanner ready y no acepta disabled. Logs del probe sólo permiten estados conocidos. |
| Recreate podía reutilizar un gate exitoso de otra generación y abrir entrada antes de frontend sano. | Ownership verificado antes de mutar; bundle/arch verificados; gateway/frontend cerrados; gate anterior retirado; backend recreado y gate nuevo exit 0. Gateway depende de frontend healthy. Nueva generación observada en runtime final. |
| Redis de la imagen crea un VOLUME `/data` anónimo. La guarda inicial lo rechazaba; pasar a tmpfs dejó un volumen residual real. | Nuevo Compose usa tmpfs. Para legado, sólo Redis propio `/data`, nombre64hex, label Docker anonymous sin etiquetas ajenas y un consumidor exclusivo. Después de down, revalidar identidad y cero consumidores antes de quitar ese volumen exacto; verificar ausencia antes de borrar env. Regresiones rechazan shared/foreign-label/wrong-service. Residual bdb5 retirado con evidencia independiente; no se aceptó cualquier volumen anónimo. |
| El smoke último pedía HTTPS apenas Caddy había arrancado y recibió `socket hang up`. | Espera readonly de readiness HTTPS hasta 15 s, con verificación CA intacta. Rerun final pasó con generación distinta, HTTP200 y gateExit0. No se usa bypass TLS. |
| Interrupción del revisor anterior dejó stack sano y evidencia vacía de otro intento. | Se retomó sólo `inf02-review-bdb5fc199db0e1a7` después de env/labels/redes/volúmenes/mount verificados. Se añadió resume explícito y evidencia anterior conservada; cleanup se intenta en finally y persiste fallos. Si el proyecto no se retira, conserva mounts/env/CA para recuperarlo. El intento fallido y el vacío siguen en `previousAttempt`, no cuentan como éxito. |
| Helper de artefacto negativo creaba marker al final de la copia. | Marker original se crea antes de copiar y un fallo de construcción invoca scratch-cleanup con plazo finito; no fabrica markers retroactivos. Dos pruebas adicionales construyen missing/incompatible, exigen marker de origen, rechazo del verifier y cleanup propio sin tocar fuente. No se atribuye un ensayo de fallo de disco. |

El fallback ABI se apoya en el fallo real ONNX de Luna sobre Alpine ARM64 (`ld-linux-aarch64.so.1`/ERR_DLOPEN_FAILED). Se conserva backend Node22.20.0 Bookworm/glibc/OpenSSL y frontend Alpine; pnpm10.17.1. Esta revisión usó las imágenes existentes, sin repetir el build de backend/frontend; Compose materializó su imagen de migración desde cache para el proyecto nuevo. La evidencia de build previo queda en INF-02-implementacion y la ejecución nativa final se comprobó nuevamente.

## Verificación ejecutada

```sh
pnpm run stop
pnpm exec node --test scripts/infra/inf02-runtime.test.mjs
pnpm exec node scripts/infra/inf02-review-smoke.mjs --resume bdb5fc199db0e1a7
pnpm exec node scripts/infra/inf02-review-smoke.mjs
pnpm exec node --test --test-name-pattern='artefacto negativo' scripts/infra/inf02-runtime.test.mjs
```

Resultado de suite: **43/43 tests, exit0, sin skips**; después de corregir el helper negativo, **2/2 adicionales, exit0, sin skips** mediante filtro enfocado. Total45 casos únicos verificados; no se atribuye una corrida completa de45. Las corridas anteriores se solapan y no se suman; el conteo 36 comunicado antes de retomar no corresponde al total observado. Se verificó sintaxis de **19 scripts INF-02** mediante `node --check` y whitespace del diff reservado. Los binds loopback y Docker/socket requirieron escalación autoaprobada. No hubo nuevo rechazo de auto-review en esta revisión.

Smoke final: `inf02-review-cebe674d28b5c53b`, exit0 y `completed:true`. Evidencia anónima reproducible en [INF-02-review-evidencia.json](INF-02-review-evidencia.json):

- Bundle A completo: 175 pares, 20.670 vectores parseados, 350 archivos de índice + modelo + manifest. Warmup offline real dentro del runner Linux ARM64 read-only, generación1/intento1/ready en **2.456 ms** incluyendo creación/retiro del contenedor auxiliar. No descargó modelo ni procesó foto.
- Arranque frío de stack fixture: **32.737 ms** medidos alrededor de start. Incluye DB/migración/fixture/gate/frontend/gateway; no se presenta como tiempo puro de inferencia.
- HTTPS con CA explícita: readiness200, DB/scanner/Redis ready, degraded=false y no-store. Registro201; refresh200 con rotación; cookie Secure/HttpOnly/Lax/Path `/api/auth`, host-only. Sin Bearer401 sin cookie; con Bearer200, una referencia y candidate `sv3pt5-1`.
- SSR real de share/carta200 con nombre de fixture; share noindex, sin hostname privado en HTML. **44 archivos** `.next/static` recorridos sin `backend:3001` ni destino privado de build; public PNG presente. `/api` browser y base privada SSR conviven en la imagen final.
- UID1001, Nodev22.20.0, ONNX import, Sharp PNG, Argon2 hash/verify y Prisma SELECT1/disconnect pasaron. Montaje `/opt/pokescan` read-only y red privada Internal=true. La prueba de conexión externa sintética quedó bloqueada; no se usó proveedor real.
- Recreate final reemplazó container de backend; gate nuevo exit0; readiness HTTPS200 después de reabrir gateway. No se atribuye precisión de cámara a una foto sintética.

ONNX emitió warnings de falta de CA para telemetría y device ID persistible durante el warmup con red `none`; usó ID en memoria. No es un fallo ABI ni una prueba de envío externo exitoso. El backend del ensayo también está en red privada sin salida; no se hizo una afirmación de ausencia universal de telemetría de la librería.

Los negativos HTTP missing/incompatible y Redis degradado conservan la evidencia real de Luna: 503/unavailable y 503/incompatible con frontend/gateway ausentes; Redis parado dio200/degraded=true y recuperó200/degraded=false. No se repitieron innecesariamente en esta revisión. Las regresiones nuevas comprueban rechazo previo del bundle y gate cerrado con ready/disabled/unavailable/503/headers/body; no reemplazan esa evidencia HTTP anterior.

## Identidad final de artefactos e imágenes

Modelo: 24.446.700 bytes, SHA256 `c179f8f7f592449c4c1bca4cd124a7538021428c5ffb89afde9503935b197efb`. Revisión DINOv2 `8b1f705a3a7f6f062f6bdd21986c1583d3ef105d`.

| Artefacto | Hash final |
|---|---|
| Árbol A | `fedc566773ffe3735fae3dd30e087f298cee797d9536aa0a590b40d9b8fa6dd4` |
| Manifest A canónico | `fe610634bb9839d45a8283197adefa79e4dc13e4923bf5609084cfdbf7f26504` |
| Árbol B | `5a2f58fc7842725541dae438eb27ff142aaf39d0a9ddb79a10c5980d5127a98d` |
| Manifest B canónico | `515c5a56020a4a33ce657a19937c087af63bf4464ea2b3dd017aa7a4a010d5cf` |
| Imagen backend ARM64 | `sha256:1e92edf09a920cf1e42017644cf054a11b90b20d2d54ef6bf41dd58dd6c647f3` |
| Imagen frontend ARM64 | `sha256:c89a6a501f8929b82ff562c8b3e06e8337f6d53beaf0f744bd0395e6d8241c5f` |

El digest canónico de manifest omite su propio campo; no es `sha256sum manifest.json` del archivo final. Los hashes históricos de Luna son anteriores a la separación buildHost/target y no deben confundirse con éstos.

## Cleanup y handoff

Cleanup final verificó labels antes de down, ausencia de recursos y preservación del bundle hasta terminar el retiro Docker; después scratch-cleanup retiró sólo full/one propios con marker original. Env0600/CA y directorio privado también retirados. Snapshot de contenedores ajenos antes/después idéntico. Comprobación posterior: **cero contenedores/redes/volúmenes INF02**, cero volumen anónimo legado exacto, cero scratch/markers/private de bdb5 y cebe. Los únicos running siguen siendo `pokemon-scanner-db` y `pokemon-scanner-redis`, healthy; fuentes `.scanner-index` con175pares y modelo con hash exacto preservados. No se tocaron datos dev/test ni puertos3000/3001/55432/6379.

El residual incompatible sin marker fue retirado antes por el coordinador con unlink/rmdir explícitos tras verificar árbol/hash/owner; esta revisión no fabricó ownership ni repitió ese borrado. La limpieza de imágenes build/cache queda fuera del cleanup de datos; se conservaron las imágenes para revisión/reuso.

Runbook entregado en [infra/inf02/README.md](../../../../infra/inf02/README.md): comandos reales de bundle/env/build/start/HTTPS/auth/SSR/recreate/cleanup, flags privados, CA sin confianza de sistema, versionado, selección/rollback con gate nuevo y preservación de fuentes. Rollback entre modelos distintos queda como procedimiento documentado, no como ensayo ejecutado.

No se ejecutó `pnpm run check` global por instrucción expresa de lote; sigue pendiente después de INF-03 y revisión integrada, con stop y `SCANNER_VISUAL_ENABLED=0` para suites generales. Esta fase no acredita x64, hosting/dominio, producción, carga prolongada/memoria, teléfonos físicos, fotos consentidas o accuracy. Se libera la reserva de archivos INF-02, Docker/runtime y suites enfocadas al coordinador; no queda implementación o stack propio activo.
