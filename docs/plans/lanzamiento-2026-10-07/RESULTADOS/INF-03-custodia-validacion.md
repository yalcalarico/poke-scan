# INF-03 — custodia separada y pérdida del host simulada

12/10/2026, Buenos Aires. **Implementación y recuperación local aceptadas por root.** [Recibo](INF-03-custodia-aceptacion-root.json). El usuario autorizó este paso con «si, avanza, avanza avanza». Estado20/38completos18pendientes; INF-03 conserva operación y off-host reales. Backblaze B2 y dueño custodio ya elegidos; ninguna cuenta ni llamada externa creada. Automatización PAUSED/dos horas conservada.

## Entrega funcional

[Biblioteca](../../../../scripts/inf03-custody-common.mjs), [CLI](../../../../scripts/inf03-custody.mjs), [spec](../../../../scripts/inf03-custody.test.mjs) y [runbook](../../../../infra/inf03/CUSTODIA-RECUPERACION-LOCAL.md), más incorporación del spec en ops:backups:test. Ningún cambio en backend, schema, DTO, inventario, transferencia ni restore existentes.

Modo obligatorio local-simulated. Store con snapshots completos inmutables y anchor actual independiente, ambos privados y fuera del árbol lógico perdido; transferencia también separada. Claves diferenciadas por dominio, sin secretos en snapshots/salida. Publicación toma inventario normal y journal auténtico con locks, preserva bytes firmados, IDs, cabezas, cobertura, fechas y tombstones; commit completo sincronizado antes de avanzar anchor. Misma autoridad es idempotente; rollback, bifurcación, fuentes inconsistentes y estado deleting bloquean publicación.

Recovery exige anchor actual confiado y su snapshot exacto, sin fallback a genesis ni selección por mtime. Antes de crear cualquiera de las cinco carpetas originales ausentes, verifica todos los objetos activos de transferencia frente a los registros originales firmados. Reconstruye las mismas rutas canónicas, firmas, fechas y UUID; reabre inventario normal y journal auténtico, con revalidación de rutas/identidades/anchor y retención hasta cierre. No renueva30d ni registra backups nuevos. Parciales/interrupciones requieren intervención verificada; no reparación, clobber ni borrado automático.

`verify` sólo compara fuentes normales con anchor vigente; no publica ni avanza autoridad. Root lo ejecutó inmediatamente antes del restore y después del replay, antes de tráfico. Recovery devuelve siempre restoreEligible:false; admisión, descifrado, SQL y supresiones pertenecen al CLI normal existente. Límites1000registros/16MiBmetadata/128MiBpayload/64KiBrecibo, flags estrictos y errores genéricos.

## Pruebas y consumidor real

- [14focales verdes](INF-03-custodia-evidencia/clock-corrected-focal.log): originales ausentes, mismas firmas/rutas, objetos/retirados/fecha, rollback de inventario/journal/prefijo, anchor cambiante, claves, permisos/links, parcial/no-clobber, cierre y verify. El spec usa factory acotada de autoridad en memoria; **no acredita MAC/cadenas del backend por sí solo**.
- [Stop/check estándar exacto](INF-03-custodia-evidencia/current-check-result.json), una vez sobre clon estándar marcado y Redis propios: **1101/1101,0skips**, lint/tipos y builds Nest/Next Turbopack.466backend+13scanner+6e2e+562frontend+15monitor+39inventario/transferencia/custodia. Focales solapadas con global. [Log completo](INF-03-custodia-evidencia/current-check.log).
- [59controles integrados distintos](INF-03-custodia-evidencia/runtime.json), primer runtime completo verde. PostgreSQL real propio con13migraciones/cincoGIN, dump custom y agev1.2.1 local cacheado; no descarga de herramientas. Ciphertext de varios chunks subido a destino filesystem separado. Journal **genuino compilado**: snapshot inicial sin baja, aceptación local de baja A y SQL sólo en fixture propia, publicación actual con secuencia1, idempotencia y rechazo de journal antiguo válido firmado.
- Source PG destruido por fullID y **todo el árbol lógico con ciphertext/inventario/checkpoints/journal borrado**. El inventario normal siguió rechazando originales ausentes. Se recreó únicamente el padre vacío; recovery ocurrió en CLI fresco desde objetos/store/anchor independientes y claves temporales del operador, sin usar los bytes comparativos del harness para reconstruir.
- Anchor faltante, journal de custodia alterado, commit antiguo firmado y30d exactos rechazados con error genérico, sin materializar originales ni ejecutar pg_restore. Vencimiento mediante Date de fixture privado sólo en un subprocess CLI; no reloj del sistema/TTL ni espera física30d. No se afirma inyección de reloj como opción productiva.
- Recovery preservó bit a bit marcador/inventario/journal/checkpoint y permisos0700. Auditoría normal readmitió mismo ID/fecha/hash; restore real único al segundo PG marcado, replay antes de tráfico y verify contra anchor después del replay. A y relaciones personales0; B y su colección vacía conservados, catálogo1,13migraciones/cincoGIN y plaintext staging limpio.
- API/Next **compilados actuales** detrás de proxy loopback propio sólo después de admisión/replay: login A401, JWT antiguo válido firmado401, share404; login B y colección200. Navegador Chrome temporal390: login, colección conservada, sesión tras recarga y enlace eliminado inaccesible. Dos capturas seguras. Providers bloqueados, sin SMTP/B2 ni consultas externas.

