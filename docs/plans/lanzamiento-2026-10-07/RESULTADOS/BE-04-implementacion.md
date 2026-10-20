# BE-04 — Implementación local

Fecha: 8/10/2026. Estado: implementación revisada y corregida por Sol HIGH; [revisión enfocada aceptada](BE-04-implementacion-review.md); el gate integrado BE-04 + FE-03 queda reservado al coordinador.

## Cambios

- Se agregaron tipos y helpers de metadata para consulta, antigüedad, cobertura por copias y valuación histórica en `backend/src/common/price-metadata.ts`. El cálculo usa umbral de 24 h, fecha única de evaluación, descarta fechas inválidas/futuras para la antigüedad y distingue cero, subtotal parcial y ausencia total.
- `latestMarketPriceJoin` proyecta la fecha y procedencia de la misma fila lateral. Colecciones, portfolio y share agregan cantidad, recencia y fechas extremas en sus consultas existentes, manteniendo selección activa exacta, importes legacy, orden y límites.
- La ficha e historial de carta y los precios de items agregan los cuatro campos de metadata. Redis serializa el bloque junto a `CardPriceView`; una caché nueva conserva su instante evaluado y una entrada legacy sin campos queda `unknown`.
- Colecciones y stats conservan `totalValueUsd` legacy. `valuation.amount` expresa vacío `0`, ausencia de precio `null` y subtotal parcial; la cobertura usa copias. Portfolio incorpora cobertura/recencia y referencia de metadata a top cards; snapshots derivan cobertura de sus propios contadores y llevan `evaluatedAt`/`recency` nulos. Share calcula la cobertura de todo el scope, aunque la lista continúe limitada a 500, y agrega solo metadata explícita a la allowlist pública.
- Se espejaron tipos y parsers del frontend. Los bloques ausentes siguen aceptándose para payloads anteriores sin completar campos; bloques presentes parciales, incoherentes o inválidos se descartan. Se conservó la forma distinta de `priceArs` en ficha y colección.
- Los cleanup de prueba legacy en collections/share que antes borraban todos los emails `@test.local` ahora apuntan a las direcciones fijas de sus propios fixtures, para proteger otros datos de la base de tests.
- Documentación actualizada en `backend/docs/api.md` y `backend/docs/pricing.md`.

## Verificación ejecutada

- `pnpm run stop`: ejecutado antes de las suites; liberó puertos 3000/3001.
- `pnpm --dir backend exec vitest run src/common/price-metadata.spec.ts src/jobs/sync-prices.cache.spec.ts src/modules/collections/portfolio.service.spec.ts`: **3 archivos, 7 tests aprobados**. Sin DB/Redis ni requests a proveedores.
- `pnpm --dir frontend exec vitest run lib/api/schema.price-metadata.test.ts lib/api/schema.share.test.ts`: **2 archivos, 8 tests aprobados**.
- Primer intento de las suites DB sin escalación falló por el sandbox (`Can't reach database server`); el guard resolvió `pokemon_cards_test` y reportó el puerto API libre. Antes del segundo intento se acotaron los cleanup legacy de collections/share a sus emails de fixture propios. Con acceso local autorizado, `pnpm --dir backend exec vitest run src/modules/cards/cards.service.spec.ts src/modules/collections/collections.service.spec.ts src/modules/share/share.service.spec.ts` pasó: **3 archivos, 142 tests aprobados**. El guard confirmó de nuevo `pokemon_cards_test`; las suites terminaron con cleanup de fixtures y sin llamadas a proveedores.
- `pnpm --dir backend exec oxlint --type-aware` sobre fuentes/specs reservados: aprobado.
- `pnpm --dir backend run build`: aprobado.
- `pnpm --dir frontend exec eslint lib/api/schema.ts types/api.ts lib/api/schema.price-metadata.test.ts`: aprobado.
- `pnpm --dir frontend exec tsc --noEmit --pretty false`: aprobado.
- `pnpm --dir backend exec tsc --noEmit --pretty false`: no queda verde por errores de TypeScript preexistentes en specs fuera de esta implementación (mocks de providers en `sync-prices.service.spec.ts` y `tcgdex-set-mapping.service.spec.ts`, `cards.service.spec.ts`, `redis.service.spec.ts`) y tipos `supertest/types` faltantes en e2e. Los errores de producción introducidos por esta entrega no aparecieron; `nest build` sí pasó.

No se ejecutó `pnpm run check` global, suite Redis, setup/copia de base ni flujo con stack; corresponden al gate integrado del lote. No se tocó esquema/migraciones, cola/política, TTL, proveedor, UI ni archivos `.srl`/sesiones ajenos.

## Preservación y revisión

Varios archivos reservados ya tenían modificaciones antes del primer cambio. Se guardaron hashes de contenido inicial y el diff preexistente, y se reconstruyó ese estado para aislar el cambio propio:

- Hashes iniciales, por archivo: `/private/tmp/be04-baseline/baseline-hashes.txt`.
- Diff preexistente capturado antes de editar: `/private/tmp/be04-baseline/preexisting.patch`.
- Diff propio reservado respecto del estado inicial reconstruido: `/private/tmp/be04-baseline/own-reserved.diff`.
- Diff total actual reservado: `/private/tmp/be04-baseline/current-reserved.patch`.
- Errores del typecheck backend: `/private/tmp/be04-baseline/backend-tsc-final.log`.

No se modificaron los resultados de otras tareas ni el registro/estado global. Todas las suites lanzadas terminaron; no quedan procesos de esta implementación activos.

## Nota de revisión Sol HIGH

La revisión corrigió fechas ISO, reloj público, referencia exacta del ranking y validación de bloques nuevos en adaptadores frontend; pasó 10 unit backend + 18 frontend + 144 DB enfocadas. Los ocho errores del typecheck backend se reprodujeron en baseline aislado, sin errores nuevos. El cleanup inicial omitía dos usuarios secundarios: se completó en specs y se retiraron de TEST sólo esos dos fixtures acreditados (2 usuarios/1 colección). Las suites de revisión usaron una base TEST descartable propia ya eliminada. No hay snapshot anterior a esta implementación: este reporte no acredita preservación completa del baseline DB. Detalle y evidencia en la revisión enlazada; gate global pendiente.
