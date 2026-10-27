# Migración de contexto a Gentle Shell / ODD / Engram
Objetivo: consolidar instrucciones y continuidad sin perder conocimiento ni intervenir servicios. Estado: **finalizada dentro del alcance documental**. Rama: `chore/gentle-context-migration`; base: `7597e7fd6e52edc4fb9865b3c52f7e24924d63cc`.
Entrega: `auto-chain`, `feature-branch-chain`; push y PR autorizados tras completar verificación (S7-S8). Verificación: enlaces, hashes y comparación estructural de configuración; sin suites de producto para documentación.

## Specs

- S1: «Bueno dale play, avanza con todo y tambien revisa los repos que estan fuera del proyecto tambien para que tengas mas visibilidad, fue mi intento de tener orquestadores y distintos roles y demas, pero que con gentle-shell ya eso lo cubrimos asi que no lo necesitaria mas. Asi como lo de andar lanzando comando en el herdr.»
- S2: «si, inclui esas rutas». Alcance externo confirmado: `/Users/ysmaelalcalarico/.codex/`, `/Users/ysmaelalcalarico/.config/opencode/`, `/Users/ysmaelalcalarico/.gentle-shell/`, `/Users/ysmaelalcalarico/.agents/skills/`.
- S3: «Retirar también la orquestación global de los otros clientes». Selección humana: desactivar con respaldo la orquestación de Codex/OpenCode y HerdR; conservar credenciales y memorias.
- S4: «Priorizá precisión, bajo consumo de tokens y preservación del conocimiento existente.» «No abras secretos, credenciales ni archivos `.env`.»
- S5: «Cadena sobre una rama de la migración (recomendado)». Selección humana para unidades reversibles; publicación posteriormente autorizada en S7.
- S6: «ok, termina entonces con lo que faltaba». Reanudar cierre autorizado; no implica eludir el guard ni declarar pruebas no realizadas.
- S7: «ok, necesito que ya este marca como finalizada todo lo que hicimos, que falta para eso? una vez que termines subelo y crea un PR.» «Entonces aplica la verificacion para poder completar 100%».
- S8: «ya me logge con openai-codex asi que podes avanzar. El respaldo quedo ok.» Confirmación humana del respaldo; no es un chequeo automatizado nuevo ni permiso para eludir el guard.
- S9: «Sí, crear issue/etiquetas y publicar la cadena». Selección humana: issue de la migración con `status:approved`, crear/aplicar `type:docs`, tracker borrador y tres PRs de revisión en `yalcalarico/poke-scan`; referencias `Refs` sin cierre automático ni merges.
- S10: «debo cerrar algo yo o algo? quieres que mergee yo desde git? porque la falla ya es por otro scope, nada ver con los documentos que tocamos». El cierre de S7 corresponde a la migración documental entregada, no a corregir CI general ni hacer merge; el fallo observado se conserva sin declararlo aprobado.

## Tasks

