# Trabajar con Gentle Shell sin duplicar el harness

Gentle Shell es el entorno elegido para coordinar este proyecto con ODD y Engram.
`AGENTS.md` conserva sólo reglas particulares de PokéScan. No hay que reproducir
roles, prompts, menús de revisión ni selección de modelos del harness en el repo.

## Recuperación mínima

1. Leer el pedido actual y `AGENTS.md`; para continuidad, el
   [estado vigente](estado-actual.md) y el [índice ODD](../odd/README.md).
2. Identificar la feature y recuperar su documento ODD antes de continuar. El
   documento de feature es la autoridad de sus tareas; el todo visible es una
   proyección, no otro backlog independiente.
3. Para conocimiento previo, consultar Engram por proyecto/tema y abrir sólo
   observaciones relevantes. Contrastarlas con código y documentación actual.
4. Abrir la sección pertinente del [índice técnico](README.md), no todas las guías.
   Leer los archivos extensos por encabezados, búsquedas y rangos.
5. Consultar evidencia histórica sólo por ID/pregunta. No seguir enlaces simbólicos
   en búsquedas recursivas ni sumar checkboxes históricos como tareas vigentes.

## Qué pertenece a cada capa

| Capa | Autoridad |
|---|---|
| Harness Gentle Shell | ODD, rutas de delegación/revisión y capacidades disponibles |
| `AGENTS.md` | Restricciones técnicas y gates propios del proyecto |
| Documento ODD de feature | Specs, tareas, evidencia y bloqueos de esa feature |
| Guías técnicas | Contratos e instrucciones operativas verificables |
| Engram | Decisiones/descubrimientos con alcance, fecha y rutas de respaldo |
| Archivo y reportes | Evidencia fechada; nunca permisos o estado vivo |

No copiar bitácoras enteras a Engram ni importar todos los Markdown. Una memoria
no sustituye contratos o tareas versionadas. La copia ODD de recuperación debe
reconciliarse con el archivo, no elegirse sólo por fecha. Un dato obsoleto se
contrasta antes de usarlo; no se marca revisado automáticamente.

## Operación

Ejecutar comandos mediante las herramientas del entorno activo. HerdR ya no es
requisito para iniciar/verificar/detener la app. Antes de actuar sobre un servidor,
comprobar ownership y autorización vigente; mantener gates de `AGENTS.md`.
Conservar la automatización Codex PAUSED y los permisos propios de publicación,
cuentas externas y operaciones irreversibles. El retiro de integraciones no los cambia.

Las skills genéricas de diseño no autorizan npm, colores crudos, `tailwind.config.js`
ni instalar shadcn sobre el sistema actual. Las reglas del proyecto prevalecen.
Las skills compartidas de uso general se conservan; no se borran por estar
instaladas también para otro cliente.

La política Codex anterior se conserva en el historial Git y su ruta funciona
como [entrada compatible](orquestacion-codex.md). Detalles del respaldo externo,
rollback y límites de validación: [entrega de migración](audits/context-migration-2026-10-27.md).
