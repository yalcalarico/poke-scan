# INF-02 — Revisión del preflight de packaging

Fecha: 2026-10-07 · Revisor: GPT-6.1 Sol HIGH · Estado: **preflight corregido y aceptado para reservar la fase siguiente**, condicionado a entrega/revisión BE-03 y handoff frontend acotado. Build/runtime/gate del lote pendientes.

La revisión modifica sólo este archivo y [INF-02-preflight](INF-02-preflight.md). No cambió código/configuración ni ejecutó tests, Docker, build, DB/Redis o inferencia. BE-03 tiene escritor activo: su código inacabado no se usa como evidencia de éxito. Los contratos [BE-03-review](BE-03-review.md) e [INF-01-review](INF-01-review.md) son requisitos futuros; la evidencia Docker enumerada por Luna es inventario, no prueba de imagen.

## Hallazgos que condicionan la implementación

1. **Base relativa rompe SSR de producción.** `frontend/lib/api/api-client.ts` sólo ofrece `DEV_API_PROXY_TARGET` cuando server + development; en production retorna BASE_URL. Con NEXT_PUBLIC_API_URL=/api, `app/share/[slug]/page.tsx` hace fetch relativo desde Node y cae en error, y `app/(app)/carta/[id]/page.tsx` tiene el mismo problema. Una landing que oculta error en preview no demuestra SSR correcto.
2. **Alpine todavía no fue probado.** El preflight proponía arrancar directamente por Bookworm. INF-01 exige intento real con Alpine fijado o una razón funcional documentada antes del cambio. La lista CPU Linux ARM64/x64 de ONNX no certifica musl ni demuestra su fallo. Se corrigió el orden.
3. **Fases Prisma necesitan arreglo.** Dockerfile backend genera cliente después de Nest build; prod-deps instala --prod, no copia prisma/schema.prisma y luego invoca `pnpm exec prisma generate`. Prisma CLI está en devDependencies. No confiar en una CLI ausente ni en generación sin schema. Es diagnóstico estático, no error de build reproducido aquí.
4. **Auth scanner y cookie son distintos.** El controller visual usa JwtAuthGuard: el POST lleva Bearer accessToken. La cookie refresh sólo corresponde a `/api/auth`; no debe enviarse al scanner ni ampliarse su Path para que el smoke funcione. `session-security.ts` define producción Secure/HttpOnly/Lax/Path, sin Domain y exige orígenes HTTPS exactos y secretos de mínimo 32 caracteres.
5. **Dos bundles, dos resultados.** Una instancia full-index no devuelve references=1. El warmup full y el smoke de una referencia deben ser escenarios aislados y serializados. HTTP 200 con una imagen sintética no demuestra precisión de carta, cámara o dispositivo.
6. **Health no cierra cold gate.** Docker usa liveness, no readiness; `depends_on: service_healthy` sobre ese health no impide publicar un backend cuyo scanner inicializa. Caddy activo con tres fallos tampoco prueba bloqueo desde el primer instante.

## Handoff frontend mínimo, todavía sin código

El coordinador debe reservar una integración pequeña antes del build INF-02; este preflight no autoriza editar frontend. Propuesta concreta:

| Contexto | Configuración/resultado requerido |
|---|---|
| Bundle del browser | Build arg NEXT_PUBLIC_API_URL=/api; getApiBaseUrl devuelve /api, sin hostname privado. No basta inyectar env al runner después de construir. |
| Server Next production | Nueva env privada **API_INTERNAL_URL=http://backend:3001/api** en Compose de test; getApiBaseUrl la lee sólo en server y devuelve URL absoluta. No prefijo NEXT_PUBLIC ni exposición por next.config.env. |
| Server development | Preservar DEV_API_PROXY_TARGET y fallback existentes; no convertir el proxy LAN en contrato de producción. |
| Browser production | Ignorar API_INTERNAL_URL, incluso si existe en la env del servidor; mantener credenciales/same-origin y el refresh actual. |

Reservas del handoff: `frontend/lib/api/api-client.ts`, sus tests enfocados, `frontend/docs/api-client.md` y configuración documental de env si hace falta. No UI, routes nuevas ni DTO. Verificar producción server/browser, URL absoluta sin doble /api, desarrollo anterior y que el valor interno no aparezca en bundle/respuesta pública. Probar consumidores SSR `/share/<slug-fixture>` y `/carta/<id-fixture>` en la imagen final con datos sintéticos; validar HTML/metadata esperados, no sólo status 200 ni una landing que tolera backend roto.

Se leyó la guía **instalada** `frontend/node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`: NEXT_PUBLIC se fija durante next build y env sin ese prefijo pertenece al server. La integración debe leer la variable privada al resolver base en server, sin congelar accidentalmente una dirección de test en contenido estático. El build no debe necesitar API/DB de desarrollo.

