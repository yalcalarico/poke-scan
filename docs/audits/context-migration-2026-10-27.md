# Migración de contexto — 27/10/2026

Gentle Shell es el entorno de orquestación elegido. Los cambios de contexto y el
retiro de orquestación Codex/OpenCode y adaptadores HerdR están aplicados por
pedido humano. **La comprobación local está aprobada; quedan pruebas externas
sin acreditar.** No cambia producto, dependencias ni servicios.
Seguimiento: [feature ODD](../../odd/tasks/gentle-context-migration.md).

## Respaldo y recuperación

- Base local: `7597e7fd6e52edc4fb9865b3c52f7e24924d63cc`.
- Rama de trabajo: `chore/gentle-context-migration`; cadena elegida, sin push/PR.
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
- Documentación: no aplica RED/GREEN de producto. En configuración se usarán
  aserciones de retiro y preservación sobre la interfaz declarativa, sin ejecutar
  hooks ni crear sesiones reales.
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
- La comprobación de clientes nuevos sigue separada de estas aserciones. Sesiones
  abiertas pueden retener configuración anterior y no se fuerzan a reiniciar.

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

El único intento de verificador independiente (`gentle-ai-verify`) no arrancó:
`No API key found for openai-codex`. No emitió veredicto, no se reintentó y no se
cambiaron credenciales/proveedor. T6 espera autenticación del proveedor del agente
o prueba independiente aportada por el humano; T7 conserva el chequeo protegido
y el arranque de sesiones nuevas sin acreditar. No se afirma ahorro de tokens medido.

Implementación local confirmada: `7587266`, `daec3f4`, `bbbf247` y `4c21eeb`.
Los controles nativos de las dos últimas unidades dieron respectivamente
`reviewDue=false` (con verificador independiente exigido por escalación de entorno)
y `passive/reviewDue=false`; no hubo revisión nativa iniciada ni recibo aprobado.
El cierre completo queda pendiente de esas pruebas externas, no de más cambios
al producto ni de elevar permisos del agente.
