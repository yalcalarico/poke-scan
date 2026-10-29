# Baseline de navegador con Playwright
Objetivo: incorporar un runner E2E y un primer recorrido aislado del escáner, sin inventario real.
Rama: `feat/collection-nm-policy`; unidad separada de NM y de los documentos previos. Sin push/PR.

## Specs

- S1: «go». Respuesta a: «¿autorizás incorporar Playwright como dependencia de desarrollo para implementar el baseline E2E de navegador? Recomiendo hacerlo: permite validar el foco y después login, búsqueda y guardado por UI.»
- S2: «continua». Continuidad de la fase 2 del plan: reconciliar foco y cobertura existente; las pruebas físicas de iPhone no se acreditan mediante emulación.

## Tasks

- T1 [S1,S2] delegated/worker — done — runner, 7 casos y docs; verificador sin bloqueadores; commit: `2cb32c6`.
- T2 [S1,S2] inline/ejecución — done — instalación Playwright/Chromium salida0; estructural3/3 y baseline7/7 salida0; commit: `2cb32c6`.
- T3 [S1,S2] delegated/verify + inline/cierre — done — Chromium7/7, runner6/6, gate global verde tras unidad TCGCSV separada; validador nativo approved y ack exacto consumido; commits: `2cb32c6`, `77046d0`.

## Log

### L1 — Pedido literal

go

### L2 — Contexto y alcance de la primera unidad

Respuesta a la propuesta de incorporar Playwright reproducida en S1. Primera unidad: Chromium escritorio, foco con teclado en el escáner, guard sin sesión y login por UI con respuestas sintéticas; no se promete todavía búsqueda/guardado completos, cámara, Safari ni iPhone físico. No cambiar componentes de producto ni tokens antes de demostrar un fallo. Hay cinco ubicaciones de clases de foco sobre medios, no un número fijo de botones. No hay fallo visual demostrado por lectura.

Usar frontend aislado en puerto dedicado, sin reutilizar servidores ajenos. Bloquear API y servicios externos no esperados; no leer secretos ni consultar datos reales. Sin capturas, traces ni videos. No ejecutar el stack completo. El padre ejecuta instalaciones y pruebas largas; el worker prepara configuración/specs/docs. No abrir una segunda instancia mientras check/build usa recursos compartidos. Dependencias sólo por pnpm10.17.1.

Riesgo: ítem5 por incorporación de dependencia y runner de desarrollo. Verificador independiente aplicable. Plan de entrega: una unidad revisable con código/tests/docs juntos, objetivo aproximado <=400 líneas autoradas (lockfile generado separado del cómputo autorado), sin minificar para ajustar. Si no cabe, informar antes de ampliar.

Estado previo: HEAD `d8fba3d`, documentos de NM/plan pendientes y preservados. Fetch remoto ya hecho, sin merge/rebase. No incorporar estos documentos ajenos incidentalmente. No se autoriza conversión histórica, publicación ni servicios externos. Browser binaries deben instalarse dentro del proyecto mediante PLAYWRIGHT_BROWSERS_PATH para no escribir en cachés externas sin permiso.

### L3 — Instalación y primer RED observado

Playwright1.64.1 instalado con pnpm10.17.1, salida0; Chromium y herramientas instalados dentro de frontend/.playwright-browsers, salida0. Next16.4.1 ya estaba en package/lock antes del turno; mensaje de actualización corresponde a node_modules desalineado. Se conservaron entradas libc preexistentes eliminadas por regeneración para evitar cambio incidental del lock. Advertencias de peer @types/node/Vitest y scripts tesseract ignorados, sin aprobar scripts.

