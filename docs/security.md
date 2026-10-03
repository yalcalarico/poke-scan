# Seguridad y despliegue

## Sesiones

El refresh token es opaco, aleatorio y se guarda hasheado en Postgres. La API
lo entrega exclusivamente como cookie `pcs.refreshToken`, `HttpOnly`,
`SameSite=Lax`, sin `Domain` y con `Path=/api/auth`. En producción agrega
`Secure`, por lo que el acceso debe usar HTTPS. La respuesta JSON contiene
solo `accessToken` y `user`; tiene `Cache-Control: no-store`.

El frontend mantiene el access token solo en memoria y persiste únicamente
una pista de sesión. Al recargar, renueva la sesión mediante la cookie.
Elimina los tokens legados de localStorage y sessionStorage: las sesiones de
la versión anterior requieren iniciar sesión nuevamente al aplicar este PR.

Todos los POST de `/api/auth` exigen `X-Session-Request: 1`. El frontend manda
`credentials: include`. El header obliga al browser a hacer preflight, y la
API verifica además que `Origin` coincida exactamente con `CORS_ORIGINS` o
`FRONTEND_URL`. No uses `*` ni `null`. Un cliente por terminal también debe
mandar el header y conservar las cookies (`curl -c/-b`).

Para producción usá frontend y API bajo el mismo sitio HTTPS (por ejemplo
`app.example.com` y `api.example.com`, o un proxy `/api`). Un despliegue en
sitios diferentes requiere otro diseño: esta cookie Lax no se envía en ese
caso. No cambies a `SameSite=None` sin revisar las defensas CSRF.

La rotación, la creación del token siguiente y la revocación por reuso corren
en transacciones que bloquean la fila del usuario. Dos pedidos con el mismo
token producen un solo hijo; el segundo detecta reuso y revoca las sesiones.
Si falla la creación, el token anterior sigue disponible para reintentar.
El cliente comparte una promesa por pestaña y usa Web Locks, cuando está
disponible, para serializar refresh entre pestañas.

## Secretos e infraestructura

El perfil `deploy` no tiene secretos JWT por defecto. El arranque del backend exige `JWT_SECRET`,
`JWT_REFRESH_SECRET` y `FRONTEND_URL`. El backend rechaza placeholders
`change-me…` y secretos de menos de 32 caracteres en producción. Generá dos
valores independientes con `openssl rand -hex 32` y guardalos fuera de Git.
Compose permite levantar únicamente db/redis sin esas variables; la validación
de producción ocurre al arrancar el backend, que también exige orígenes HTTPS.
El TTL de refresh admite un número finito, positivo y de hasta 365 días.

Los puertos de Postgres (55432) y Redis (6379) se publican únicamente sobre
127.0.0.1. Redis queda reservado al host y a la red de contenedores; no lo
expongas a Internet. La configuración local conserva su flujo sin password
Redis. En un servicio Redis remoto usá autenticación/ACL y TLS (`rediss://`).
Las credenciales Postgres de ejemplo son de desarrollo: reemplazalas al
desplegar y limitá el acceso de los otros contenedores a la red de confianza.

## Dependencias

Se elimina `@nestjs/mau` y el comando `nest deploy` asociado, que no forman
parte del despliegue Docker documentado. Esa herramienta traía los avisos de
`undici` y `tmp`. Prisma permanece en 6.19.3; un override acotado a
`@prisma/config>deepmerge-ts` usa 8.0.0, la versión corregida para
[GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
La generación de Prisma y el build verifican la compatibilidad del override.

Queda un aviso de desarrollo en `braces@3.0.3`, transitivo de
`eslint-config-next`: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
Al 2026-10-03 no hay parche publicado. No se ignora el advisory ni se fuerza
una versión ficticia. No se detectó un camino desde input HTTP a los globs
del linter; los patrones de lint los controla el proyecto. Actualizá la
cadena cuando exista una corrección. Un checkout de código ajeno se debe
analizar en un runner descartable sin secretos ni permisos de escritura.

## Validación remota

`security-check.yml` usa un runner con Postgres y Redis propios. Carga una
copia pública estática del catálogo fijada a un commit de
`PokemonTCG/pokemon-tcg-data`, sin acceder a pokemontcg.io ni usar datos
personales. El seed se niega a correr fuera de CI, sobre una base distinta de
`pokemon_security_test`, sobre un host remoto o sobre datos existentes.
Ejecuta `pnpm run stop` y `pnpm run check` allí, incluyendo los tests de
concurrencia, rollback, cookies, CSRF y migración de storage.

Después del check, el smoke levanta el backend y el frontend compilados en
el runner. Verifica el rechazo de un secreto inseguro en producción y el
flujo HTTP de registro, acceso, rotación, logout y CSRF con cookie Secure.