- T1 [S1-S4] inline — done — respaldo externo 18/18 SHA-256 verificados y 2.254 hashes de preservación; commit: `7587266`.
- T2 [S1,S4,S5] inline — done — siete documentos con enlaces válidos y 18 invariantes comprobados; AGENTS 16.630 → 6.705 bytes; commits: `bbbf247` (instrucciones), `4c21eeb` (compatibilidad).
- T3 [S1,S4,S5] inline — done — backlog conciliado (38 IDs/18 abiertos), cuerpos de registros preservados, enlaces de 11 documentos y tres memorias estables; commit: `daec3f4`.
- T4 [S2-S4] inline — done — cinco archivos actualizados, diez superficies en cuarentena, cuatro hooks/14 agentes retirados; comparación diferencial verde; evidencia Git: `4c21eeb` (cambios externos respaldados, no versionados aquí).
- T5 [S1-S6] inline — done — comprobación local (12 documentos/212 destinos, producto intacto), diff check verde y árbol limpio al cierre de `4c21eeb`; commits: `bbbf247`, `4c21eeb`.
- T6 [S2-S4,S6-S8] delegated — done — verificador `mvqtihn1-3-mmyp` aprobó contrato/documentación/configuración declarativa, sin bloqueadores de preservación; comprobación del padre `git diff --check` verde. Respaldo human-attested; sesiones de modelo fuera de esa prueba.
- T7 [S2-S4,S6-S8] inline — done — respaldo confirmado por el humano; `codex features list && opencode agent list` terminó 0, carga efectiva de configuración: multi_agent=false y sólo agentes nativos OpenCode. Warning no fatal de limpieza temporal Codex registrado. Sin conversaciones de modelo, instalaciones ni cambios a servicios.
- T8 [S5,S7,S9] inline — done — cierre técnico `6649067`, cuatro ramas subidas, issue #11 y PRs #12 (tracker borrador), #13, #14 y #15 creados y confirmados por readback; type:docs único y Refs #11 no cerrante. Sin merge.
- T9 [S7,S9,S10] inline — dropped — descartado como gate auxiliar de cierre documental tras aclaración de alcance S10. CI del tracker sigue no aprobada (runs `40531859410`/`40532392594` failure); checks iniciales #13/#14/#15 pasaron. No se corrige ni se declara verde; merge y CI de integración quedan separados.

## Log

### L1 — Pedido original (auditoría, sin autorización de implementación en esa etapa)

# Auditoría de contexto y migración a Gentle-AI / Engram

Actuá como arquitecto de software especializado en sistemas de agentes de IA, gestión de contexto y optimización de tokens.

## Objetivo

Auditar este repositorio para preparar una migración controlada hacia Gentle Shell, Gentle-AI, ODD y Engram, reduciendo el contexto innecesario, las instrucciones duplicadas y los mecanismos de orquestación obsoletos.

## Restricciones

- Trabajá exclusivamente en modo lectura.
- No modifiques, muevas ni elimines archivos.
- No instales dependencias ni cambies configuraciones.
- No guardes memorias nuevas en Engram durante esta auditoría.
- No ejecutes migraciones ni refactorizaciones.
- No leas archivos completos cuando un índice, encabezado o búsqueda puntual sea suficiente.
- No abras secretos, credenciales ni archivos `.env`.
- Evitá lanzar subagentes salvo que exista una justificación clara de costo y beneficio.
- No cargues toda la documentación en el contexto de una sola vez.

## Fase 1 — Inventario

Identificá:

1. Documentación técnica y funcional.
2. Archivos de instrucciones automáticas de agentes.
3. Skills, prompts, hooks y configuraciones de IA.
4. Tareas activas, pendientes y finalizadas.
5. Evidencias, reportes y logs.
6. Scripts y configuraciones específicas de HerdR.
7. Integraciones existentes con Codex y OpenCode.
8. Archivos que pueden estar cargándose automáticamente al iniciar sesiones.

Para cada grupo, registrá cantidad, tamaño aproximado, rutas relevantes y posibles duplicados.

## Fase 2 — Análisis

Compará lo encontrado con las capacidades instaladas de Gentle-AI y Gentle Shell.

Clasificá cada elemento:

- MANTENER: fuente de verdad necesaria.
- SIMPLIFICAR: contenido útil, pero excesivo.
- MIGRAR A ENGRAM: decisiones, descubrimientos o convenciones persistentes.
- REEMPLAZAR: funcionalidad cubierta por herramientas nuevas.
- ARCHIVAR: material histórico que debe conservarse fuera del contexto habitual.
- CANDIDATO A ELIMINAR: material redundante u obsoleto, pendiente de aprobación.
- INVESTIGAR: no hay evidencia suficiente para decidir.

Identificá contradicciones entre documentos y configuraciones.

## Fase 3 — Optimización de contexto

Investigá cómo se construye el contexto inicial de Codex, OpenCode y Gentle Shell en este repositorio.

Determiná qué información se carga automáticamente, qué información puede recuperarse bajo demanda y qué instrucciones están duplicadas.

Proponé una estructura mínima de instrucciones y una estrategia de recuperación selectiva de memoria y documentación.

