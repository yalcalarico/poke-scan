# UX-03 — Revisión/corrección documental

Fecha: 8/10/2026. Revisor: Sol HIGH. Especificación inicial: Luna.

**Resultado: ACEPTADO como especificación para BE-04/FE-03**, después de las correcciones en [UX-03-valores.md](UX-03-valores.md). Implementación, participantes y gate integrado del lote valores siguen pendientes.

## Correcciones acotadas

- `valuation.amount` canónico solo para agregados; referencia individual `market`, subtotal del item por cantidad y top cards por campos existentes. Cero válido, vacío, null y subtotal parcial separados; cero legacy privado preservado sin deducir null.
- Mapeo a rutas/componentes reales: ficha con hoja de variantes, sin selector nuevo; top cards mantiene límite/agrupación/ranking y recibe `reference`, sin coverage. Share conserva USD, hasta 500 grupos visibles y cobertura por copias del scope completo.
- Consulta, upstream y evaluación cacheada separados; copy concreto para fresh/stale/unknown y mezclas. Contadores de consulta solo sobre copias cotizadas; no exigir contadores upstream ni fuentes/variantes del agregado que el contrato no da.
- Historia de carta conserva envelope y variante nullable “mejor disponible por día”; portfolio deriva cobertura del snapshot con recency/evaluatedAt null. Share no tiene historial. ARS usa cambio actual y no representa ganancia ni precio realizable local.
- Estados/copy, reflow, foco, semántica de error/carga y sheet alineados con primitivas existentes; sin rediseño global ni promesa de refresco de proveedor.
- Rúbrica 9/10 alineada con RES-03: referencia internacional/ARS, parcialidad/desconocido y condición. Primera explicación espontánea, diagnóstico separado, denominador por participantes que inician, completitud y abandonos explícitos; sin resultados inventados.

## Verificación y límites

Lectura local de AGENTS raíz/frontend, skill [frontend-ios-elegante](/Users/ysmaelalcalarico/.codex/skills/frontend-ios-elegante/SKILL.md) y dirección visual, design system/build guide, UX-03/DEC-03, contrato BE-04 aceptado y RES-03. Contrastados rutas, `CardPriceSection`, `PriceHero`, `PriceTable`, `PriceHistory`, `ItemSheet`, `CollectionItemDetails`, `CollectionSummary`, `PortfolioOverview`, `PublicCollectionView` y `PublicCardGrid` actuales.

Verificados referencias locales, ejemplos aritméticos y whitespace/marcadores de conflicto en ambos documentos. Es verificación documental, no prueba del producto. Sin código/DTO/schema/planes/registro, servicios, DB/Redis/Docker, suites, pnpm check ni red; cambios locales ajenos preservados. No acredita validación visual, accesibilidad ejecutada, teléfonos ni comprensión con participantes.

**Liberadas ambas reservas:** UX-03-valores.md y UX-03-review.md. No quedan writers, procesos o suites propios activos. Coordinación conserva estados/planes y habilita implementación BE-04/FE-03 con revisión y gate integrado al cierre del lote.
