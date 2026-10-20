# Diagnóstico acotado del gate Turbopack

8/10/2026 · GPT-6.1 Sol HIGH. **El gate BE-04/FE-03 sigue abierto.** El build completo estándar volvió a fallar con `EPERM` en el bind interno CSS, tanto mediante `pnpm run build` como mediante `pnpm exec next build`. No se demostró una corrección causal para aplicar. Se preservó el código y se reconstruyó el output local con webpack, exit 0; esa alternativa no aprueba el estándar.

## Hallazgo nuevo y límites de la causa

La [fuente oficial fijada a Next 16.3.6](https://raw.githubusercontent.com/vercel/next.js/v16.3.6/turbopack/crates/turbopack-node/src/process_pool/mod.rs), líneas 299–325, ubica `TcpListener::bind("127.0.0.1:0")` **antes** de `cmd.spawn()`. El error observado ocurre al crear ese listener Rust, antes de arrancar el proceso Node de PostCSS. Atribuirlo a permisos del proceso hijo no queda respaldado por ese orden.

Los controles nuevos sí ejecutaron PostCSS/Tailwind con el mismo Next, Node y pnpm instalados. El plugin local agregó `.diagnostic-processed` al CSS emitido; Tailwind emitió `.p-4`. No se usó webpack en esas fixtures. También pasó una fixture dentro de `frontend`, con la misma raíz inferida desde el lockfile de la raíz y el mismo warning de múltiples lockfiles. Pasó, además, el CSS completo copiado de la app con `output: "standalone"`, después de preservar y retirar la caché propia anterior.

Esto debilita las hipótesis de un fallo general de sockets, del launcher `run`, de la raíz inferida por sí sola o de PostCSS/Tailwind básico. **No identifica una causa definitiva del build completo ni descarta una restricción contextual.** La fixture de CSS completo reemplazó únicamente el import por `source(none)` y agregó una clase inline: conserva el cuerpo de los tokens, pero no reproduce la autodetección de clases ni el grafo completo de la app. Las dos comparaciones warm tampoco prueban un bind nuevo. No se afirma que el sandbox completo permita todo ni que haya cambiado su política.

## Comprobaciones de esta ronda

| Control | Resultado nuevo |
|---|---|
| Node parent/child/worker, IPv4 loopback/IPv6 loopback/default, puertos efímeros cerrados | 9/9 aprobados |
| Fixtures: sin CSS, CSS nativo, PostCSS vacío, plugin efectivo, Tailwind inline, raíz interna inferida, CSS completo/standalone | 7 primeras compilaciones efectivas aprobadas |
| Fixture PostCSS con permisos default; fixture Tailwind vía `pnpm run build` | 2 compilaciones warm aprobadas; alcance acotado |
| App actual `pnpm --dir frontend run build` | exit 1, mismo EPERM |
| App actual `pnpm --dir frontend exec next build` | exit 1, mismo EPERM |
| Restauración `pnpm --dir frontend run build --webpack` | exit 0; alternativa explícita |

Las escalaciones solicitadas fueron aceptadas; no hubo rechazo de auto-review. Un ensayo inicial del harness falló por combinar `outputFileTracingRoot` y `turbopack.root` inconsistentes; se conservó su log y se corrigió exclusivamente la fixture. No es un error de producto. En total: 13 builds, 10 exit 0 y 3 exit 1, incluyendo ese fallo del harness y la restauración alternativa. [Comandos exactos, contextos, códigos y hashes de logs](BUILD-GATE-evidencia.json).

No se repitieron `pnpm run check`, suites DB/Redis, las 894 pruebas ni los 22 checks API/SSR ya aprobados. No hubo un cambio de producto ni una resolución del build estándar que justificara ese gate final. Sus resultados anteriores siguen siendo evidencia separada; no se acreditan como ejecutados en esta ronda.

## Opción oficial pendiente de prueba causal

El [contrato oficial de Next 16.3.6](https://raw.githubusercontent.com/vercel/next.js/v16.3.6/packages/next/src/server/config-shared.ts), líneas 698–708, y `frontend/node_modules/next/dist/server/config-shared.d.ts`, líneas 597–604, admiten `experimental.turbopackPluginRuntimeStrategy`: `childProcesses` es el default y `workerThreads` ejecuta el mismo trabajo en threads. Es una capacidad real del framework, no un cambio de bundler. **No se probó como corrección y no se aplicó**: las fixtures autorizadas no reprodujeron el fallo comparable y cambiar la configuración real carecía de una demostración causal suficiente en esta ronda. No se tocó framework, paquetes, fuentes, guards ni configuración de producto para presentar el gate como verde.

## Preservación y liberación

Ownership y ausencia capturados antes de crear la fixture exacta `frontend/.build-gate-repro-sol-20261008`. Se retiró del proyecto verificando su marker y se preservó en `/private/tmp/build-gate-diagnosis-sol-20261008/internal-fixture-final`. Baseline dirty, manifests, logs, panics y harness quedan en ese directorio temporal como evidencia; no hay servicios propios activos.

Los **430 hashes de fuente coinciden antes y después**. Se capturaron 3.241 hashes de archivos `.next` recibidos y 3.254 del output final reconstruido. Son inventarios de artefactos, no QA runtime nuevo. El manifiesto histórico de 510 hashes del gate anterior no describe este output. No se abrieron browser ni stacks, ni se crearon DB/Redis, migraciones, fixtures de datos o jobs; no se invocaron APIs de negocio. No se imprimieron valores de `.env` ni se consultaron datos personales.

Todos los procesos de build terminaron; chequeo dirigido de workers propios sin matches, puertos 3000/3001 libres y fixture interna ausente. La consulta inicial de procesos con permisos default no estuvo disponible; la consulta dirigida autorizada confirmó ausencia. **Reserva técnica, writer y output liberados.** Planes, registro y cierre de IDs permanecen a cargo de coordinación. El próximo paso requiere una diferencia contextual reproducible del build completo o una corrección mínima demostrada; no otro retry idéntico ni reemplazar el gate por webpack.
