# Migración de contexto — 27/10/2026

Gentle Shell es el entorno de orquestación elegido. Esta entrega consolida el
contexto del proyecto y retira la orquestación de Codex/OpenCode y sus adaptadores
HerdR por decisión humana explícita. No cambia producto, dependencias ni servicios.
Seguimiento: [feature ODD](../../odd/tasks/gentle-context-migration.md).

> Registro inicial de respaldo/rollback, conservado por su procedimiento único.
> Las acciones previstas y límites de abajo son del corte inicial, no pendientes
> actuales. El cierre posterior está en `5be3478` (misma ruta en Git) y quedó
> reconciliado en la feature. No se inspecciona configuración externa ni se
> acredita su estado actual con este documento. Los fallos de CI de integración
> del cierre histórico no se declaran aprobados.

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

| Superficie | Acción prevista | Preservar |
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

## Medición

La auditoría contó 364 Markdown regulares (3,71 MB), 7 entradas de skills locales
(69,7 KB) y 16 symlinks. Son inventarios de disco, no tokens inyectados.

Línea base de superficies relevantes: `AGENTS.md` 16.630 bytes;
`docs/orquestacion-codex.md` 13.463; Codex global `AGENTS.md` 109.253;
OpenCode `opencode.jsonc` 148.626, con 14 agentes y default `gentle-orchestrator`.
La comparación final medirá bytes/entradas, sin prometer porcentajes de tokens.
