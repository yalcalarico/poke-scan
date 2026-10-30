# Vitrina personal

`GET /api/showcase` y `PATCH /api/showcase` requieren JWT vigente; las respuestas son `private, no-store`. El PATCH acepta `{ mode: "value" | "personal", cardIds: string[] }`: hasta 60 IDs únicos, sólo de cartas presentes en colecciones propias. Un rechazo no modifica preferencias.

La preferencia persiste por usuario en `showcase_preferences`. La lectura filtra ownership actual: una selección cuya carta ya no pertenece al usuario no expone datos del catálogo por ese ID. Todas las referencias usan el mismo helper local TCGCSV/TCGplayer/USD que el portafolio; no descarga proveedores ni fabrica observaciones. `value` elige hasta tres cartas distintas por referencia unitaria, no por cantidad. Sin referencias devuelve lista vacía. `personal` conserva el pool elegido y permite cartas sin precio con `market: null`; cero conocido no es ausencia. Si existen varias variantes propias, toma la de mayor referencia disponible, estable por variante.

Pruebas HTTP aisladas: `pnpm --dir backend exec vitest run src/modules/showcase/showcase.http.spec.ts`. Serializar con otras suites de DB y detener el runtime antes. Migración aditiva `20261029181255_vineta_product`.