## Fase 4 — Plan de migración

Diseñá un plan incremental y reversible que incluya:

1. Respaldo.
2. Consolidación documental.
3. Selección de memorias para Engram.
4. Consolidación de tareas activas con ODD.
5. Eliminación de skills y hooks redundantes, previa aprobación.
6. Desactivación de integraciones antiguas de HerdR, cuando corresponda.
7. Validación funcional.
8. Medición de mejoras de contexto y tokens.

## Entregable

Presentá un informe conciso con:

- Estado actual.
- Problemas encontrados y evidencias.
- Archivos más costosos o problemáticos.
- Tabla de clasificación con rutas exactas.
- Riesgos y dependencias.
- Plan recomendado, ordenado por impacto.
- Cambios que requieren mi autorización.

No ejecutes el plan. Esperá mi aprobación.

Priorizá precisión, bajo consumo de tokens y preservación del conocimiento existente.

### L2 — Autorización posterior de implementación

Bueno dale play, avanza con todo y tambien revisa los repos que estan fuera del proyecto tambien para que tengas mas visibilidad, fue mi intento de tener orquestadores y distintos roles y demas, pero que con gentle-shell ya eso lo cubrimos asi que no lo necesitaria mas. Asi como lo de andar lanzando comando en el herdr.

### L3 — Alcance externo confirmado

si, inclui esas rutas

Rutas: las cuatro enumeradas en S2. No se autoriza recorrer otros repositorios no identificados ni archivos sensibles.

### L4 — Decisiones estructuradas

- «Retirar también la orquestación global de los otros clientes».
- «Cadena sobre una rama de la migración (recomendado)».
- Las restricciones de sólo lectura de L1 correspondían a la auditoría terminada; L2 autoriza la implementación, respaldo y selección de memorias. Se mantienen exclusión de secretos y preservación de conocimiento.

### L5 — Evidencia inicial y criterio de implementación

- Árbol limpio al iniciar; base y rama en la cabecera. No se detuvieron servicios.
- Codex global tiene bloques marcados `gentle-ai:orchestrator` y `gentle-ai:agent-routing`; OpenCode configura 14 agentes y `default_agent=gentle-orchestrator`.
- HerdR instala hooks/plugins administrados; actualizarlos o reinstalarlos puede reactivarlos.
- Conservar Engram, CodeGraph, permisos, NotchBuddy, computer-use, sesiones y herramientas no relacionadas. No desinstalar paquetes ni modificar credenciales.
- Explorador de la auditoría no disponible por falta de credencial del proveedor; sin reintentos ni escritores paralelos. Root realiza la migración serial.
- Documentación/configuración: no hay RED de producto significativo. Se comprobarán contratos de configuración antes/después sin ejecutar hooks ni clientes contra sesiones reales.
- Riesgo: ítems 3 y 5 (instrucciones/configuración global compartidas); verificación independiente requerida para esa unidad, además de checks estructurales. El runtime nuevo no se presume verificado por parsear JSON.
- Pronóstico: 700–1.000 líneas documentales/configuración, con recursos generados aparte; cadena elegida antes de commits. Los backups externos no se publican.

### L6 — Respaldo, instrucciones y límites de las unidades

- T1: 18/18 copias externas verificadas (417.722 bytes); 2.254 hashes de preservación. Detalle y rollback en `docs/audits/context-migration-2026-10-27.md`.
- T2: enlaces de siete documentos y 18 marcadores de invariantes aprobados; `git diff --check` verde. AGENTS bajó 59,7 % en bytes, no se atribuye ese porcentaje a tokens.
- Cadena sobre esta rama: primera unidad `7597e7f..7587266` (208 líneas, respaldo/seguimiento); siguiente unidad es contexto local; después continuidad de producto y, por separado, retiro global. El diff de 16.919 líneas contra `origin/master` incluye trabajo previo de `features-varias` y no pertenece a esta migración.
- RDD está on. ASSESS de la primera unidad no pudo evaluar por archivos nuevos todavía sin declarar: `nativeRisk=unassessable`, sin revisión aprobada ni recibo. No se reintentó el mismo candidato ni se redujo el gate; se informa como comprobación no disponible.
- T3: 38 IDs originales y 18 abiertos únicos comprobados; cuerpos previos de registro/checklist preservados; 11 documentos sin destinos Markdown ausentes. Memorias 3–5 guardan decisiones de flujo, fuentes y autoridad del backlog. No se implementó ningún pendiente de producto.

