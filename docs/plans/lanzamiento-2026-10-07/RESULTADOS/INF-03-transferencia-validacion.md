# INF-03 — transferencia local simulada

12/10/2026, Buenos Aires. **Implementación y ensayo local aceptados por root.** [Recibo](INF-03-transferencia-aceptacion-root.json). Destino futuro Backblaze B2 y custodio dueño se conservan; ninguna cuenta, llamada B2 o clave real configurada. Estado20/38completos18pendientes; INF-03 sigue parcial por off-host/custodia/operación reales.

## Entrega funcional

[Adaptador](../../../../scripts/inf03-transfer-common.mjs), [CLI](../../../../scripts/inf03-transfer.mjs) y [runbook](../../../../infra/inf03/TRANSFER-LOCAL.md): modo obligatorio local-simulated, destino filesystem privado explícitamente provisionado, distinto del inventario y cuarentena. Ciphertext age+recibo se copian y verifican contra el registro original actual; descriptor HMAC conserva fecha original/hashes/tamaños. Subida idéntica completa es idempotente; parciales, corrupción, colisiones y no-clobber fallan cerrado. Máximo1000objetos/128MiB por payload/64KiB por recibo, rutas/owner/permisos/links e identidades revalidados.

Descarga verificada a cuarentena, `restoreEligible:false`; no registra ni renueva una copia ni habilita restore. La fecha se revalida al final y tras cierre CLI. Retiro simulado dry-run por defecto/apply explícito: intención durable con dev/ino/ctime antes de unlink, transición deleting→retired, reanudación e idempotencia con siguiente0. No poda supresiones. Capacidades son guards de aplicación, no permisos B2/OS efectivos.

El retiro cubre el destino de objetos, no las cuarentenas descargadas. Su consumidor debe limpiarlas tras el uso y dentro del plazo original; el ensayo hizo esa limpieza explícita. No representa inventario de todas las copias ni recuperación de host perdido: `BackupInventory.open()` conserva auditoría de originales presentes. No se relajó ese guard ni el restore existente.

## Pruebas y consumidor

- [12focales](INF-03-transferencia-evidencia/final-focal.log), incluidas caducidad durante copia, sustitución idéntica de recibo, symlink de directorio/cuarentena durante operación, checkpoint/ciphertext/descriptor alterados, hardlinks/permisos, retiro/corte, flags/modo/close y originales ausentes.
- [Check estándar exacto](INF-03-transferencia-evidencia/current-check-result.json), una vez stop→check sobre clon estándar marcado y Redis propios: **1087/1087,0skips**, lint/tipos/builds Nest/Next Turbopack.466backend+13scanner+6e2e+562frontend+15monitor+25inventario/transferencia; focales solapados con global. [Log completo](INF-03-transferencia-evidencia/current-check.log). Nueva suite incluida en ops:backups:test.
- [55controles integrados distintos](INF-03-transferencia-evidencia/runtime.json): dump custom PostgreSQL real,13migraciones en source propio y agev1.2.1 local ya disponible. Subida, misma subida idempotente y descarga bit a bit de ciphertext+receipt; corrupción rechazada sin publicar cuarentena, no-clobber, reupload de cuarentena rechazado y modo B2 negado antes de contacto. Fecha e inventario original intactos.
- Consumidor de root sustituyó **sólo el ciphertext de su fixture propia** en su ubicación canónica por los bytes descargados verificados, sin modificar inventario. Reabrió y comprobó el registro original antes de ejecutar el CLI restore. Esta manipulación controlada prueba el consumo del resultado de transferencia; **no es recuperación automática tras perder originales/custodia**, ni registra cuarentena como snapshot nuevo.
- Source PG destruido; restore real a otro destino marcado con supresiones actuales: A y relaciones personales siguen ausentes, B y su colección vacía conservados, catálogo y cincoGIN válidos. Sólo después se abre proxy loopback propio y API/Next compilados; login B, sesión tras recarga y colección en navegador real; login/JWT A401 y share404. Dos capturas seguras.
- A30d exactos por reloj inyectado **sólo en bibliotecas de fixtures**, ambos repositorios completan retiro tras cortes controlados; retiro siguiente0, ciphertext/recibos de destino ausentes y descriptor/tombstone preservados hasta cleanup. Quarantinas conocidas borradas explícitamente. Registro de bajas no podado. No se alteró reloj/TTL real ni se esperaron30d.