## Revisión y fallo preservado

[Revisión Sol6.1 high](INF-03-custodia-evidencia/review-resolution.json) sólo lectura sin hallazgos críticos/P2 accionables; no ejecutó suites. Dos encargos de máximo cuatro: implementación y revisión, sin subdelegación. Root integró package, corrigió fixture y ejecutó todos los gates/recursos/centrales.

[Primer focal2pasados/12fallos](INF-03-custodia-evidencia/initial-focal.log): el reloj fijo del fixture se capturaba antes de init asíncrono y quedaba anterior al marcador de transferencia. Root actualizó sólo el reloj del fixture después de inicializar;14/14verdes. No cambio de código productivo, tests globales, timeout o flags debilitantes; **no se presenta como fix causal de producto**. Check global único y runtime único posteriores verdes. Históricos socket/backfill y otros lotes no repetidos ni atribuidos a este resultado.

## Integridad, cleanup e instancia

[1470fuentes/outputs seleccionados intactos](INF-03-custodia-evidencia/runtime-integrity.json) durante runtime; caché mutable Next excluida. [Baseline534posterior a dispatch](INF-03-custodia-evidencia/source-baseline-comparison.json): único delta seleccionado package autorizado, cuatro nuevos archivos de tarea fuera de selección; no snapshot dirty completo previo. Cinco copias actuales de fuentes/config y [manifiesto de artefactos](INF-03-custodia-evidencia/artifact-hashes.json).

Runtime retiró contenedores source/destination/proxy por fullID y labels, redes/volúmenes propios, navegador/API/Next QA, directorio temporal completo con claves age/HMAC, ciphertext, metadata/anchor/journal y plaintext. [Cleanup root](INF-03-custodia-evidencia/cleanup-receipt.json): clon estándar marcado por marker/fullID/SQL0, Redis own fullID/label, ambos ausentes. Dev13migraciones/22usuarios/22colecciones/69items/13shares/20670cartas/5GIN y TEST11/2/3/2/1/20670/5GIN/7cotizadas conservados; fullIDs/salud compartidos y PONG corroborados. Comparación agregada, no fila por fila. No fixtures ni migraciones en dev/TEST durante este paso.

[Instancia habitual viva](INF-03-custodia-evidencia/final-instance.json):localhost3000, API86166/Next86222 con ascendencia verificada; páginas/health/ready200. Verificar procesos antes de detener. Outputs validados y DB habitual, providers/jobs/correo/baja reales deshabilitados. Sin QA propios ni agentes activos; no commit/deploy/upgrade/contacto externo.

## Alcance y siguiente paso

La separación es **lógica dentro de una misma Mac**, no copia física off-host. Claves temporales en memoria simulan el operador; no bóveda/custodia real. Publicación manual no garantiza que cada baja aceptada por HTTP tenga confirmación durable externa. Un rollback conjunto del custodio confiado con firmas válidas no se detecta. No acreditados B2/S3/permisos reales, scheduler, energía/SIGKILL, RPO/RTO, HTTPS/teléfonos o recuperación física de mini PC perdida.

**Siguiente propuesto sin iniciar:** integrar y ensayar localmente que cada baja aceptada quede publicada en custodia independiente, con respuesta bloqueada ante fallo/estado incierto y recovery sin resurrección. Diseño debe manejar replay/reanudación, concurrencia y confirmación perdida sin repetir efectos. Preguntar y esperar al usuario antes de ese paso. Mini PC/B2/Resend reales siguen para el final.

## Capturas reales

[Colección conservada después de perder originales y recuperar](INF-03-custodia-evidencia/coleccion-restaurada-mobile.png) · [Enlace eliminado sigue inaccesible](INF-03-custodia-evidencia/enlace-suprimido-mobile.png).