### L7 — Retiro global y unidades de revisión

- T4: cinco archivos actualizados y diez superficies en cuarentena. 18/18 hashes de respaldo y cinco hashes posteriores válidos. Persona/Engram/CodeGraph Codex idénticos, TOML sólo cambia multi_agent; diez hooks ajenos preservados exactamente y en orden. OpenCode conserva MCP/permisos/share y plugin Engram, retira 14 agentes/default. Sin hooks ejecutados ni servicios detenidos.
- Codex AGENTS 109.253 → 20.968 bytes; OpenCode config 148.626 → 14.054. El detalle/rollback está en el informe; no se atribuyen estos porcentajes a tokens.
- Segunda unidad: `7587266..daec3f4`, continuidad/navegación (191 líneas). ASSESS: medium, reviewDue=false, under_budget; no revisión nativa iniciada.
- La unidad de AGENTS tiene 440 líneas por reemplazo coherente de instrucciones (97 altas/343 bajas): se mantiene atómica, sin minificar ni dividir invariantes para alcanzar 400. La cadena elegida separa esa unidad del backlog y de la compatibilidad de la política anterior.
- Las skills de dominio y compartidas permanecen: no son orquestadores ni hooks de HerdR. Sus referencias duplicadas no se cargan automáticamente; no se borran recursos útiles sólo para reducir espacio en disco.

### L8 — Bloqueo del cierre por el harness

- La comprobación final de lectura (comparar los 2.254 hashes con siete documentos autorizados y revisar enlaces/diff/status) fue rechazada antes de entregar salida de proceso: `Permission configuration is human-controlled. Use the mode settings UI; model tools cannot change it.` No hay exit code ni resultado de ese chequeo; no se afirma aprobado.
- No se reintentó, no se cambió el modo de permisos y no se buscó otra vía. T5 espera habilitación humana desde la UI para esa comprobación; también siguen sin ejecutar el verificador independiente y la prueba de sesiones nuevas.
- Commits realizados: `7587266` (respaldo/seguimiento), `daec3f4` (continuidad y navegación). El reemplazo de AGENTS, la entrada compatible de orquestación anterior y el informe global todavía requieren commits de cierre; no se ejecutó otro git status después de la denegación.
- Los cambios globales ya están aplicados y tienen comparación diferencial aprobada en L7. La denegación posterior no demuestra una regresión de esos archivos ni autoriza revertirlos. Respaldo/after.json siguen en la ruta registrada; sin rollback automático, push ni PR.
- La recomendación anterior de habilitar ese chequeo en la UI era incorrecta: L9 documenta el diagnóstico. No volver a ejecutar tareas de producto ni operaciones de servidores para destrabar esto.

### L9 — Diagnóstico corregido y reanudación autorizada

- Usuario: «dide reviso esa denegacion? no veo nada aca»; después: «ok, termina entonces con lo que faltaba».
- Código instalado Gentle Pi 4.3.0: `auto-permission-runtime.ts:376` bloquea shell que contiene literalmente configHome; :395 aplica el guard antes de consultar el modo (:401). No es una autorización pendiente y cambiar a YOLO no lo anula. No se modifica ni ofusca esa protección.
- Reconciliados archivo y memoria. Se divide el cierre: T5 comprueba únicamente el proyecto contra Git (no el respaldo protegido), T6 verifica por separado y T7 conserva pruebas externas no disponibles. Son alcances distintos; no se afirma ejecutado el chequeo rechazado.
- Estado al retomar: rama correcta, cuatro archivos modificados y dos commits de migración. `git diff --check` devolvió 2 por `docs/audits/context-migration-2026-10-27.md:116: new blank line at EOF.` Se retiró esa línea vacía; no fue un fallo de producto.
- No ejecutar suites/builds ni detener servicios: los cambios siguen siendo documentación/configuración de agentes. No acceder a secretos, sesiones o credenciales.

