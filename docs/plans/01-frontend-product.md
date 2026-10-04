> Nota de vigencia (2026-10-03): este documento conserva evidencia histórica. La lectura de texto y el comparador fueron retirados; el flujo actual usa únicamente DINOv2. Consultá [scanner.md](../../frontend/docs/scanner.md).

# Plan Frontend: Producto, UX e Integración

> Plan de trabajo del frontend. Todo lo que está en **Fase 0–5** está hecho o en
> curso. Lo que quedó fuera está en §"Fuera de alcance" con el motivo.

## Objetivo

Cerrar las capacidades backend ya disponibles, corregir inconsistencias de UX,
mejorar la robustez del cliente y dejar documentado el estado real del frontend.

## Restricciones

- Mantener Next.js 16, React 19 y Tailwind 4.
- No introducir colores Tailwind crudos (`app`, `components`, `lib`, `hooks`).
- `pnpm --dir frontend run lint` incluye `check-no-raw-colors.mjs` y
  `check-no-url-spaces.mjs`.
- `pnpm --dir frontend run test`, `pnpm run typecheck`.
- Verificación visual en viewport móvil de 390 px.
- Respetar `frontend/docs/design-system.md`.
- No reintroducir una segunda versión del frontend.
- No importar Tesseract desde Server Components.
- Si cambia un DTO o una respuesta, actualizar `frontend/types/api.ts` junto con
  el backend.

## Fase 0: Preparación

### 0.1 Baseline

```bash
pnpm --dir frontend run lint
pnpm --dir frontend run test
pnpm run typecheck
pnpm --dir frontend run build
```

### 0.2 Contratos

Comparar `frontend/types/api.ts`, `frontend/lib/api/*.ts`, los DTOs del backend y
`backend/docs/api.md`. No modificar contratos por inferencia.

## Fase 1: Integraciones de producto

Las tres son el mismo trabajo conceptual: **el backend ya puede, la UI todavía
no lo pide**.

### 1.1 Ordenar el catálogo por precio (B2)

- `frontend/components/search/catalog-search.tsx`
- `frontend/components/search/search-controls.tsx`
- `frontend/lib/api/cards.ts`

- Estado `sort` en la URL: `name` · `rarity` · `number` · `price`.
- `direction` (`asc`/`desc`) solo cuando **no** hay `q`: el score de relevancia no
  es invertible, así que con texto el backend ignora el orden.
- Cambiar sort o direction **resetea la paginación** y conserva el resto de los
  filtros.
- La URL reproduce la pantalla después de un refresh.

### 1.2 Filtro server-side "para intercambio" (B6)

- `frontend/components/collections/collection-detail.tsx`
- `frontend/lib/api/collections.ts`

- Pasar `forTradeOnly` a `listItems` y borrar el `.filter()` client-side.
- Borrar el `Alert` de honestidad: el filtro ya no es parcial.
- El `count` del backend manda sobre la paginación.
- Compone con `duplicatesOnly` (el backend ya lo resuelve en el mismo `where`).

### 1.3 Portada de colecciones (B9)

- `frontend/components/collections/collections-screen.tsx`
- `frontend/components/collections/collection-card.tsx`

- Pasar `collection.cover` a `CollectionCard`.
- Mosaico con las imágenes disponibles; fallback a la marca para colecciones
  vacías.
- `alt=""` en la portada: es decorativa, el nombre ya está al lado.

## Fase 2: Scanner y sesión

### 2.1 Límite de 30 escaneos

El storage ya recortaba a 30 y el estado React no. Una función de normalización
única (`normalizeSession`) recorta a 30 y se aplica en:

1. lectura del storage,
2. alta de un escaneo en el estado React,
3. armado de lo que se pasa a `OrganizeSheet`.

### 2.2 Validación de storage

Guards reales en vez de casts estructurales. Si el formato cambia, versionar la
clave y descartar lo que no se puede leer en vez de romper el arranque.

## Fase 3: Auth y cliente API

- `refreshUser()` siempre cierra `isLoading`, incluso sin sesión.
- 401 en `/colecciones/[id]/sets` se traduce a "Iniciá sesión", no a un error
  genérico de servidor.

## Fase 4: Verificación

`pnpm run check` en verde, más verificación manual en 390 px de `/buscar`,
`/carta/[id]`, `/escanear`, `/colecciones`, `/colecciones/[id]` y `/share/[slug]`.

## Fase 5: Documentación

`frontend/docs/testing.md`, `components.md`, `redesign-2026.md` y
`frontend-improve.md` tienen que dejar de afirmar cosas que ya no son ciertas.

## Fuera de alcance

| Tema | Por qué |
|---|---|
| Cola de precios persistente | Es backend, y cambia la arquitectura de jobs. Va en `02-backend-production.md` |
| Migración a Scrydex | Depende de plata y decisión de producto |
| `share_target` del manifest | Se sacó en vez de prometer una función inexistente. Arreglarlo es una feature |
| Endpoint de bulk | No existe. Las acciones masivas iteran `PATCH` con tope declarado en la UI |
| Virtualización de grids | `useChunkedList` ya resuelve el caso real (troteo en 60) |
