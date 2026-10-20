# Paquete de custodia para la futura mini PC

13/10/2026, Buenos Aires; trabajo iniciado12/10. **Paquete y consumidor local aceptados por root.** [Recibo](INF-02-custodia-paquete-aceptacion-root.json).20/38IDs completos18pendientes, sin nuevos IDs por ampliar packaging existente. Preferencia vigente: pruebas pertinentes al cierre, sin tomar/enviar capturas; conservar evidencias históricas. Automatización PAUSED/dos horas intacta.

## Entrega

[Empaquetador/verificador](../../../../scripts/infra/inf02-custody-package.mjs): contexto separado con sólo tres common .mjs, manifest de hashes/tamaños/rutas y árbol0555/0444. Sin contexto raíz del repo, .env, modelos ni fotos. No-clobber, archivos acotados, owner/links/canonical e identidades de fuentes/parent/destinos revalidadas. Fallos conservan parciales sin chmod/borrado recursivo automático. Hashes prueban integridad, no firma de procedencia: el operador compara código contra el repo aprobado.

[Dockerfile](../../../../backend/Dockerfile): target opt-in custody-runner instala código root-owned0444 en `/scripts`, ruta correcta del worker en `/app/dist`; runner permanece final/default. [Overlay](../../../../infra/inf02/compose.custody.yaml) usa tag propio, rootfs readonly, tmpfs y siete binds sin creación automática. Originales bajo `/var/lib/pokescan-host`, store/anchor fuera bajo `/var/lib/pokescan-custody`. Namespace absoluto firmado debe conservarse; fixtures nuevas se provisionan explícitamente como UID1001 desde namespace final, sin re-firmar autoridades existentes ni init en startup.

[Helpers base](../../../../scripts/infra/inf02-project.mjs) start/recreate rechazan perfil o backend opt-in existente para impedir recreación sin custodia/replay. Cleanup permanece explícito y conserva binds. [Runbook](../../../../infra/inf02/README.md) mantiene overlay y gate frío antes de ingreso. Sin backend/src, DTO, schema, frontend, versiones, proveedores ni operación real modificados.

## Pruebas

- [Inicial4fallos](INF-02-custodia-paquete-evidencia/initial-focal.log): raíz calculada un nivel arriba y canonical de fixture. [Final7/7](INF-02-custodia-paquete-evidencia/final-focal.log): allowlist/hash/modos, no-clobber/symlinks/ancestros, CLI real y guard de downgrade/cleanup. Incluidas en test estándar; solapadas con global.
- [Revisión](INF-02-custodia-paquete-evidencia/review-resolution.json): Luna medio implementó; Sol6.1high sólo lectura identificó riesgos de namespace, ancestros/cleanup y recreate. Root corrigió, dos encargos de máximo cuatro, sin subdelegación. Los riesgos de races/recreate se acreditaron por lectura y tests acotados; no se afirma ataque concurrente del filesystem ni downgrade real de datos.
- [Stop/check estándar exacto](INF-02-custodia-paquete-evidencia/current-check-result.json), una vez en clon estándar marcado/Redis propios: **1131/1131,0skips**, lint/tipos/builds Nest/Next Turbopack.489backend+13scanner+6e2e+562frontend+15monitor+39backups+7paquete. [Log](INF-02-custodia-paquete-evidencia/current-check.log).
- [Build desde cero sin red](INF-02-custodia-paquete-evidencia/docker-build.log) falló porque corepack necesitaba descargar pnpm. No retry con red. Alternativa contextual: [builder Linux cacheado](INF-02-custodia-paquete-evidencia/offline-compile-receipt.json), Node22.20/pnpm10.17.1/dependencias y lock exactos; regeneró Prisma y recompiló fuentes actuales sin red. [115JS coinciden con build host actual](INF-02-custodia-paquete-evidencia/linux-code-comparison.json). Base propia actualizada, luego [target custody-runner real](INF-02-custodia-paquete-evidencia/offline-custody-build.log), con contexto runner-base explícito y contexto custody-ops allowlist. **No acredita reconstrucción completa desde cero con downloads ni nueva ejecución de prune.** Tags habituales intactos.

## Contenedor real

[21controles distintos](INF-02-custodia-paquete-evidencia/runtime.json): LinuxARM64, UID1001, rootfs readonly, código/rootowner0444 y hashes actuales, escritura código denegada, red API interna y proxy sólo loopback. PG/Redis/volúmenes propios;13SQL de migración actuales y registros con checksums, cincoGIN, catálogo fixture1. Provisión explícita de inventario vacío y journal/anchor genuinos desde namespace del contenedor.

DINOv2 ready e inferencia autenticada con PNG sintético sólo en memoria y una referencia física: valida runtime/native/readonly, **no precisión con cartas reales ni corpus completo**. Registro de dos cuentas fixture con cliente Prisma generado actual, baja A200 sólo con secuencia publicada1/login posterior401. Falta currenthead propia produce B503, fila conservada e intención2 irrevocable; restitución de su archivo exacto y restart publica pendiente/replay antes de ready, fila0/login401. Catálogo/índices/migraciones conservados. Sin browser/capturas/trace/video ni proveedores, SMTP, B2 o fotos persistidas.

[Primer runtime](INF-02-custodia-paquete-evidencia/runtime-attempt-1.json) falló bootstrap Docker tras3controles y cleanup completo; stderr original no instrumentado, causa no localizada concluyentemente. Se cambió readiness PG de socket Unix a TCP, que evita admitir su servidor temporal de init, y se añadieron diagnósticos sanitizados. Segundo runtime21/21verde; una corrección contextual privada, sin nuevo check global ni atribuir el pase como demostración de la causa anterior.

## Integridad y cierre

[1489fuentes/outputs seleccionados intactos](INF-02-custodia-paquete-evidencia/runtime-integrity.json), ambos runtimes; cache mutable Next excluida. [Baseline551post-dispatch](INF-02-custodia-paquete-evidencia/source-baseline-comparison.json), diez deltas autorizados; no snapshot dirty completo previo. Diez copias actuales y [hashes](INF-02-custodia-paquete-evidencia/artifact-hashes.json).

Runtime retiró contenedores por fullIDs/labels, redes/volúmenes propios y env de claves. [Root cleanup](INF-02-custodia-paquete-evidencia/cleanup-receipt.json): clon marker/fullID/SQL0 y Redis own ausentes; dev13/22usuarios/22colecciones/69items/13shares/20670cartas/5GIN y TEST11/2/3/2/1/20670/5GIN/7cotizadas conservados, mismos IDs/salud/PONG. Comparación agregada, no fila por fila. [Tags propios retirados](INF-02-custodia-paquete-evidencia/image-cleanup.json) y [contextos privados retirados](INF-02-custodia-paquete-evidencia/private-fixture-cleanup.json); no prune de caches ni modelos originales.

[Instancia habitual viva](INF-02-custodia-paquete-evidencia/final-instance.json)localhost3000, API98035/Next98060 con ascendencia/páginas/health/ready verificados. Comprobar PIDs antes de detener. Providers/jobs/mail/bajas reales siguen deshabilitados; sin QA propios ni agentes activos. Dirtytree y evidencias conservados.

## Pendientes

Equipo real/x64, instalación desde cero, off-host/B2, claves/bóveda reales, calendario operativo, carga/uptime/costos, dominio/Tunnel/HTTPS externos, Resend y beta con participantes mantienen gates propios. No producción ni GO comercial acreditados.

**Siguiente propuesto sin iniciar:** definir y ensayar calendario de backups/retención en modo simulado, sin instalar cron ni activar proveedores reales; preguntar y esperar al usuario.