### L10 — Comprobación local y frontera de revisión

- Check local con salida 0: exactamente 12 documentos respecto de la base Git; 212 destinos documentales locales existentes; producto, scripts y manifiestos sin cambios. `git diff --check` aprobado después de corregir el EOF. Es una prueba de alcance distinto, sin acceso al respaldo protegido.
- Tercera unidad: `daec3f4..bbbf247`, sólo AGENTS (440 líneas), con justificación atómica en L7. ASSESS: nativeRisk=medium, escalación explícita ítem 5 (entorno global), risk=high, reviewDue=false/under_budget, independentVerifier=true. No se inicia revisión nativa porque no corresponde según el plan devuelto; no hay recibo de aprobación.
- Cuarta unidad: `bbbf247..4c21eeb`, entrada compatible de política anterior e informe de retiro global (248 líneas); ASSESS passive/reviewDue=false, structuralReadbackOnly. No incluye configuraciones privadas en Git ni cambia la base de la cadena al trabajo previo de origin/master.
- `git status --short` sin salida después de `4c21eeb`: árbol limpio en ese punto. T5 queda terminado, no así la verificación independiente ni las pruebas externas de T7.

### L11 — Resultado de verificación independiente y cierre local

- Único intento T6: `subagent_run`, rol `gentle-ai-verify`, tarea `mvqsg3pf-2-mt00`. Falló antes de ejecutar: `No API key found for openai-codex`. No se produjo veredicto, no se leyeron credenciales ni se configuró otro proveedor para eludir el fallo. No hubo reintento ni más verificaciones.
- T6 queda bloqueada por autenticación del proveedor del subagente; T7 sigue bloqueada por el guard del respaldo y la validación humana de sesiones nuevas. No se presenta la migración como completamente verificada.
- La implementación local y el informe están confirmados en los cuatro commits de L6/L7/L10; este registro final añade sólo evidencia de estado. Cierre local completo, cierre de proof externo pendiente. Sin push, PR, instalaciones, cambios de producto o servicios.
- Próxima decisión humana: habilitar un proveedor válido para verificación independiente o aportar esa prueba externamente, y resolver por mantenimiento/validación humana la comprobación protegida. Cambiar el modo a YOLO no reemplaza ninguno de esos requisitos.


### L12 — Publicación autorizada y nueva evidencia para verificar

- Usuario: «ok, necesito que ya este marca como finalizada todo lo que hicimos, que falta para eso? una vez que termines subelo y crea un PR.» Luego: «Entonces aplica la verificacion para poder completar 100%».
- Usuario: «ya me logge con openai-codex asi que podes avanzar. El respaldo quedo ok.» T6 se reabre por nueva evidencia del proveedor; no por un reintento automático en el mismo entorno. La confirmación del respaldo es humana y no convierte en ejecutado el chequeo antes rechazado.
- Revisión nativa del candidato sha256:1896da566e973cfbe06e539ce397624458b3151bf5d61e7216b91e91461e867c declinada en el host; lineage_created=false, sin recibo. No se reintenta para ese target. No exime al verificador independiente.
- Destino consultado con autorización de publicación: yalcalarico/poke-scan (GitHub público), default master. Sin PR existente para esta rama; no issues abiertos ni etiquetas status:approved/type:* en esa consulta. No se inventa aprobación ni se crean etiquetas protegidas automáticamente.
- Codex y OpenCode están instalados. Verificar la configuración/entrada CLI sólo con comandos documentados, sin sesiones de modelo, instalaciones, secretos, hooks o servicios. Si un arranque real exige otros efectos, se conserva esa falta de prueba y no se afirma un 100 % ficticio.

### L13 — Verificación completa del alcance