Verificador `mvrhff2x-4-nwmn` señaló carga automática de .env y descargas de fuentes por Next fuera de interceptación del browser. Worker implementó copia exclusiva sin .env, entorno saneado, fuentes locales simuladas y bloqueo TCP en subprocess. Revisión posterior `mvrhv76w-6-1j98` confirma ambos bloqueos resueltos por lectura; no es sandbox del sistema operativo. Sin cambios de producto. Tres pruebas estructurales pasan, salida0. No existe baseline ejecutable anterior para RED de instalación; sí RED real del nuevo runner: job3 salida1, seis casos fallan por WebSocket HMR esperado en ruta obsoleta. Worker corrigió allowlist únicamente a ws del host dedicado y /_next/hmr; banner y aserciones intactos. Job4 salida1:4/6 pasan; fallan comparación del outline contra relleno del botón (el offset lo coloca sobre superficie exterior) y label de email incompleto por marcador obligatorio. Worker `mvri3cxn-8-s5ow` corrige medición de superficie exterior con ratio>=3:1 y nombres accesibles reales, sin cambiar producto ni quitar aserciones. Job5 en curso. No hay baseline completo aprobado todavía.

La unidad requiere aproximadamente450 líneas autoradas por aislamiento y sus pruebas, sobre objetivo aproximado400. Sigue siendo un único runner con tests/docs cohesivos; no se comprimió ni se amplió a producto/backend. Sin PR ni publicación. ASSESS con escalación ítem5 pide verificador, no evalúa candidato por untracked no declarados; RDD reportado on. No hay revisión nativa iniciada.

### L4 — Baseline verde

Job5 salida1:4/6 pasan, login/restauración incluidos; parser del test rechaza Highlight del sistema rgba con alfa0.8. Worker compone source-over sobre superficie exterior opaca, preserva ratio>=3:1 y añade prueba matemática de ambos valores observados. Job6 salida0:7/7 pasan en Chromium escritorio(24.7s), sin skips. No se modificó producto ni se saltaron comprobaciones.

Verificador `mvriauqt-a-7cav` acepta correcciones estructuralmente, sin bloqueadores; sus comprobaciones fueron estáticas, ejecución acreditada por el padre. Fuentes locales simuladas: no prueba tipografía de producción ni cámara/media/teclado de iPhone físico. Warning Next sobre lockfile/home aislado no impidió corrida. T3 inicia gate global serial, sin runtime del baseline en paralelo.

### L5 — Integración del gate

Job7 `pnpm run stop && pnpm run check` salida1 durante lint: ESLint recorrió binarios/cachés generados del runner y consideró el callback fixture `use` un hook React. No llegó a tipos/tests/build. Worker `mvridfti-b-4syb` añadió únicamente ignores `.playwright-browsers/**`, `.playwright-output/**`, `.playwright-app/**` y renombró callback a `runFixture`; no desactivó reglas ni excluyó fuentes e2e/scripts/app. Padre leyó configuración completa. No cambian escenarios ni comportamiento del fixture. Job8 `pnpm run check` salida0 en2m31s: lint,tipos,tests,builds completos. No hubo runtime entre ambos gates.

### L6 — Commit separado y bloqueo nativo

Usuario: «Review the delivered subagent output and continue.» Padre revisó resultado del verificador y gate completo. Comprobó puertos3000/3001/3100 sin listeners, copia aislada retirada y diff--check0.

Commit `2cb32c6` (`test(frontend): add isolated Chromium browser baseline`):12archivos,558altas3bajas incluyendo lock;528líneas autoradas sin lock. Límite de slice previo: `d8fba3d` (NM, ya cerrado por decisión propia); candidato de esta unidad: `d8fba3d..2cb32c6`, nunca toda la rama839líneas acumuladas. Unidad cohesiva runner+aislamiento+tests+docs; supera objetivo aproximado400, sin minificar ni repartir artificialmente archivos por tipo. Sin push/PR; documentos locales previos de estado/backlog/plan/NM permanecen fuera del commit.

RDD on. ASSESS del rango comprometido no evaluó por untracked sin declarar. INSPECT pidió selección; se excluyeron los cuatro documentos untracked, sin ignorarlos/borrarlos. Segundo INSPECT devuelve stop `managed_assets_outdated`, sin START/lineage/recibo. Continuación exacta del proveedor:

```sh
/Users/ysmaelalcalarico/Library/pnpm/global/5/.pnpm/gentle-pi@4.3.0_@earendil-works+pi-ai@1.4.0_@aws-sdk+credential-provider-node@3.972.89__18a9ba93803c35a8d40777ffcc9876c9/node_modules/gentle-pi/.gentle-ai/v4.2.0/gentle-ai sync --agent pi
```

