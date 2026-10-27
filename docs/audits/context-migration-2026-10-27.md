# Migración de contexto — 27/10/2026

Gentle Shell es el entorno de orquestación elegido. Los cambios de contexto y el
retiro de orquestación Codex/OpenCode y adaptadores HerdR están aplicados por
pedido humano. **Implementación y verificación del alcance aprobadas:** comprobaciones
locales, verificador independiente, carga efectiva de configuración y confirmación
humana del respaldo. Publicación autorizada, en curso. No cambia producto,
dependencias ni servicios.
Seguimiento: [feature ODD](../../odd/tasks/gentle-context-migration.md).

## Respaldo y recuperación

- Base local: `7597e7fd6e52edc4fb9865b3c52f7e24924d63cc`.
- Rama de trabajo: `chore/gentle-context-migration`; cadena elegida, push/PR autorizados después de verificar, sin merge.
- Respaldo privado: `/Users/ysmaelalcalarico/.gentle-shell/gentle-ai/migration-backups/20261027-context/`.
- `manifest.json` registra 18 archivos externos, 417.722 bytes, rutas, modos y
  SHA-256; las 18 copias se comprobaron contra sus originales antes de editar.
- El manifiesto conserva además 2.254 hashes de documentación, evidencias y
  superficies de producto para detectar modificaciones fuera del alcance.
- No se copiaron credenciales, `.env`, sesiones ni bases de memoria.

Para revertir configuración externa, primero cerrar los clientes afectados sin
interrumpir los servidores de la aplicación. Comparar cada archivo con el hash
posterior de esta entrega: si cambió desde entonces, reconciliar en vez de
sobrescribir. Restaurar únicamente las rutas del manifiesto desde `original/`,
con sus modos originales. Los adaptadores retirados se conservan en `disabled/`;
no agregarlos de vuelta además de restaurar su copia original. Una restauración
es una acción explícita, no un comando automático de arranque.

Los cambios locales se revierten por unidad de commit, preservando trabajo
posterior. La base Git conserva los textos completos previos; no se duplican
esos cuerpos en el contexto de arranque.

## Alcance global

| Superficie | Acción aplicada | Preservado |
|---|---|---|
| `~/.codex/AGENTS.md` | Retirar bloques marcados de orquestación y routing | Persona, Engram y CodeGraph |
| `~/.codex/config.toml` | Desactivar multiagente nativo | Modelo, MCP, permisos, plugins y notificaciones ajenas |
| `~/.codex/hooks.json` | Retirar invocaciones HerdR y auxiliares de orquestación Gentle | Hooks NotchBuddy intactos y en su orden |
| `~/.codex/skills/herdr-dev-servers/` | Sacar del descubrimiento, conservar copia | Skills generales compartidas |
| `~/.config/opencode/opencode.jsonc` | Retirar agentes Gentle/review y default personalizado | MCP, permisos y opciones no relacionadas |
| `~/.config/opencode/plugins/` | Retirar HerdR, review transport, registry y telemetría/model variants de Gentle | Engram |
| `~/.config/opencode/tui.jsonc` | Retirar adaptador HerdR y statusline de subagentes | Cualquier plugin no relacionado |
| `~/.gentle-shell/`, `~/.agents/skills/` | Inspección selectiva, sin alterar runtime ni skills compartidas | Configuración efectiva de Gentle Shell |

Los cuatro directorios autorizados no tienen entrada `.git` propia. No se
identificaron ni recorrieron otros repositorios externos: no se había autorizado
una ruta concreta adicional. Los hooks de HerdR declaran ser administrados; una
reinstalación/actualización puede reactivarlos. No se modifica la aplicación HerdR.

## Verificación y límites

- Respaldo inicial: 18/18 hashes iguales; manifiesto legible.
- Explorador de auditoría: no disponible por falta de credencial del proveedor;
  sin reintentos. No se instalaron dependencias para resolverlo.
- Documentación: no aplica RED/GREEN de producto. Se comprobaron retiro y
  preservación sobre la interfaz declarativa y carga por comandos públicos de
  los clientes. No se iniciaron conversaciones de modelo ni ejecutaron hooks.
- La validez sintáctica no acredita el arranque de los clientes. No se detienen
  servidores ni se reactivan automatizaciones Codex PAUSED para comprobarlo.
- Riesgo: ítems 3 y 5; configuración compartida por otros proyectos. La revisión
  independiente y la comprobación de sesiones nuevas se informan por separado.

## Comprobaciones del retiro global

- Cinco archivos actualizados y diez superficies en cuarentena (sin borrado).
- Codex: persona, protocolo Engram y guía CodeGraph idénticos byte a byte; el
  TOML sólo cambia `features.multi_agent` a false en comparación semántica.
- Diez hooks no relacionados preservados exactamente y en orden; cuatro registros
  retirados (HerdR, registry y telemetría Gentle). No se alteraron permisos ni hashes
  de confianza existentes. Los registros de confianza de hooks retirados pueden
  quedar como metadata inerte; no se ejecutan ni se reutilizan desde esta migración.
- OpenCode: MCP, permisos y share sin cambios; 14 agentes y default personalizado
  retirados. Sólo `engram.ts` permanece en la carpeta de plugins del servidor;
  su hash es el original. TUI no relacionada y logo Gentle intactos.
- 18 hashes de respaldo y cinco hashes posteriores comprobados; los archivos en
  cuarentena coinciden con sus copias originales. `after.json` guarda el inventario
  posterior. No se instalaron paquetes ni se ejecutaron hooks.