- `gentle-ai-verify`, `mvqtihn1-3-mmyp`: aprobación declarativa sin bloqueadores reproducidos. Leídos 12 documentos, 213 referencias locales existentes, cuerpos históricos preservados exactamente, 38 IDs/18 abiertos idénticos. TOML/JSON válidos; bloques, hooks y agentes retirados; integraciones ajenas presentes. No comparó el respaldo protegido. Probes exploratorios dieron 1 por predicados amplios; aclaraciones y checks finales dieron 0, sin regresión reproducida.
- Spotcheck del padre: `git diff --check` 0. `codex --help` y `opencode --help` completaron; `codex features list && opencode agent list` (job-2) terminó con salida 0. Codex consume `multi_agent=false`; OpenCode sólo lista build, compaction, explore, general y plan.
- Advertencia no fatal: `WARNING: failed to clean up stale arg0 temp dirs: Permission denied (os error 13)`. No se modificó ese entorno ni se la ocultó. No se iniciaron conversaciones facturables con modelos ni se reiniciaron sesiones ya abiertas; no cambia ese comportamiento y no se lo presume probado por la ayuda CLI.
- Respaldo acreditado con comparación inicial y confirmación humana S8. La prueba de configuración efectiva y retiro está completa; no se reintentó el chequeo protegido ni se modificaron permisos. Tests/builds de producto no aplican; producto y servicios intactos.
- No se incorporó la sugerencia de test permanente que consulta un commit fijo: no hay regresión que pinnear y las pruebas comprometidas no deben depender de historia Git. Ninguna skill ni runtime fue cambiado para obtener este resultado.
- T6/T7 quedan done, sin bloqueos de verificación del alcance; T8 prepara cierre documental y publicación. La decisión de revisión declinada sigue limitada al target exacto de L12, no se generaliza a un candidato posterior.

### L14 — Entrega remota autorizada y alcance de la cadena

