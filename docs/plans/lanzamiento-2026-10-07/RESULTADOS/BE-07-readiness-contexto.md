# BE-07 — aislamiento de Vitest y captura nativa focal

2026-10-09 · Sol 6.1 HIGH. **Causa original no localizada; sin corrección ni nuevo global.** Segunda fase autorizada por root tras «ok sigue?», conservando la decisión humana previa de continuar sólo focal. Se auditó la fuente instalada antes de aprobar una única corrida de `readiness.http.spec.ts`. No se ejecutaron 405, grupos adicionales ni nuevos ciclos de stress; no hubo DB/Redis real ni cambios permanentes.

## Aislamiento: módulos, proceso y teardown son cosas distintas

La fuente instalada de Vitest **4.1.11**, junto con `backend/vitest.config.ts`, permite afirmar algo más preciso que el reporte anterior:

- `isolate=true` es el default; el pool resuelto es `forks`. `fileParallelism:false` fuerza `maxWorkers=1`. `groupSpecs` genera una tarea de un archivo para cada spec aislado.
- `getPoolRunner` reutiliza un runner sólo si `task.isolate===false`; en este proyecto crea otro `PoolRunner/ForksPoolWorker` por archivo. `ForksPoolWorker.start` invoca `child_process.fork` para ese runner. **Los globals y módulos nativos del worker anterior no se heredan directamente en el proceso nuevo.** No es sólo aislamiento de módulos dentro del mismo proceso.
- El runtime también llama a `mocker.reset()/resetModules` cuando `config.isolate` y, al terminar el archivo, `vi.resetConfig()/vi.restoreAllMocks()`.
- Eso **no equivale** a restaurar automáticamente fake timers o stubs globals. `restoreAllMocks` itera restauradores de spies; `vi.useRealTimers` desinstala el clock y restaura Date mediante otra ruta. `unstubAllGlobals/unstubAllEnvs` restauran descriptores/env mediante funciones distintas. Defaults `restoreMocks`, `mockReset`, `clearMocks`, `unstubGlobals` y `unstubEnvs` son false. El environment Node normal sólo elimina `console.Console` en teardown; no contiene una restauración general del clock.

Hay un matiz contextual que el primer reporte no explicitaba: **el scheduler inicia `runner.stop()` y guarda su promesa sin esperarla antes de programar la tarea siguiente**. `PoolRunner.stop` espera el acknowledgment de teardown, después termina el proceso; `ForksPoolWorker.stop` usa SIGTERM por omisión y SIGKILL a los 500 ms si hace falta. Los tests son seriales, pero la salida/teardown del proceso anterior puede solaparse con el arranque siguiente. No se observó ese solapamiento en la ronda histórica, ni se reprodujo una consecuencia para readiness. No se convierte esa posibilidad en causa del incidente.

Los [extractos con líneas y hashes](BE-07-readiness-contexto-anexos/vitest-static-excerpts.json) cubren pool/grouping/fork/stop, reset de módulos/mocks, defaults, fake timers/stubs y environment Node; son fuente local instalada, sin búsqueda web ni dependencia de documentación de otra versión.

## Auditoría de specs y del log recibido

La búsqueda estática sobre los 29 specs de `backend/src` no encontró mocks de `node:http`, `node:net`, Supertest/Superagent, monkey patches de `Server.prototype/Socket.prototype` ni cambios de globalAgent. Los casos relevantes revisados son:

| Familia | Intervención y cleanup existente |
|---|---|
| `readiness.service.spec.ts` | Fake timers con `afterEach(useRealTimers)`; el blackhole TCP propio destruye sockets, espera server-close y restaura DATABASE_URL en finally |
| `redis.recovery.spec.ts` | Doble de ioredis, fake timers restaurados explícitamente; rama TCP propia destruye sockets y espera server-close en afterEach |
| `visual-identify.lifecycle.spec.ts` | Único mock de módulo nativo encontrado: `node:child_process`; restaura fake timers y elimina su handler IPC/restaura `process.send` y spy `process.on` en finally |
| Share/collections/portfolio | Clock Date o fake timers con restauración explícita en afterEach/finally |
| Tcgdex/currency | Stub/assignment de fetch con `unstubAllGlobals` o restauración del fetch original; no altera transporte de Supertest |
| Readiness HTTP/collections HTTP | Importan Supertest y cierran sus apps; sin mocks nativos de HTTP/net ni cambios del clock en el spec readiness |

Esto no pretende probar ausencia universal de todo efecto externo de los tests. La separación de procesos bloquea la fuga directa propuesta de clock/globals; el teardown OS puede tener efectos de recursos compartidos que aquí no se capturaron.