Alternativa sin ese handoff: una base HTTPS absoluta de la misma origin, realmente accesible y con certificado confiable desde browser y contenedor Next. `https://localhost:<puerto>/api` desde Next apunta al propio contenedor; no asumir que alcanza el gateway. DNS interno/SNI/CA/ruta deben resolverse de forma explícita. Para el smoke local se recomienda el handoff API_INTERNAL_URL y tráfico server interno HTTP en la red privada; el browser conserva HTTPS. No usar NODE_TLS_REJECT_UNAUTHORIZED=0 ni bypass global para salvar SSR.

## Orden reproducible de imagen y compatibilidad

- Fijar Node **22.20.0** en todos los stages y registrar tag/digest por plataforma. Primero evaluar node:22.20.0-alpine ARM64 nativo del daemon informado. Si falla addon/ABI/símbolo o hay una razón funcional concreta, guardar comando/log sanitizado y probar node:22.20.0-bookworm-slim coherente en todos los stages backend. No mezclar librerías glibc/musl entre builder/prod-deps/runner. AMD64 futuro requiere su propia prueba; emulación no acredita rendimiento nativo.
- Backend conserva pnpm **10.17.1**; frontend agrega esa preparación en deps/builder. No actualizar locks/versiones ni usar npm/yarn. Instalación reproducible puede acceder a registry/bases/dependencias; eso no autoriza descargar modelo, sincronizar catálogo ni llamar proveedores desde runtime.
- Copiar schema al stage que genera; `pnpm exec prisma generate` **antes** de Nest build. Una vía sin CLI dev en prod-deps es derivar dependencias runtime del árbol del builder ya generado y podar devDependencies con pnpm en un stage propio, manteniendo topología/symlinks/cliente generado. Otra vía debe materializar explícitamente ese cliente en el grafo prod correcto. No asumir una ruta plana `node_modules/.prisma` bajo pnpm ni que podar/copiar preservó el cliente: verificarlo en runner real. Migraciones se ejecutan con tooling/CLI disponible contra la DB temporal, no se agregan dependencias al runner por accidente.
- Runner non-root en /app con dist y closure ESM de scripts. Los tres módulos iniciales son worker/engine/index; después de BE-03 revisado recorrer los imports finales y sumar sólo los módulos runtime nuevos necesarios. No copiar scripts de indexación/evaluación por comodidad. Sharp/ONNX pertenecen al grafo prod; sus imports JS no certifican carga nativa.
- Prueba de compatibilidad final: Sharp procesa bytes sintéticos; Argon2 hash/verifica fixture; Prisma generado consulta DB temporal; ONNX crea sesión del modelo montado y el worker hace warmup. Revisar instalación de scripts/paquetes nativos permitidos por pnpm: manifest onnxruntime-node tiene postinstall, pero la allowlist backend no lo incluye. No habilitar scripts masivamente ni declarar fallo inevitable: diagnosticar los binarios CPU efectivamente entregados. Si hace falta ajustar instalación/allowlist, reservar ese hunk de package.json por separado, sin subir versiones.