## Revisión y fallos preservados

[Revisión Sol6.1 high sólo lectura y correcciones root](INF-03-transferencia-evidencia/review-resolution.json). Luna entregó cuatro archivos; root integró/corrigió sin más writers. Dos encargos de máximo cuatro.

[Inicial0pasados/5fallos](INF-03-transferencia-evidencia/initial-focal.log): init exigía vacíos los directorios del inventario ya provisionado. Fixture también necesitaba respetar orden de cleanup y claves distintas; corregidos antes de regresiones de comportamiento. [Baseline6pasados/2fallos](INF-03-transferencia-evidencia/behavior-baseline.log): vencimiento durante descarga y sustitución idéntica de recibo durante retiro. [Baseline FS0/2](INF-03-transferencia-evidencia/fs-baseline.log): mutación previa a rechazo por symlink y éxito sobre cuarentena sustituida. [9corregidos](INF-03-transferencia-evidencia/corrected-focal.log)→12finales verdes tras añadir cierre/flags/original perdido. También se corrigió por lectura el cierre de FD si falla abrir el destino; no se afirma ensayo de agotamiento de descriptores.

[Primer runtime](INF-03-transferencia-evidencia/runtime-attempt-1.json) llegó a web/restauración y falló por una variable residual del harness (`copied`). Sus46marcas no se aceptan como46controles válidos: la marca de rechazo de retirado capturaba ese ReferenceError, sin demostrar el guard. Root usó la variable correcta y exigió código INF03_INVENTORY_UNVERIFIED explícito; segundo runtime55/55verdes. Intento previo y cleanup completos conservados. Una corrección del harness con evidencia nueva, sin otro check global ni diagnóstico socket/backfill histórico.

## Integridad, cleanup e instancia

[1466fuentes/outputs seleccionados intactos](INF-03-transferencia-evidencia/runtime-integrity.json) durante los dos runtimes, caché mutable Next excluida. [Baseline532posterior al dispatch](INF-03-transferencia-evidencia/source-baseline-comparison.json), con tres deltas seleccionados autorizados y dos archivos de tarea fuera de esa selección; no snapshot dirty completo previo.5copias actuales de fuente/config y [30artefactos con hashes](INF-03-transferencia-evidencia/artifact-hashes.json).

Ambos runtimes retiraron Docker source/destination/proxy/redes/volúmenes etiquetados, navegador/API/Next QA, plaintext, age identity y ciphertext/metadata/custodia de fixtures. Contenedores comparados por fullID; redes/volúmenes por nombres/labels del run. [Root cleanup](INF-03-transferencia-evidencia/cleanup-receipt.json): clon estándar por fullID/marker/SQL0 y Redis own por fullID/label. Conteos dev13migraciones/22usuarios/22colecciones/69items/13shares/20670cartas/5GIN y TEST11/2/3/2/1/20670/5GIN/7cotizadas conservados; mismosIDs/salud/PONG compartidos. Comparación agregada, no fila por fila.

[Instancia habitual viva](INF-03-transferencia-evidencia/final-instance.json):localhost3000, API81520/Next81534, ascendencia verificada y páginas/health/ready200. Providers/jobs/correo/baja reales deshabilitados, sin fixtures dev. Verificar procesos antes de parar; no quedan QA propios ni agentes activos. Automatización PAUSED/dos horas conservada.

## Pendientes y próximo paso

No integra API B2/S3, permisos reales, scheduler, copia externa ni custodia/frescura remotas; tampoco acredita pérdida eléctrica/SIGKILL, RPO/RTO o recuperación ante pérdida total del equipo. HMAC no detecta rollback conjunto de custodia confiada; guardar clave no recupera el registro vigente.

**Siguiente propuesto sin iniciar:** simular pérdida del equipo y recuperación mediante custodia separada del inventario y registro de bajas, manteniendo validación de cabeza/fecha y bloqueo ante estado incierto. Preguntar y esperar al usuario antes de esa implementación/ensayo. B2/mini PC/Resend reales se dejan para el final.

## Capturas reales

[Cuenta conservada tras consumir copia descargada](INF-03-transferencia-evidencia/coleccion-restaurada-mobile.png) · [Enlace suprimido](INF-03-transferencia-evidencia/enlace-suprimido-mobile.png).
