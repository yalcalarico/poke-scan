# BE-05 — recuperación de cuenta

Estado de implementación: backend y harness aislado implementados; revisión Sol6.1 HIGH pendiente. La entrega de correo productiva queda apagada hasta integrar un puerto acreditado. Sin puerto, la solicitud responde `503` antes de consultar la cuenta.

`POST /api/auth/password-recovery-requests` responde `202` con el mismo cuerpo para cuenta presente/ausente, después de la admisión compartida en PostgreSQL pero sin esperar lookup, emisión ni correo. El trabajo posterior usa un ticket de 2 s, pool máximo de 32, cancelación y drain en shutdown. Genera 32 bytes aleatorios, almacena sólo SHA-256, respeta TTL configurable (30 min por defecto) y un máximo de tres tokens activos sin evicción. El puerto debe volver a autorizar la entrega justo antes del handoff; si el usuario cambió de versión, el token venció o la generación ya no está vigente, la entrega se suprime y el token se revoca.

`POST /api/auth/password-recoveries` sólo confirma `200` después del commit. El consumo bloquea primero la fila de usuario, vuelve a leer token/versión y usa `clock_timestamp()` después del lock. En una transacción cambia el hash de contraseña, marca el token usado, revoca los otros tokens de recuperación y refresh y aumenta `authVersion`. La cookie se limpia sólo después de esa confirmación. Un refresh antiguo posterior al reset no revoca sesiones de la versión nueva.

Las cuotas usan locks consultivos y eventos PostgreSQL con HMAC-SHA-256 dedicado: 5/IP/15 min, 3/identificador/hora, intervalo mínimo de 60 s por identificador y límite global rutinario de 1000/min. Los 429 de IP/global incluyen `Retry-After`; los límites por identidad mantienen la respuesta genérica. Los eventos mayores a una hora se podan en admisiones; un rechazo IP/global no agrega hits. No se usa Redis ni estado local como fuente de cuota. `JWT_LEGACY_CUTOFF` es una fecha fija optativa: JWT sin claim se rechazan si no hay cutoff; con cutoff sólo pasan tokens anteriores a esa fecha y usuarios con versión cero. El guard valida claim y usuario contra PostgreSQL en cada request y falla cerrado ante indisponibilidad.

Ambas rutas aplican sesión/Origin existentes y `Cache-Control: no-store`, `Pragma: no-cache`, `Expires: 0` en éxito y error; el filtro cubre DTO, JSON malformado, 403, 429 y 503. `frontend/types/api.ts` sólo recibe el espejo aditivo del contrato; no se implementó UI ni cliente frontend.

El harness dedicado no forma parte del glob estándar. Antes de crear el adaptador/buzón verifica URL loopback, puerto 55432, nombre de base esperado exacto, rol `pokemon`, marcador preexistente único y cero usuarios. Enlaza el servidor HTTP sólo a `127.0.0.1`. El buzón limita destinatarios, 32 mensajes y leases de 120 s; cancelación/teardown libera mensajes, candidato de token, timers y waiters. No hay endpoint debug, SMTP, Redis propio, outbox ni reset de cuotas para simular tiempo.

## Verificación

- `prisma validate` y `prisma generate` con Prisma 6.19.3; `migrate deploy` sólo sobre el clon marcado.
- `jwt-auth.guard.spec.ts` + `auth.service.spec.ts`: **14/14**.
- `auth-session.e2e-spec.ts`: **2/2**.
- Harness privado `vitest.config.recovery-harness.ts`: **7/7**, incluido 60,1 s real entre admisiones del identificador, consumo concurrente con un solo commit y entrega detenida hasta después del reset; la autorización PostgreSQL la suprime y el token queda revocado.
- Oxlint focal: limpio. `tsc --noEmit` filtrado a paths BE-05: sin diagnósticos.
- El `tsc --noEmit` completo del backend falla en paths fuera del alcance BE-05: specs de sync-prices/tcgdex-set-mapping, cards, redis y `test/app.e2e-spec.ts`. No se atribuyen esas causas al cambio. No se corrió `pnpm run check` global.
- `git diff --check` focal: limpio.

Una corrida inicial del harness detectó Prisma `P2010` al deserializar `void` de `pg_advisory_xact_lock` vía `$queryRaw`. Se corrigió a `$executeRaw` conservando `Prisma.sql` parametrizado. El humo y la suite completa posterior pasaron; la última corrida completa, tras reforzar ownership y bind loopback, también pasó **7/7**.

## Preservación y limpieza

Se capturaron hashes de fuentes, copias relevantes, diff previo y snapshot fuente501 antes de editar en `/private/tmp/be05-baseline-20261009/`. La fuente `pokemon_cards_test` conservó **2 usuarios y 18 tablas públicas**. El clon `pokemon_cards_be05_test_20261009a` se validó con marcador único, rol esperado y **0 usuarios, 0 tokens, 0 hits y 0 refresh** después de teardown; luego se eliminó sólo ese clon y su archivo marcador. No se creó Redis propio. Al finalizar no quedó listener en puertos 3000/3001 ni suite/runtime activo.

## Archivos BE-05

- `backend/src/modules/auth/{auth.controller.ts,auth.module.ts,auth.service.ts,password-recovery.service.ts,recovery-errors.ts,recovery-http.filter.ts,recovery-mail.port.ts}` y `backend/src/modules/auth/dto/{password-recovery-request.dto.ts,password-recovery.dto.ts}`.
- `backend/src/common/guards/{jwt-auth.guard.ts,jwt-auth.guard.spec.ts}` y `backend/src/common/types/auth-user.ts`.
- `backend/prisma/schema.prisma`, migraciones `20261009190000_add_password_recovery` y `20261009200500_add_refresh_auth_version`.
- `backend/test/auth-session.e2e-spec.ts`, harness privado `backend/test/password-recovery-harness.ts` y `backend/vitest.config.recovery-harness.ts`.
- Tipos espejo `frontend/types/api.ts`.
- Documentación `backend/docs/{api.md,database.md,testing.md,gotchas.md}`.
- Evidencia: [BE-05-implementacion-evidencia.json](BE-05-implementacion-evidencia.json).
