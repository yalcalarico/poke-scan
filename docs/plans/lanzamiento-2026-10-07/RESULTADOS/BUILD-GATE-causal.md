# Experimento causal acotado del gate Turbopack

8/10 local · GPT-6.1 Sol HIGH · reserva `/root/build_gate_causal_sol`. **El único ensayo frío estándar pasó, exit0, con la opción experimental `workerThreads`.** El gate BE-04/FE-03 sigue abierto hasta la revisión y validación integrada. La evidencia anterior y sus límites quedan en [diagnóstico](BUILD-GATE-diagnostico.md) y [JSON](BUILD-GATE-evidencia.json).

## Diferencia concreta que se propone probar

Next instalado es16.3.6, Node22.20.0 y pnpm10.17.1. Se leyeron AGENTS raíz/frontend y documentación local de Turbopack, configuración y resolución PostCSS antes de editar framework config. `experimental.turbopackPluginRuntimeStrategy` tiene schema y tipo instalados; su default es `childProcesses`. No confundirlo con `experimental.workerThreads`: el wrapper de build Turbopack ya usa un worker thread y esa opción genérica no cambia el pool de plugins.

La [selección oficial de backend, fijada a v16.3.6](https://raw.githubusercontent.com/vercel/next.js/v16.3.6/crates/next-api/src/project.rs), líneas1169–1206, deriva `ExecutionContext` del valor de esa estrategia. La [config Rust](https://raw.githubusercontent.com/vercel/next.js/v16.3.6/crates/next-core/src/next_config.rs), líneas2351–2361, conserva el default child processes cuando esa capacidad está compilada. La configuración JS instalada se serializa hacia el proyecto nativo; la opción no se elimina.

El [backend child processes](https://raw.githubusercontent.com/vercel/next.js/v16.3.6/turbopack/crates/turbopack-node/src/process_pool/mod.rs), líneas299–325, crea el listener loopback antes del spawn. Ese es el punto registrado en los panics anteriores. El [backend worker threads](https://raw.githubusercontent.com/vercel/next.js/v16.3.6/turbopack/crates/turbopack-node/src/worker_pool/mod.rs), líneas55–89/129–141/203–240, crea workers y canales para las tareas. Su [creador](https://raw.githubusercontent.com/vercel/next.js/v16.3.6/turbopack/crates/turbopack-node/src/worker_pool/worker_thread.rs), líneas57–83/160–175, pasa por callbacks N-API y mensajes nativos. `loaderWorkerPool.js` instalado registra `worker_threads.Worker` con `workerData`. **Este transporte evita el listener del backend anterior.** No se exige `postMessage` como marcador: los mensajes de tareas pasan por bindings nativos.

La fuente demuestra una diferencia de mecanismo; el ensayo posterior demuestra que **el build completo frío pasa con ese transporte**. No explica por qué las fixtures pasaron y la app falló con el default. Autodetección Tailwind, grafo completo y restricciones contextuales siguen siendo diferencias posibles. No se atribuye definitivamente el error a sandbox, sitemap, Tailwind ni permisos del proceso hijo.

## Ensayo autorizado por coordinación

Única variable funcional: agregar `experimental: { turbopackPluginRuntimeStrategy: "workerThreads" }` en `frontend/next.config.ts`. Mismo `pnpm --dir frontend run build` estándar, mismo bundler/versión, CSS completo/autodetección/rutas/config restantes intactos. La opción es experimental y afecta evaluación durante build/dev; no es un reemplazo por webpack. Los threads heredan el entorno del padre, mientras el pool de procesos recibe un entorno explícito: registrar esa diferencia, sin imprimir `.env` ni sus valores.

Antes de modificar:430 hashes de fuente coinciden con el cierre previo; config recibido SHA256 `28caf29a22060ccd1acc1578baefee43e352dad88539c7272741b569ed64743f`; output recibido3258 archivos, manifest propio; `lsof` no encuentra listeners3000/3001/3002/3313. Ownership previo en `/private/tmp/build-gate-causal-sol-20261008/ownership.json`. Preservar `.next` por rename al destino reservado y ejecutar frío. Ese rename controla la caché, no cambia el producto; no es un retry idéntico.

Si falla: preservar log/output fallido y restaurar bytes exactos de config y output recibido, sin segundo retry ciego. Si pasa: comprobar selección emitida worker thread/bindings, CSS real con tokens y utilidades, standalone y sitemap; no afirmar runtime/QA nuevo por inspección de archivos. Luego coordinación revisa y habilita el gate integrado por separado. No suites DB/Redis, stack, browser ni global durante esta ventana.

## Resultado y liberación

`pnpm --dir frontend run build` terminó exit0 con escalación aceptada: Next16.3.6 **Turbopack**, compilación3,8s, TypeScript3,7s y15 páginas estáticas, incluyendo `/sitemap.xml`. No se cambió bundler, root, CSS, autodetección ni fuentes de app. El warning de múltiples lockfiles continúa y no bloqueó esta compilación. Un único build nuevo; no comparación A/B/A ni rerun idéntico. El control previo negativo es la evidencia histórica de dos intentos estándar fallidos con el default.

Pruebas estáticas del output frío:

- `build/chunks/[root-of-the-server]__04-wfmr._.js` contiene `worker_threads`, `workerData`, `workerCreated`, `sendTaskMessage` y `recvTaskMessageInWorker`; no `createConnection`. Son pruebas del código emitido, no un trace dinámico de syscalls.
- CSS real de69668bytes conserva tokens `--canvas`/`--brand`, utilidades `.bg-canvas`/`.text-primary`/`.p-4`/`.flex` y radios del sistema `.rounded-control`/`.rounded-surface`. El primer checker supuso `.rounded-card`, que no existe en el sistema; se corrigió exclusivamente el checker según fuentes, sin otro build ni cambio de producto.
- `required-server-files.json` declara estrategia `workerThreads` y output `standalone`; existe `standalone/frontend/server.js`, sitemap generado y sus manifests. No se imprimieron los otros campos del config serializado.
- De430 fuentes recibidas,429 permanecen idénticas y la única diferencia es `frontend/next.config.ts`: opción y comentario del motivo del transporte. Dependencias, contrato backend/frontend, PostCSS y CSS permanecen intactos. Config original preservado byte por byte; output anterior3258 archivos preservado. Output frío actual2055 archivos en manifiesto propio; no comparar su cantidad como equivalencia semántica con webpack.

Temporal y logs/manifests preservados intencionalmente en `/private/tmp/build-gate-causal-sol-20261008`; ownership previo y recibo de ensayo incluidos. La sesión de build terminó; consulta dirigida `pgrep` con escalación aceptada no encontró pools propios. La consulta default no podía listar procesos y no se la acredita como negativa. `lsof` confirmó puertos3000/3001/3002/3313 sin listeners. No stack/browser, DB/Redis, suites ni global creados/ejecutados.

**Cambio y output entregados para revisión de coordinación; reserva de writer/build/output liberada.** La estrategia experimental queda explícita, incluido el tradeoff de entorno heredado durante evaluación. Esta fase resuelve el fallo focal del build con una diferencia de transporte respaldada por fuente; no acredita todavía `pnpm run check` integrado ni runtime del output Turbopack nuevo. Los894 tests/22 checks previos siguen siendo evidencia separada. Evidencia propia: [BUILD-GATE-causal-evidencia.json](BUILD-GATE-causal-evidencia.json). Planes/registro/estado y cierre de IDs corresponden a coordinación.