- La carga efectiva por procesos nuevos se comprobó al cerrar (detalle abajo).
  Las sesiones interactivas ya abiertas pueden retener configuración anterior;
  no se forzó su reinicio ni se las presenta como migradas en caliente.

## Medición

La auditoría contó 364 Markdown regulares (3,71 MB), 7 entradas de skills locales
(69,7 KB) y 16 symlinks. Son inventarios de disco, no tokens inyectados.

Línea base de superficies relevantes: `AGENTS.md` 16.630 bytes;
`docs/orquestacion-codex.md` 13.463; Codex global `AGENTS.md` 109.253;
OpenCode `opencode.jsonc` 148.626, con 14 agentes y default `gentle-orchestrator`.
Resultados medidos: `AGENTS.md` local 6.705 bytes (59,7 % menos);
Codex global `AGENTS.md` 20.968 bytes (80,8 % menos); OpenCode config 14.054 bytes
(90,5 % menos) y cero agentes personalizados de los 14 previos.
No son mediciones de tokens ni de coste facturado. El ahorro efectivo requiere
comparar sesiones nuevas con misma tarea/modelo y registrar el uso real.

El backlog conserva 38 IDs de lanzamiento/18 abiertos, sin ejecutar producto;
los registros anteriores se señalan como snapshots. Tres memorias estables
recogen flujo, fuentes y autoridad de tareas, además de la copia ODD de continuidad.

## Cierre local y límites externos

El harness rechazó la comprobación final de lectura (preservación de los 2.254
archivos, enlaces y diff/status) con el mensaje exacto:

> Permission configuration is human-controlled. Use the mode settings UI; model tools cannot change it.

No se obtuvo exit code ni salida del proceso. No se reintentó ni se modificó la
configuración de permisos para eludir el bloqueo. El diagnóstico posterior halló
un guard léxico en Gentle Pi 4.3.0: bloquea shell que menciona literalmente su
configHome, incluso en lectura, antes de comprobar el modo. **No hay solicitud
pendiente para aprobar y cambiar a YOLO no resuelve ese guard.** La indicación
anterior de buscar una autorización en la UI fue incorrecta.

Por pedido humano de terminar, se hizo una comprobación distinta, limitada al
proyecto y su base Git: exactamente 12 documentos cambiados, 212 destinos locales
existentes y ningún cambio en producto, scripts o manifiestos. Salida 0; también
`git diff --check` pasó tras corregir una línea vacía al final de este informe.
No se accedió al respaldo protegido ni se afirma haber ejecutado el chequeo denegado.
No se repitieron suites/builds de producto ni se intervinieron servicios.

Los commits se registran en el [documento de feature](../../odd/tasks/gentle-context-migration.md).
Los cambios globales están fuera de Git y se revierten por el respaldo privado,
no revirtiendo los commits locales. Las comparaciones diferenciales de configuración
de la sección anterior terminaron aprobadas antes de la denegación.

### Verificación final tras intervención humana

El primer intento independiente no arrancó por `No API key found for openai-codex`.
Luego el usuario autenticó el proveedor y confirmó: «ya me logge con openai-codex
asi que podes avanzar. El respaldo quedo ok.» No se leyó otra vez el directorio
protegido: el respaldo se acredita por la comprobación inicial y esta confirmación
humana, no por un nuevo rehash automatizado.

- `gentle-ai-verify`, tarea `mvqtihn1-3-mmyp`: **aprobación declarativa**, sin
  bloqueadores reproducidos de preservación. Comprobó los 12 documentos,
  213 referencias locales, cuerpos históricos idénticos y conciliación de
  38 IDs/18 abiertos. TOML y JSON/JSONC válidos; retiro de bloques, hooks y
  agentes personalizados verificado; integraciones ajenas presentes.
- Los probes exploratorios con predicados demasiado amplios dieron 1; los
  readbacks aclaratorios dieron 0. No fueron regresiones de producto. La prueba
  independiente no compara contra el respaldo protegido ni afirma equivalencia
  byte a byte de las configuraciones externas previas.
- Spotcheck del padre: `git diff --check`, salida 0.
- Ayuda de ambos clientes disponible. Prueba funcional de carga efectiva:
  `codex features list && opencode agent list`, **salida 0**. Codex muestra
  `multi_agent=false`; OpenCode lista sólo `build`, `compaction`, `explore`,
  `general` y `plan`, sin los 14 agentes personalizados retirados.
- Advertencia no fatal de Codex: `WARNING: failed to clean up stale arg0 temp dirs:
  Permission denied (os error 13)`. Ambos comandos completaron; no se borraron
  temporales ni se ampliaron permisos para ocultar la advertencia.
- No se iniciaron conversaciones con modelos: no se cambió ese flujo, y no es
  necesario incurrir en llamadas facturables para comprobar retiro/carga de
  configuración. No se afirma haber probado conversaciones ni sesiones abiertas.
- No se corrieron suites/builds de producto, no aplicables al alcance documental,
  ni se detuvieron servicios. No se afirma ahorro de tokens medido.

Implementación local confirmada: `7587266`, `daec3f4`, `bbbf247`, `4c21eeb` y
`cf36947`; el cierre posterior se registra en la feature ODD. Los controles
nativos previos devolvieron `reviewDue=false`; para el candidato exacto
`sha256:1896da566e973cfbe06e539ce397624458b3151bf5d61e7216b91e91461e867c`, el host
registró revisión declinada, `lineage_created=false`. No hay recibo aprobado;
la verificación independiente sí fue ejecutada posteriormente.

T1-T7 completos dentro del alcance y método indicados. Resta la entrega remota
T8, autorizada por el usuario; no se confunde cierre técnico con aprobación de
merge ni se cambian controles del harness.