- Cierre técnico `6649067` (101 líneas, dos documentos): ASSESS passive, reviewDue=false. `git push --set-upstream origin chore/gentle-context-migration` terminó 0; rama publicada sin forzar referencias.
- Master remoto avanzó a `c740a09`; ancestro común `7597e7f`. La comprobación de ancestralidad directa devolvió 1, sin stderr; no es un diff contaminado: comparación triple punto sólo incluye los 12 documentos de esta migración, 652 altas/481 bajas (1.133 líneas). No se sobrescribió el trabajo remoto.
- Usuario eligió «Sí, crear issue/etiquetas y publicar la cadena» frente a la pregunta con target, etiquetas y cuatro PRs exactos. Actor GitHub con ADMIN confirmado. Etiquetas `status:approved` y `type:docs` creadas con ese permiso; no se creó `size:exception` ni se infirió autorización de merge.
- Issues habilitados, blank issues explícitamente habilitados, sin plantilla ni duplicado en búsqueda por título. [Issue #11](https://github.com/yalcalarico/poke-scan/issues/11) creado una sola vez, cuerpo/etiqueta/target confirmados por readback. Cuerpo público sin rutas personales, credenciales ni redes privadas; archivos temporales privados limpiados al terminar.
- Cadena preparada: tracker `chore/gentle-context-integration` (`7587266`, 208 líneas); continuidad `chore/gentle-context-continuity` (`daec3f4`, 191); instrucciones `chore/gentle-context-instructions` (`bbbf247`, 440 atómicas); cierre `chore/gentle-context-migration` (`6649067`, 332 líneas frente a instrucciones antes del registro de publicación). El tracker apunta a master; cada hijo al anterior. No hay cambios de producto en las unidades.
- Workflow GitHub existente `Verificación de seguridad`: infraestructura descartable, suite completa y smoke remoto; se informará su resultado real. El aviso de vulnerabilidades de la rama predeterminada no se atribuye al diff documental ni autoriza cambiar dependencias. No se desactiva ni modifica ese workflow.

### L15 — Publicación confirmada

- [Tracker #12](https://github.com/yalcalarico/poke-scan/pull/12), base master, head `chore/gentle-context-integration`, borrador/no merge, 208 líneas.
- [Continuidad #13](https://github.com/yalcalarico/poke-scan/pull/13), base tracker, head `chore/gentle-context-continuity`, 191 líneas.
- [Instrucciones #14](https://github.com/yalcalarico/poke-scan/pull/14), base continuidad, head `chore/gentle-context-instructions`, 440 líneas atómicas.
- [Cierre #15](https://github.com/yalcalarico/poke-scan/pull/15), base instrucciones, head `chore/gentle-context-migration`, 332 líneas antes de este registro de publicación.
- Las cuatro creaciones tuvieron readback de cuerpo, título, estado abierto, base/head y una única etiqueta type:docs. Tracker actualizado con enlaces reales y readback de borrador. Referencias Refs #11, sin cierre automático. No se aprobó ni ejecutó ningún merge.
- Watches nativos de CI lanzados una vez para #12–#15 (jobs 9–12). T8 publicación completa; T9 observa checks pendientes. No se afirma que el head haya pasado CI antes del evento de salida de cada watch.

### L16 — CI observada y bloqueo de integración

- Checks de [#13](https://github.com/yalcalarico/poke-scan/actions/runs/40531876172), [#14](https://github.com/yalcalarico/poke-scan/actions/runs/40531888000) y [#15 inicial](https://github.com/yalcalarico/poke-scan/actions/runs/40531905977) aprobados, watches salida 0 (3m14, 4m22 y 3m34).
- Watch de #12 salió 1 después de perder el listado de checks. Readback diagnóstico: [run original 40531859410](https://github.com/yalcalarico/poke-scan/actions/runs/40531859410) completed/failure en «Suite completa en infraestructura descartable»; smoke posterior skipped. `--log-failed` devolvió 0 sin detalle útil, no se inventa una causa concreta.
- El head del tracker cambió externamente desde `7587266` a `2d2ec885812d30c6cdcdda7ecda3da44564aeec6`: merge de master `c740a09`, sólo package/lockfile frontend. No fue un merge de esta sesión; no se revirtió ni sobrescribió. No se atribuye ese cambio al diff documental.
- Se observó una sola vez el run ya existente [40532392594](https://github.com/yalcalarico/poke-scan/actions/runs/40532392594) del nuevo head; `gh run watch --exit-status` salió 1: workflow completed/failure. No se lanzó un rerun ni se modificó producto/workflow para ocultar el resultado.
- T9 queda bloqueada: requiere decidir una tarea de corrección del CI de integración. T1-T8 están implementadas, verificadas localmente y publicadas; no se declara cierre global 100 % verde ni aprobación de merge.
- El registro final sólo cambia documentación. Un check posterior que genere esa publicación no se considera aprobado por herencia del run anterior; su estado se informa como no acreditado hasta observarlo. No se continúa con más verificación tras este fallo de integración.

### L17 — Corrección de alcance y cierre de la migración

- Usuario: «debo cerrar algo yo o algo? quieres que mergee yo desde git? porque la falla ya es por otro scope, nada ver con los documentos que tocamos».
- Se separa explícitamente cierre documental de CI general/integración. T1-T8 implementadas, verificadas y publicadas. T9 era un gate auxiliar añadido al entregar: se descarta, no se marca done ni se transforma un failure en pass.
- Migración documental finalizada. No hace falta que el dueño cierre issues/PRs o haga merge para destrabar este trabajo. El tracker sigue borrador/no merge y las revisiones quedan disponibles; no se alteran las condiciones reales para integrar en master.
- Los fallos de CI anteriores quedan como evidencia; no se afirma una causa concreta ni se corrige producto/dependencias/workflow fuera del alcance. No hay reruns ni más verificaciones para intentar obtener verde. El registro final es documentación y no acredita automáticamente un check que genere su publicación.
- Ahorro real de tokens no medido; se entregaron inventario y medición de bytes sin inventar equivalencias. Respaldos y memorias conservados; sin reinicios de servicios, cierres automáticos ni merges de esta sesión.
