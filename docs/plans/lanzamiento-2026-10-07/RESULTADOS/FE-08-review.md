# FE-08 — Revisión de base privada para SSR

Fecha: 2026-10-07 · Revisor: GPT-6.1 Sol HIGH · Estado: **aceptado para integrar INF-02; gate del lote pendiente**.

La revisión leyó AGENTS raíz/frontend, FE-08, INF-02-review, implementación, guía
Next instalada de environment variables y consumidores de compartir/ficha.
No encontró defectos funcionales pendientes en `getApiBaseUrl()`. No hizo falta
cambiar código de producción: se ampliaron pruebas y aclaraciones documentales
dentro de la reserva FE-08.

## Contrato verificado

- El browser retorna la base pública antes de consultar env privadas. Con
  `NEXT_PUBLIC_API_URL=/api` y env interna presente, sus requests usan `/api`.
- El server production consulta `API_INTERNAL_URL` dentro de cada llamada,
  recorta barras finales y concatena rutas sin agregar `/api` nuevamente. Dos
  requests consecutivos usan una base privada cambiada después del import.
- Ausente o vacía, la env privada mantiene el fallback anterior, incluida la
  URL local si la base pública también está ausente. Un fallback público `/api`
  sigue siendo relativo: la configuración interna de INF-02 es necesaria para
  el SSR del despliegue elegido.
- Development conserva prioridad y comportamiento de `DEV_API_PROXY_TARGET`,
  incluyendo su fallback público; omite la env privada de production.
- No se cambian tokens, cookies, refresh, UI, rutas, DTO, Docker, configuración
  Next ni paquetes. La regresión browser de 401 → refresh → reintento conserva
  `credentials: include`, `X-Session-Request`, body de refresh y Authorization
  actualizado; las tres URLs siguen en la base pública.

La revisión estática confirma que `API_INTERNAL_URL` no tiene prefijo público,
no está expuesta por `next.config.env` ni se devuelve como contenido de página.
La guía instalada distingue env privadas runtime de `NEXT_PUBLIC_*` fijadas en
build. Esto respalda el diseño; **no demuestra privacidad del bundle final**.

## Evidencia

- `pnpm run stop`, antes de pruebas: pasó.
- `pnpm --dir frontend exec vitest run lib/api/api-client.test.ts`: **10/10**.
- `pnpm --dir frontend run lint`: pasó, incluidos colores/URLs.
- `pnpm run typecheck`: pasó.

No se ejecutaron check global, build, Docker, DB/Redis ni stack. Los tests usan
fetch mockeado; no prueban SSR real, HTML/metadata ni políticas de cookies del
browser. `app/share/[slug]/page.tsx` consume `/s/:slug` mediante fetch sin Data
Cache y `app/(app)/carta/[id]/page.tsx` consume `/cards/:id` mediante fetch con
revalidación; ambos llaman el resolver antes de construir la URL.

## Handoff liberado

Se liberan api-client.ts/test, frontend/docs/api-client.md y reportes FE-08 para
Luna/coordinación. INF-02 puede integrar su env privada runtime y base pública
de build bajo una reserva propia. Debe probar compartir/ficha con fixtures en
la imagen final, HTML y metadata esperados, y ausencia del hostname privado en
bundle/respuesta pública. El gate global queda al cierre del lote de operación;
esta aceptación no declara FE-08/INF-02 completos ni despliegue listo.