No se ejecuta mantenimiento del harness ni se reintenta START. T3 espera decisión: autorizar ese mantenimiento y retomar revisión, o dejar explícitamente sólo `2cb32c6` sin revisión nativa. La excepción anterior de NM no cubre este candidato. Comprobaciones funcionales/independientes aprobadas no sustituyen ese permiso. Tracker queda sin commit durante el bloqueo para no ampliar el candidato.

### L7 — Sync autorizado y bloqueo de selección

Usuario: «si go». Padre explicita que se interpreta como autorizar sync y retomar review, no omitirla. Job9 ejecuta el comando exacto de L6, salida0 en3s. Proveedor informa5archivos globales actualizados (mcp.json de Gentle Shell y proyecciones de ledger/Claude/Codex/OpenCode); no se abrieron sus contenidos. No cambió producto ni se repitieron suites/builds intactos.

INSPECT fresco pidió de nuevo selección; se excluyeron sólo documentos untracked, preservándolos. INSPECT ready ofrece target workspace de los cambios documentales previos, no el commit de baseline. Se intentó una vez START ordinary con baseRef `d8fba3d16f34aa9677cccd6d212f8c930fbdab7d`, committedOnly:true y lentes risk/resilience/readability/reliability. Respuesta: `native-start-retained-selection-candidate-mismatch`, `mutation_performed:false`, `mutation_outcome:none`, siguiente acción `inspect-and-resolve-the-current-intended-untracked-selection`. No existe lineage ni recibo; no se reintenta START ni se modifica autoridad.

T3 espera decisión humana: aislar el candidato en un worktree limpio para revisar sólo `2cb32c6` sin los documentos locales ajenos, o dejar expresamente ese commit sin review nativa. Sync ya está completado; no es necesario volver a ejecutarlo. Checks de producto/runner y verificación independiente siguen aprobados, no equivalen a aprobación nativa.

### L8 — Revisión aislada y corrección acotada

Usuario: «dale». Worktree limpio detached en `.git/agent-worktrees/browser-baseline-review`, registrado, HEAD inicial `2cb32c6`. START del rango comprometido crea `review-00efeeba6711dfb0` para12archivos del baseline, no NM ni documentos previos. Consentimiento resuelto por host interactivo. Raíz de todas las operaciones posteriores: `/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/.git/agent-worktrees/browser-baseline-review`. Target inicial `sha256:2d3b47915185910d5444249a32b9ca584fdc08f05b13f1c02d4989ae981315b9`.

Cuatro revisores ejecutados por capture_group y refuter por captura nativa corroboran R1-001/R3-001: modo install ignora args, incluyendo `--dry-run`/`--with-deps`. Plan nativo aceptado100líneasdiff, dentro de presupuesto200; corrección61líneasdiff. Install rechaza args con exit2, stdout vacío, stderr exacto `El modo install no acepta argumentos adicionales.\n` antes de env/mkdir/spawn. Mantiene instalación sin args y forwarding de test; docs/help actualizados.

Tests preparados primero. Primera ejecución queda invalidada como evidencia de comportamiento porque alias macOS `/var` frente a `/private/var` evita ejecutar main en copia temporal. Fixture canonicalizada con realpathSync; padre observa REDbase real:2fallos exit1, pnpm sintético muestra flags descartados y directorios creados, sin red/instalación real. Candidato GREEN6/6 exit0. Diferencial público temporal:3equivalencias exactas exit/stdout/stderr (install sin args y test con cada flag),2diferencias requeridas (install con cada flag). Temporales retirados por trap/finally. No test permanente consulta historia Git.

Commit corrección `77046d0` (`fix(frontend): reject unsupported browser install arguments`) en worktree limpio; cherry-pick en rama principal produce mismo hash. Slice separado `2cb32c6..77046d0`,4archivos59altas2bajas, sin cambios ajenos. Verificador independiente `mvsrapks-e-pejt` aprueba estructuralmente corrección, sin bloqueadores; no ejecutó suites. Job10 ejecuta Chromium y luego gate global serial sobre candidato corregido. Estado nativo sigue correction_required; falta STATUS fresco tras gate y validador/ack exactos. No revisión aprobada ni autoridad consumida todavía.

