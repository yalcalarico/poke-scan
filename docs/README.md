# Documentación de PokéScan

Para arrancar: [README del proyecto](../README.md). Para trabajar:
[AGENTS](../AGENTS.md), [estado del producto](estado-actual.md) y
[backlog ODD](../odd/backlog.md). Los recibos fechados no prueban runtime actual.

## Guías por necesidad

| Necesidad | Fuente |
|---|---|
| Arquitectura y restricciones | [Arquitectura](architecture.md), [decisiones](decisions.md), [seguridad](security.md) |
| Catálogo y proveedores | [Fuentes](data-sources.md), [proveedores backend](../backend/docs/providers.md) |
| Contratos y persistencia | [API](../backend/docs/api.md), [base de datos](../backend/docs/database.md), [módulos](../backend/docs/modules.md) |
| Precios y operación de jobs | [TCGCSV](../backend/docs/pricing.md), [jobs](../backend/docs/jobs.md), [métricas privadas](../backend/docs/metrics.md) |
| Frontend y diseño | [Rutas](../frontend/docs/routes.md), [componentes](../frontend/docs/components.md), [construcción](../frontend/docs/build-guide.md), [design system](../frontend/docs/design-system.md) |
| Sesión y reconocimiento | [Cliente API](../frontend/docs/api-client.md), [escáner DINOv2](../frontend/docs/scanner.md) |
| Gráficas y colecciones | [Historial de fuente única](../frontend/docs/comparison.md), [portafolio](../frontend/docs/portfolio.md) |
| Pruebas y trampas | [Testing backend](../backend/docs/testing.md), [frontend](../frontend/docs/testing.md), [gotchas backend](../backend/docs/gotchas.md), [frontend](../frontend/docs/gotchas.md) |

## Operación y continuidad

- [Red local/HTTPS](local-network.md), [mini PC + Tunnel](infra/PROMPT-mini-pc-cloudflare.md),
  [Resend](infra/resend-recovery.md), [backups/restore/custodia](../infra/inf03/README.md).
  Cuentas, publicación y equipo real mantienen permisos y gates propios.
- [Evaluación beta](beta/README.md): instrumento y protocolos, no participantes ni
  resultados inventados.
- [ODD](../odd/README.md) y [Gentle Shell / Engram](agent-workflow.md): una autoridad
  de tareas por feature; no mantener backlogs en los informes.
- [Historia y evidencia protegida](archive/README.md): recuperación desde Git,
  límites de reproducibilidad y consumidores que impiden purgar anexos.

Los roadmaps y los 18 IDs abiertos de lanzamiento se consultan desde el backlog,
no se suman entre sí ni autorizan implementaciones automáticamente. La separación
frontend/backend conserva contratos y procedimientos propios de cada capa.