[Imagen oficial Node](https://hub.docker.com/_/node), consultada el 7/10/2026, distingue Alpine/musl de Debian/glibc; no sustituye la prueba del conjunto actual.

## HTTPS y sesión de prueba

Origin local único, por ejemplo **https://localhost:35443**, con puerto realmente libre y publicado sólo en 127.0.0.1. Gateway conserva `/api` —no usar handle_path que lo quite— y headers Origin/Host adecuados. FRONTEND_URL y CORS_ORIGINS contienen ese origin exacto, sin path ni slash final. NODE_ENV=production, secretos aleatorios privados en archivos/env del proyecto temporal, sin imprimirlos en logs/config expandida/reporte.

Caddy usa `tls internal` o certificado de fixture emitido por CA del proyecto con SAN localhost y validez comprobada; no ACME/DNS público. La confianza automática dentro del contenedor no significa confianza del host/browser. Desactivar instalación automática de trust (`skip_install_trust`) y conservar CA/claves en recursos temporales. Cliente HTTP/TLS usa CA explícita (`curl --cacert` o cliente Node con ca por conexión), nunca `-k` ni rechazo TLS desactivado globalmente. [Caddy Local HTTPS](https://caddyserver.com/docs/automatic-https#local-https), consultado el 7/10/2026.

Usar cookie jar/perfil de prueba nuevo: cookies no están aisladas por puerto y una sesión localhost existente podría pertenecer a desarrollo. Login/register lleva Origin y X-Session-Request: 1; comprobar Set-Cookie host-only, Secure/HttpOnly/Lax/Path=/api/auth, refresh con cookie y rotación, y scanner con Bearer. El request scanner debe omitir refresh cookie por Path y devolver 401 sin Bearer. No imprimir tokens ni contenido base64. Un cliente CLI con CA/jar acredita HTTPS y protocolo/atributos de cookie; no afirmar prueba real de políticas SameSite/HttpOnly del browser. Si se realiza una verificación browser, requiere perfil aislado con confianza acotada de esa CA y evidencia propia, sin cambiar trust del sistema ni reutilizar sesión del usuario.

## Gate frío, fallos y escenarios aislados

**Init gate separado:** una tarea interna consulta `/api/ready` en backend con plazo total finito (propuesta local 180 s), timeout por pedido 5 s y sondeo acotado; exige HTTP 200, database=ready y scanner=ready. Disabled no habilita este piloto. Sólo tras éxito puede iniciarse/publicarse gateway. En Compose puede modelarse con `service_completed_successfully`; volver a ejecutar gate al recrear app/gateway, no reutilizar éxito de una generación anterior. Si falta índice, es incompatible o permanece initializing, el gate termina fallido con estado sanitizado y no publica tráfico. No inference, proveedores, descargas o busy-loop de CPU por sondeo.

Tras admisión inicial: Caddy consulta backend directo cada 10 s, timeout 5 s, health_fails=3 y health_passes=1. Esa política permite una ventana de detección; no afirmar retirada instantánea. No convertir POST503 ocupado en caída global mediante health pasivo. Cuando vuelve ready debe reincorporar sin un request del usuario. [Caddy health activo](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#active-health-checks), [orden Compose](https://docs.docker.com/compose/how-tos/startup-order/), consultados el 7/10/2026.

**A · Bundle completo:** copiar sólo modelo y pares metadata/JSONL seleccionados a un directorio propio, sin mutar origen. Validar/hash y manifiesto deterministas; manifestSha256 separado para evitar autorreferencia. Conteo de referencias efectivas proviene del validador, no summaries. Montar read-only por versión. DB temporal puede no contener catálogo completo: A prueba carga/compatibilidad/readiness/reinicio, no hidratación de cada carta. No foto/embedding en warmup ni probes.

**B · HTTP con una referencia:** bundle/manifiesto propios, expectedEntries=1, DB propia con set/carta sintéticos y el ID del único vector válido. Se admite un vector validado de la representación local; no usar fotos de consulta del usuario. Imagen sintética en memoria y POST real generan embedding una vez después del warmup. Comprobar 401 sin auth y 200 con auth, references=1 y candidate.card.id de fixture; inferencia/hidratación/autenticación correctas, **sin accuracy atribuida**. Mantener fixtures de share/SSR en esa DB y evitar URLs de imágenes/proveedores remotos. No ejecutar A y B simultáneamente.

Fallos missing/incompatible/restart se ejecutan en variantes propias y artefactos nuevos: no editar bajo un mount activo ni tocar índice de desarrollo. Mantener PRICE_QUEUE_ENABLED y tres crons externos en false; DB/Redis sin host ports y red privada, egress runtime controlado para no llamar fuentes externas. Preservar 55432/6379/3000/3001 del entorno compartido.

## Reserva y gate para el próximo ejecutor

Después de revisar/liberar BE-03, el coordinador reserva un solo escritor Luna para fase INF-02 y el handoff frontend imprescindible, o los serializa explícitamente. Archivos propuestos: backend/frontend Dockerfile y .dockerignore; Compose/Caddyfile aislados en `infra/inf02/`; scripts operativos acotados en `scripts/infra/` para bundle/manifiesto, gate/fixtures/smoke/cleanup; documentación/reportes INF-02. API client/tests/docs sólo bajo la reserva frontend separada de arriba. package.json/lock/schema/handlers/worker no se editan por defecto; solicitar reserva concreta al coordinador si evidencia lo necesita, sin pedir aprobación humana rutinaria.

Scratch bajo un directorio temporal nuevo, project names únicos por escenario y labels comprobadas, sin container_name, volúmenes/credenciales/mounts de desarrollo ni Docker socket montado. Scripts deben verificar -p/-f y labels antes de cleanup; eliminar sólo sus recursos. Reportar comandos, versiones/digests, arquitectura/libc, etapas Prisma/native, manifests y permisos, TLS/auth/SSR, gate frío/fallos/restart y limpieza; sanitizar credenciales/fotos.

Pruebas enfocadas y revisión Sol HIGH habilitan siguiente tarea del lote. `pnpm run stop` antes de suites según AGENTS, coordinado con el escritor; no detener el stack compartido para este preflight. Check global y flujo integrado sólo al cierre del lote de operación. Esta revisión habilita **preparación reservada**, no acredita BE-03/INF-02 implementados ni el piloto listo.
