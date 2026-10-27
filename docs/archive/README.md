# Historia y evidencia

Las guías del [índice](../README.md) describen la operación; el
[backlog ODD](../../odd/backlog.md) reúne pendientes. Un recibo fechado no acredita
runtime actual, permisos ni tareas nuevas.

## Nueve planes sustituidos: recuperación desde Git

Los originales retirados están completos en
`51332f2d9408b41e2e64175bde35cfcd6d7866e3`, incluidas sus cabeceras históricas.
Se contrastaron byte a byte antes del retiro; no se trasladaron ni dejaron stubs.

| Ruta histórica desde raíz | Reemplazo operativo |
|---|---|
| `docs/files/00-README.md` | [Escáner](../../frontend/docs/scanner.md) |
| `docs/files/01-CONTRACTS.md` | [API](../../backend/docs/api.md) |
| `docs/files/02-EMBEDDINGS-spike.md` | [Indexador](../evaluations/visual-indexer.md) |
| `docs/files/07-INTEGRACION-Y-RIESGOS.md` | [Arquitectura](../architecture.md) |
| `docs/files/08-VERSION-DISAMBIGUATION.md` | [Roadmap del escáner](../plans/scanner-improvements.md) |
| `frontend/docs/frontend-improve.md` | [Design system](../../frontend/docs/design-system.md) |
| `frontend/docs/redesign-2026.md` | [Rutas](../../frontend/docs/routes.md) |
| `docs/plans/01-frontend-product.md` | [Backlog ODD](../../odd/backlog.md) |
| `docs/plans/02-backend-production.md` | [Jobs](../../backend/docs/jobs.md) |

También se retiraron de esa misma base las copias redundantes
`docs/archive/orchestration-2026-10-20/` (ocho snapshots y su índice/manifiesto),
el manifiesto de cuerpos `docs/archive/in-place-2026-10-20.json`, los cuatro
informes/inventarios `docs/audits/documentation-*2026-10-20*` y el prompt
`docs/orquestacion-codex.md`. Las decisiones y pendientes vigentes permanecen en
las guías, contratos entre áreas y ODD; Gentle Shell aporta el método de trabajo.

Desde la raíz, leer un original sin restaurarlo:

```sh
git show 51332f2d9408b41e2e64175bde35cfcd6d7866e3:docs/files/00-README.md
git ls-tree -r --name-only 51332f2d9408b41e2e64175bde35cfcd6d7866e3 -- docs/archive docs/audits
```

Sustituí la ruta después de `:` para recuperar otro archivo. Para enlaces y
anchors históricos, consultá el árbol de **ese commit**, no el sucesor operativo.
Los comentarios de código y manifiestos de fuentes que citan planes retirados
son procedencia, no lecturas ejecutables; conservan su contexto original.

## Evidencia protegida

- [Evaluaciones](../evaluations/) y [resultados de lanzamiento](../plans/lanzamiento-2026-10-07/RESULTADOS/):
  incluyen protocolos humanos, corpus/fotos, parches sin aplicar y anexos con
  hashes. No equivalen a tareas abiertas ni se purgan por antigüedad.
- `scripts/inf03-smoke.mjs`, `scripts/inf03-review-offline.mjs` y
  `scripts/infra/inf02-review-smoke.mjs` consumen rutas de resultados. Retirarlas
  requeriría cambios ejecutables fuera de esta limpieza.
- [Proxy QA anterior y corrección](security-2026-10-20/README.md): conservar el
  snapshot y su manifiesto permite distinguir los bytes vulnerables del helper
  mantenido. No ejecutar el snapshot.
- [Respaldo de la migración anterior](../audits/context-migration-2026-10-27.md):
  procedimiento de rollback externo único; no comprobado de nuevo en esta tarea.

Las copias de fuentes y reportes de evidencia conservan bytes y enlaces de su
contexto original. Entre sus limitaciones conocidas hay helpers temporales ya
ausentes y enlaces históricos a los planes retirados (por ejemplo MKT-01-copy).
Recuperarlos desde Git, sin fabricar helpers, reescribir recibos ni modificar
hashes para aparentar reproducibilidad. Los archivos no versionados y symlinks
locales autorreferenciales quedan intactos; no seguirlos recursivamente.