### L9 — Gate corregido bloqueado en TCGCSV

Usuario: «Review the delivered subagent output and continue.» Job10 salida1 en2m12s: Chromium7/7 pasa(30s), lint y tipos pasan; backend580tests:578pasan,2fallan. El check se detiene antes del resto de tests y builds; no reemplazar con gate anterior verde.

Fallos observados:

- `backend/src/jobs/tcgcsv/tcgcsv-batch-completion.integration.spec.ts:135`: `downloadStartedAt` null en «una diferencia de reloj no adelanta las 24 horas del final del archivo».
- `backend/src/jobs/tcgcsv/tcgcsv.daily.integration.spec.ts:218`: `blockedUntil`1793230862590 no supera umbral1793230972630 en «persiste un 429 real y no reinicia cinco fallos con otra señal automática».

Exploración acotada read-only `mvsrdxoi-f-ecsl` identifica mezcla de reloj inyectado/Date.now/NOW PostgreSQL y fixtures persistidos como áreas de diagnóstico; no prueba causa exacta, interferencia ni carácter preexistente. No se repite suite, no se modifica TCGCSV, relojes, DB, Redis ni inventario real. Cambios de esta unidad sólo afectan runner/frontend/tests/docs/help.

T3 espera decisión humana para ampliar a diagnóstico/corrección TCGCSV como unidad separada o mantener bloqueada esta entrega. Revisión nativa `review-00efeeba6711dfb0` permanece correction_required sobre worktree limpioHEAD77046d0; corrección61/100líneas comprometida y verificada focalmente, todavía sin validador final/ack. No cerrar nativamente ni publicar mientras falte decidir cómo resolver el gate. No STARTnuevo, no reset/recover, no recibo aprobado en ese momento.

### L10 — Gate recuperado y autoridad aprobada consumida

Usuario autoriza unidad TCGCSV separada con «go»; continuidad detallada en `tcgcsv-clock-specs.md`. Corrección sólo2specs+docs en `d4c22bc`: RED2fallos/16, GREEN16/16 y job13 `pnpm run check` salida0 completo en2m36s. Nada de ese backend se incorpora al worktree de revisión baseline fijado77046d0.

STATUS bound reconoce árbol corregido `d53fb4e5196d930b86c6befa9158cb5c0716bf08` y ofrece targeted_validation. Primer intento de captura rechazado sin mutación por copia inexacta de binding; STATUS fresco reofrece mismo slot, binding exacto devuelve forecast1review-validator porpi_host_relay. Validador admitido nativamente: approved. STATUS bound ofrece acknowledge-approved exacto; ejecutado, resultado `native-approved-acknowledgement-completed`, `authority: burned`, `burn_evidence: gentle-ai.review-acknowledged/v1`, `mutation_outcome: committed`. No STATUS tras burn.

Lineage: `review-00efeeba6711dfb0`. Target final: `sha256:f0ce8605e7a3e715dcfd4f238125c94128a03c6f3db0ffd9bfb486865973349a`. Revisión consumida: `sha256:bc35100d6c97b9ecd19b27ecc8a75b714db2ee4275cd2104f5abf84f5a54e0d1`. Raíz: `/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/.git/agent-worktrees/browser-baseline-review`, HEAD77046d0. Cubre baseline+corrección, no NM ni TCGCSVtestfix ni documentos previos. No conservar token de ack en estos registros.

Cierre:7/7Chromium,6/6runner,5casosdiferenciales y verificador independiente aprobados; gate global posterior0. Fallos previos permanecen registrados en logs, todos resueltos en el alcance autorizado. Sin omisiones en esos focales; no acredita cámara/fotos/contrasteAAintegral/Safari/iPhone físico ni tipografía de producción. Próxima unidad de fase2: ampliar baseline a búsqueda/guardado UI con alcance y fixtures propios; no está implementada por este primer corte. Sin push/PR ni retiro de worktree autorizado.

Risk: item 5 — dependencia y runner de desarrollo; verificación independiente y revisión nativa completadas.



