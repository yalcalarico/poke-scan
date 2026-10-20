# FE-04 — implementación de recuperación de cuenta

Se agregó `/recuperar` como flujo funcional enlazado desde el login. La ruta distingue solicitud, enlace válido, enlace inválido/no disponible y resultado incierto. La solicitud usa el mensaje genérico del contrato y conserva el reenvío como acción manual después de 60 segundos locales. El cambio de contraseña exige coincidencia local y muestra éxito solo ante HTTP 200 con `{ success: true }`; los fallos inciertos no limpian la sesión y ofrecen iniciar sesión como acción principal y pedir otro enlace como secundaria.

Un script raíz `beforeInteractive` captura el fragmento exacto `#token=<43 base64url>`, preserva `history.state`, lo elimina con `replaceState` antes de hidratar la UI y mantiene el valor únicamente en memoria. Si no puede limpiarlo, bloquea el flujo. También detecta navegaciones cliente, `hashchange`, `popstate`, `pagehide` y `pageshow`; volver a una entrada marcada sin secreto queda no disponible. La ruta es dinámica, `noindex`, `no-store` y `no-referrer`. El service worker excluye la navegación de recuperación y elimina sus entradas existentes al activar la versión v5.

El cliente hace POST de recuperación de una sola vez, sin bearer, refresh ni replay; exige el estado HTTP exacto, filtra códigos/campos y solo expone `Retry-After` entero positivo. El token de sesión en memoria usa una época para ignorar respuestas 401/refresh tardías. Login, registro, logout y cambio de contraseña serializan sus mutaciones para que respuestas de cookies no se crucen; el provider evita que respuestas viejas restauren o limpien el estado de una generación posterior.

## Validación

- `pnpm run stop`: ejecutado antes de la suite.
- `pnpm --dir frontend exec vitest run`: 63 archivos, 503 tests aprobados.
- `pnpm --dir frontend run lint`: aprobado; incluye guardas de colores y URLs.
- `pnpm --dir frontend exec tsc --noEmit`: aprobado.
- Pruebas añadidas para captura/strip/fail-closed/entrada cliente/back, estado HTTP y no replay, envío único bajo StrictMode, éxito/incertidumbre, fencing de 401/refresh y serialización logout-login, y purga del service worker.

No corrí build ni verificación en navegador. Quedan para el gate posterior las vistas a 390/1280 en claro/oscuro y la navegación real con teclado/bfcache, que Vitest no acredita. El primer test posterior al bump de service worker falló porque su fixture esperaba v4; se actualizó para representar v5 y se repitió la suite completa, que quedó verde.

## Archivos FE-04

- `frontend/app/(auth)/recuperar/page.tsx`
- `frontend/app/layout.tsx`
- `frontend/components/auth/login-form.tsx`
- `frontend/components/auth/recovery-experience.tsx` y su test
- `frontend/hooks/use-auth.tsx`
- `frontend/lib/api/api-client.ts`, `auth.ts`, `index.ts`, `token-storage.ts` y tests de recuperación/generación
- `frontend/lib/recovery/recovery-capture-script.ts`, test y `recovery-view.ts`
- `frontend/next.config.ts`
- `frontend/public/sw.js`
- `frontend/lib/__tests__/service-worker-routing.test.ts` (fixture de versión y purga sensible)
- `frontend/docs/api-client.md`, `routes.md`, `testing.md`

No cambié `frontend/types/api.ts`: los DTOs de recuperación ya estaban presentes en el árbol recibido. No edité archivos centrales de planes, estado o checklist.
