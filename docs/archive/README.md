# Archivo, historia y evidencias

Los documentos archivados explican decisiones anteriores. No habilitan OCR,
endpoints públicos de reconocimiento, servicios externos ni nuevas ejecuciones.
El [estado actual](../estado-actual.md) y las guías técnicas son la entrada operativa.

## Nueve documentos archivados en sus rutas originales

Se agregó una cabecera explícita de histórico, sin mover el cuerpo: así siguen
funcionando enlaces relativos y anchors de documentos que los citan. El
[manifiesto](in-place-2026-10-20.json) registra el hash del cuerpo original.

| Archivo | Reemplazo operativo |
|---|---|
| [00-README.md](../files/00-README.md) | [Guía](../../frontend/docs/scanner.md) |
| [01-CONTRACTS.md](../files/01-CONTRACTS.md) | [Guía](../../backend/docs/api.md) |
| [02-EMBEDDINGS-spike.md](../files/02-EMBEDDINGS-spike.md) | [Guía](../evaluations/visual-indexer.md) |
| [07-INTEGRACION-Y-RIESGOS.md](../files/07-INTEGRACION-Y-RIESGOS.md) | [Guía](../architecture.md) |
| [08-VERSION-DISAMBIGUATION.md](../files/08-VERSION-DISAMBIGUATION.md) | [Guía](../plans/scanner-improvements.md) |
| [frontend-improve.md](../../frontend/docs/frontend-improve.md) | [Guía](../../frontend/docs/design-system.md) |
| [redesign-2026.md](../../frontend/docs/redesign-2026.md) | [Guía](../../frontend/docs/routes.md) |
| [01-frontend-product.md](../plans/01-frontend-product.md) | [Guía](../estado-actual.md) |
| [02-backend-production.md](../plans/02-backend-production.md) | [Guía](../../backend/docs/jobs.md) |

Los planes terminados no implican que todos sus escenarios históricos estén
acreditados en equipos reales. Conservá pendientes de corpus, cámara/PWA,
mediciones de duración, operación y GO en sus registros actuales.

## Bitácora de coordinación

[Snapshots completos anteriores al 20/10](orchestration-2026-10-20/README.md):
seis registros centrales más el prompt mini PC y roadmap antes de consolidar.
Manifiesto con ruta original, tamaño y hash; no reutilizar reservas ni PIDs.

## Resultados fechados y anexos preservados

- [Evaluaciones técnicas](../evaluations/): escáner, catálogo y flujos, con método
  y limitaciones de cada ensayo. El [contraste del 20/10](../evaluations/scanner-baseline-contrast-2026-10-20.md)
  acompaña al baseline histórico; ninguno certifica precisión general.
- [Resultados del lanzamiento](../plans/lanzamiento-2026-10-07/RESULTADOS/):
  implementaciones, revisiones, aceptaciones y protocolos. Los entregables humanos
  todavía vigentes no quedan invalidados por su ubicación en esta carpeta.
- [Auditoría documental](../audits/documentation-review-2026-10-20.md) e inventario
  previo a la limpieza. Es un snapshot, no un contador vivo de archivos.

Los anexos/copias/hashes y fallos se conservan sin deduplicar en sitio. En copias
de fuentes, los enlaces relativos reflejan el contexto original; no reparar su
contenido cambiando los bytes de evidencia. Algunos informes apuntan a helpers
privados temporales ya ausentes: conservar esa limitación, sin fabricar su reemplazo.
