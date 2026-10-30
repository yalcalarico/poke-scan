# Datos y cambio de clave

`PATCH /api/users/me` acepta únicamente `displayName` (texto recortado de 1–80 caracteres). Reutiliza el select público del usuario autenticado; no cambia email, username ni preferencias monetarias. Los datos privados sólo se devuelven al dueño detrás de JWT.

`POST /api/auth/password-changes` requiere JWT, JSON, encabezado `X-Session-Request: 1` y origen permitido. Payload: `{ currentPassword, newPassword }`. Clave nueva: 8–72 caracteres sin recortar; clave actual hasta 72. Rate limit: tres pedidos/minuto en el throttler de aplicación.

La verificación argon2 y el hash nuevo ocurren antes de la transacción. Dentro del mismo lock por usuario usado en login/refresh/reset se revalidan hash y authVersion, se cambia el hash, se incrementa authVersion y se revocan refresh y recovery tokens. No emite sesión nueva. Éxito `{ success: true }`, `private, no-store` y cookie refresh eliminada. Clave incorrecta o versión obsoleta devuelve 401 sin invalidar credenciales vigentes. El cliente no reenvía automáticamente este POST.

Pruebas: `pnpm --dir backend exec vitest run src/modules/auth/password-change.http.spec.ts`. Fixtures de cuenta aisladas; no usar cuentas reales. El stub de guard en esta prueba no acredita JWT firmado; el gate completo debe comprobarlo con el guard real.
