# Migración de contexto a Gentle Shell / ODD / Engram
Objetivo: consolidar instrucciones y continuidad sin perder conocimiento ni intervenir servicios. Rama: `chore/gentle-context-migration`; base: `7597e7fd6e52edc4fb9865b3c52f7e24924d63cc`.
Entrega: `auto-chain`, `feature-branch-chain`, sin push/PR. Verificación: enlaces, hashes y comparación estructural de configuración; sin suites de producto para documentación.

## Specs

- S1: «Bueno dale play, avanza con todo y tambien revisa los repos que estan fuera del proyecto tambien para que tengas mas visibilidad, fue mi intento de tener orquestadores y distintos roles y demas, pero que con gentle-shell ya eso lo cubrimos asi que no lo necesitaria mas. Asi como lo de andar lanzando comando en el herdr.»
- S2: «si, inclui esas rutas». Alcance externo confirmado: `/Users/ysmaelalcalarico/.codex/`, `/Users/ysmaelalcalarico/.config/opencode/`, `/Users/ysmaelalcalarico/.gentle-shell/`, `/Users/ysmaelalcalarico/.agents/skills/`.
- S3: «Retirar también la orquestación global de los otros clientes». Selección humana: desactivar con respaldo la orquestación de Codex/OpenCode y HerdR; conservar credenciales y memorias.
- S4: «Priorizá precisión, bajo consumo de tokens y preservación del conocimiento existente.» «No abras secretos, credenciales ni archivos `.env`.»
- S5: «Cadena sobre una rama de la migración (recomendado)». Selección humana para unidades reversibles; sin autorización de publicación.
- S6: «ok, termina entonces con lo que faltaba». Reanudar cierre autorizado; no implica eludir el guard ni declarar pruebas no realizadas.

## Tasks

- T1 [S1-S4] inline — done — respaldo externo 18/18 SHA-256 verificados y 2.254 hashes de preservación; commit: `7587266`.
- T2 [S1,S4,S5] inline — done — siete documentos con enlaces válidos y 18 invariantes comprobados; AGENTS 16.630 → 6.705 bytes; commits: `bbbf247` (instrucciones), compatibilidad documental en unidad de cierre.
- T3 [S1,S4,S5] inline — done — backlog conciliado (38 IDs/18 abiertos), cuerpos de registros preservados, enlaces de 11 documentos y tres memorias estables; commit: `daec3f4`.
- T4 [S2-S4] inline — done — cinco archivos actualizados, diez superficies en cuarentena, cuatro hooks/14 agentes retirados; comparación diferencial verde; evidencia Git: pendiente (cambios externos respaldados, no versionados aquí).
- T5 [S1-S6] inline — in_progress — comprobaciones locales contra la base Git, evaluación del candidato restante y commits de cierre; no accede al respaldo protegido.
- T6 [S2-S4,S6] delegated — pending — verificación independiente de instrucciones y retiro global, sin acceso al directorio protegido ni reejecución del chequeo denegado.
- T7 [S2-S4,S6] inline — blocked — espera resolución humana/mantenimiento del guard para el chequeo del respaldo protegido y validación de sesiones nuevas; no hay aprobación pendiente en la UI.

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
- La siguiente unidad cierra la entrada compatible de política anterior y el informe de retiro global. No incluye configuraciones privadas en Git, ni cambia la base de la cadena al trabajo previo de origin/master.