El log fallido registra PIDs distintos para logs de Tcgdex, ReadinessService y mapping, pero **no registra el PID de readiness HTTP ni el orden completo de los archivos silenciosos**. La línea de mapping anterior al fallo no demuestra que ese spec fuera el predecesor inmediato. No se eligió un grupo de specs por ese orden parcial ni se reprodujo toda la suite indirectamente.

## Un control focal nuevo, sin modificar el comportamiento `clientError`

Propuesta aprobada por root: una sola corrida original de cuatro casos, con observación buffered de `emit` en HTTP Server, ClientRequest, IncomingMessage, ServerResponse y Socket. El wrapper llama a `Reflect.apply(originalEmit,this,args)`, devuelve su resultado y preserva la propagación de excepciones; no agrega listeners de observación. **No se agrega listener `clientError`**, porque Node decide su comportamiento automático según el resultado booleano de ese emit.

El setup temporal agrega únicamente marcas de fase y flush en afterAll; su config temporal hereda el config vigente. No se editó el spec ni sus assertions. Se corrió `pnpm run stop` antes y se habilitó sólo el bind efímero propio fuera del sandbox, cuya restricción EPERM ya estaba acreditada en la primera fase.

Resultado: **4/4**, CLI exit0, worker observado **PID14773**, 177 eventos. Cinco conexiones con parser presente, cinco requests con bytes recibidos `101/101/101/102/101`, cinco respuestas `200/200/503/200/200`. Los diez IncomingMessage end/close observados terminan `complete=true, aborted=false`. Cero eventos error, clientError o aborted. `clientErrorListeners=0` en los cinco listening y cinco request; se mantuvo el comportamiento automático y los cinco métodos/descriptores emit quedaron restaurados al flush.

Límites: el error branch de clientError **no fue ejercitado** porque no hubo error; el contrato de delegación se comprueba por la fuente del observer. Los wrappers tienen costo aunque no escriben durante requests. El flush afterAll precede al último client-close: captura seis server-close y nueve socket-close, no una traza hasta el último cierre del cliente. El worker ya no existe después del comando; todos los cinco puertos efímeros observados y 3000/3001 están libres. No se reconstruye con ese pase lo que ocurrió en el global fallido.

## Errata de alcance sobre la fase anterior

La frase previa sobre aislamiento y runners independientes se conserva y queda precisada arriba: proceso nuevo por archivo, con posible solapamiento de teardown. No debe leerse como «todos los procesos anteriores ya habían terminado».

En mensajes intermedios de la fase anterior se asoció el exit0 del comando al worker buffered: **el exit0 observado era del CLI, no un exitCode0 del proceso hijo**. La fuente instalada muestra terminación por señal tras stop; no se capturó el exitCode/señal individual de esos workers. El standalone PID14096 del ensayo de 600 requests sí terminó exit0 como proceso propio. No se cambian ni reemplazan los 44 anexos anteriores; su manifest y hashes fueron cotejados intactos.

## Preservación, cleanup y decisión

Baseline previo a preparar el harness: 501 fuentes recibidas, todas sin cambios al final. Nueve archivos instalados auditados mantienen sus hashes. El spec y la configuración permanente conservan sus hashes. No se tocaron producto, paquetes, outputs, planes centrales ni artefactos previos. Sin reset/stash/stage/commit.

Ownership se registró antes de ejecutar; únicamente app y sockets efímeros propios del spec. No se creó DB/Redis, contenedor ni fixture de datos. App-close original completado, prototipos restaurados, PID14773 ausente y puertos `58802/58804/58806/58808/58810`, 3000 y 3001 libres. La comprobación read-only de PID necesitó salir del sandbox tras EPERM de `ps`; no fue una prueba nueva. Recursos propios activos **0** y reserva focal/sockets liberada al entregar.

**No hay corrección causal aprobable.** La auditoría responde la pregunta de aislamiento; la nueva telemetría captura el camino sano sin reproducir el socket hang up. No permite proponer escucha estable, delays, cambios de timers, timeouts, skips o paquetes. Tampoco habilita global ni ampliación de ciclos. Queda como instrumento acotado disponible si en una futura ejecución autorizada reaparece el error; repetirlo por buscar verde no agrega evidencia. BE-07 conserva su gate fallido y la autorización humana continúa limitada a focal.

[Evidencia](BE-07-readiness-contexto-evidencia.json) · [Resumen nativo](BE-07-readiness-contexto-anexos/emit-summary.json) · [Cleanup](BE-07-readiness-contexto-anexos/cleanup.json) · [Preservación](BE-07-readiness-contexto-anexos/source-preservation.json).
