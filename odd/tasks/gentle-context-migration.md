# Migración de contexto a Gentle Shell / ODD / Engram
Objetivo: consolidar instrucciones y continuidad sin perder conocimiento ni intervenir servicios. Estado: **finalizada según el cierre histórico `5be3478`**, reconciliado desde Git; no valida configuración externa actual.
Rama histórica: `chore/gentle-context-migration`; base: `7597e7fd6e52edc4fb9865b3c52f7e24924d63cc`. Publicación y verificación posteriores constan en ese cierre; sus permisos no se trasladan a trabajos nuevos.

## Specs

- S1: «Bueno dale play, avanza con todo y tambien revisa los repos que estan fuera del proyecto tambien para que tengas mas visibilidad, fue mi intento de tener orquestadores y distintos roles y demas, pero que con gentle-shell ya eso lo cubrimos asi que no lo necesitaria mas. Asi como lo de andar lanzando comando en el herdr.»
- S2: «si, inclui esas rutas». Alcance externo confirmado: `/Users/ysmaelalcalarico/.codex/`, `/Users/ysmaelalcalarico/.config/opencode/`, `/Users/ysmaelalcalarico/.gentle-shell/`, `/Users/ysmaelalcalarico/.agents/skills/`.
- S3: «Retirar también la orquestación global de los otros clientes». Selección humana: desactivar con respaldo la orquestación de Codex/OpenCode y HerdR; conservar credenciales y memorias.
- S4: «Priorizá precisión, bajo consumo de tokens y preservación del conocimiento existente.» «No abras secretos, credenciales ni archivos `.env`.»
- S5: «Cadena sobre una rama de la migración (recomendado)». Selección humana para unidades reversibles; sin autorización de publicación.

## Tasks

- T1 [S1-S4] inline — done — respaldo externo 18/18 SHA-256 verificados y 2.254 hashes de preservación; commit: `7587266`.
- T2 [S1,S4,S5] inline — done — instrucciones y compatibilidad entregadas; commits: `bbbf247`, `4c21eeb`.
- T3 [S1,S4,S5] inline — done — backlog y contexto selectivo entregados; commit: `daec3f4`.
- T4 [S2-S4] inline — done (histórico) — retiro externo y preservación registrados en `4c21eeb`, verificación posterior en `6649067`; no inspeccionados de nuevo en esta limpieza.
- T5 [S1-S5] inline — done (histórico) — cierre de preservación/revisión y límites registrado en `6649067`/`5be3478`; CI de integración fallida separada del cierre documental, no aprobada.

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


### L7 — Reconciliación documental desde historia local

La base de esta limpieza (`51332f2`) conservaba T4 activa y T5 pendiente. El cierre
posterior existe en `5be3478` (rama local de migración, no ancestro de esa base):
registra T1–T8 terminadas y T9 descartada tras separar CI general del alcance.
Se contrastaron las tareas y la entrega histórica, sin abrir archivos externos,
memorias, sesiones ni secretos ni repetir pruebas de otros clientes.

Recuperación: `git show 5be3478:odd/tasks/gentle-context-migration.md` y
`git show 5be3478:docs/audits/context-migration-2026-10-27.md`. Contienen los pedidos,
verificaciones, publicación y fallos posteriores completos; no duplicar aquí su
bitácora. Runs `40531859410` y `40532392594` quedaron failure; no se convierten en
pass ni se reparan dentro de esta limpieza. Estado remoto y runtime actuales no
comprobados. Los permisos de publicación/retiro externo de esa feature expiraron
con ese alcance; el pedido actual prohíbe publicación e inspección externa.
