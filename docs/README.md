# Documentación de PokéScan

La documentación operativa describe el código actual. Los planes archivados y
recibos fechados explican decisiones y evidencias; no son órdenes para repetir
trabajo ni estados vivos de procesos.

## Empezar y desarrollar

| Necesidad | Guía |
|---|---|
| Instrucciones del proyecto | [AGENTS](../AGENTS.md) |
| Hitos y pendientes vigentes | [Estado actual](estado-actual.md) |
| Método de trabajo | [Orquestación](orquestacion-codex.md) |
| Diseño del sistema | [Arquitectura](architecture.md), [decisiones](decisions.md) |
| Catálogo, precios, límites y alternativas | [Fuentes](data-sources.md), [providers](../backend/docs/providers.md) |
| API y persistencia | [API](../backend/docs/api.md), [base de datos](../backend/docs/database.md), [módulos](../backend/docs/modules.md) |
| Cronjobs, cola y operación de precios | [Jobs](../backend/docs/jobs.md), [precios](../backend/docs/pricing.md) |
| Frontend | [Rutas](../frontend/docs/routes.md), [componentes](../frontend/docs/components.md), [construcción](../frontend/docs/build-guide.md), [diseño](../frontend/docs/design-system.md) |
| Sesión y reconocimiento | [Cliente/sesión](../frontend/docs/api-client.md), [escáner DINOv2](../frontend/docs/scanner.md) |
| Gráficas | [Comparación](../frontend/docs/comparison.md), [portafolio](../frontend/docs/portfolio.md) |
| Verificación | [Backend](../backend/docs/testing.md), [frontend](../frontend/docs/testing.md) |
| Trampas conocidas | [Backend](../backend/docs/gotchas.md), [frontend](../frontend/docs/gotchas.md) |

## Operación y evaluación pendientes

- [Mini PC + Cloudflare Tunnel: prompt para el final](infra/PROMPT-mini-pc-cloudflare.md).
- [Red local/HTTPS para dispositivos](local-network.md).
- [Resend: preparación y activación futura](infra/resend-recovery.md).
- [Backups, restore y custodia](../infra/inf03/README.md).
- [Herramienta HTML de evaluación beta](beta/README.md).
- [Roadmap abierto del escáner](plans/scanner-improvements.md).
- [Registro de tareas](plans/lanzamiento-2026-10-07/REGISTRO-TAREAS.md),
  [checklist](plans/lanzamiento-2026-10-07/STATUS-CHECKLIST.md) y
  [decisiones entre áreas](plans/lanzamiento-2026-10-07/10-decisiones-y-contratos.md).

## Historia y evidencias

[Archivo documental](archive/README.md) separa planes sustituidos, snapshots de
coordinación y resultados fechados. Los anexos mantienen sus bytes, rutas y
hashes. Consultar la limitación/fecha de cada ensayo antes de usarlo como evidencia.
