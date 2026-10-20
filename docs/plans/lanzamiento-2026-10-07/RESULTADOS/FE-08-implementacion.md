# FE-08 — Implementación de base privada para SSR

Fecha: 2026-10-07 · Estado: implementación revisada y aceptada para integración INF-02; gate del lote pendiente. Ver [FE-08-review](FE-08-review.md).

## Cambio

`getApiBaseUrl()` ahora selecciona la base según el runtime. El browser conserva
`NEXT_PUBLIC_API_URL`; el server development conserva `DEV_API_PROXY_TARGET` y
su fallback; el server production consulta `API_INTERNAL_URL` en cada llamada y
usa el fallback público si está vacía o ausente. La base interna se normaliza
quitando barras finales. El resolver recibe la base completa con `/api` y
concatena la ruta sin agregar otro `/api`.

La lectura de `API_INTERNAL_URL` ocurre dentro del resolver, no al importar el
módulo. La variable no usa prefijo `NEXT_PUBLIC_` ni se configura en `next.config`.
La documentación de Next instalada en
`frontend/node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`
confirma que las env sin ese prefijo solo están disponibles en Node y que las
`NEXT_PUBLIC_*` se insertan en el bundle durante el build.

## Verificación ejecutada

- `pnpm run stop`: ejecutado antes de los tests; liberó los puertos 3000/3001.
- `pnpm --dir frontend exec vitest run lib/api/api-client.test.ts`: 7 tests pasaron. Cubren base privada production, normalización, resolución dinámica tras importar, browser que ignora la env privada, fallback production, proxy server development y base browser development.
- `pnpm --dir frontend run lint`: pasó, incluidos los guards de colores y URLs.
- `pnpm run typecheck`: pasó.

En la revisión Sol se amplió la suite a **10 tests**, todos en verde, después de
`pnpm run stop`. Se agregó fallback con env ausentes, prioridad/fallback de
development frente a la env de production, requests que resuelven cambios de
base después de importar, y refresh/reintento browser por `/api` preservando
credenciales y headers. La fixture pública usa `/s/fixture`, como el consumidor
real. Lint de frontend y typecheck se repitieron y pasaron.

Una primera corrida del test enfocado encontró que una cadena vacía en
`API_INTERNAL_URL` no activaba el fallback; se corrigió para tratarla como no
configurada y la segunda corrida pasó.

## Gate pendiente

Estos tests son unitarios y usan mocks de `fetch`; no demuestran SSR real ni
ausencia del hostname interno en el bundle. INF-02 debe comprobar `/share/<slug>`
y `/carta/<id>` con fixtures a través de la imagen final y revisar el bundle del
browser. No se ejecutaron builds, Docker, DB/Redis ni el check global.
