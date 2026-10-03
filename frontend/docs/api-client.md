# Cliente HTTP, tokens y sesión

`lib/api/` es la puerta de salida al backend. `apiFetch` conserva el manejo de
errores y el reintento único tras un 401. Todas las llamadas incluyen
`credentials: include`; los POST de auth agregan `X-Session-Request: 1`.

`AuthResponseDto` contiene `accessToken` y `user`. El refresh token llega
exclusivamente como cookie HttpOnly: el cliente no lo recibe por JSON, no lo
lee y no lo persiste. `setTokens(access)` guarda el access token en memoria;
`hasSession()` consulta una pista booleana en localStorage o el token en
memoria. `clearTokens()` borra ambos. También se eliminan los tokens legados
`pcs.refreshToken` y `pcs.accessToken` de los storages.

Después de recargar, `getMe()` recibe 401 sin el access token y
`refreshSession()` usa la cookie para recuperar la sesión. Mantiene una
promesa compartida por pestaña y usa Web Locks cuando está disponible para
serializar renovaciones entre pestañas. Una renovación rechazada borra la
pista local; los errores de red devuelven null sin exponer credenciales.
`logout()` siempre llama a la API con un body vacío, incluso sin access token,
para que el servidor revoque y borre la cookie; limpia el estado en finally.

`skipAuth` omite Bearer y la renovación automática; se usa para login,
registro, logout y endpoints públicos. `ApiError` expone el status y aplana
el array `message` del ValidationPipe. `buildQueryString` omite valores
vacíos, null, undefined y números no finitos. `getApiBaseUrl()` devuelve la
URL pública configurada; `NEXT_PUBLIC_*` se fija durante el build.

El resto de los módulos (`cards`, `collections`, `share`, `currency`,
`identify`) conserva su contrato. Los endpoints y campos están en
[API](../../backend/docs/api.md). Para el despliegue, CSRF y el requisito de
frontend/API bajo el mismo sitio HTTPS, consultá
[seguridad](../../docs/security.md).
