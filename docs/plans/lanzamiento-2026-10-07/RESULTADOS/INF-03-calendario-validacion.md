# INF-03 — calendario y ciclo de backups simulados, aceptación local

Aceptado por root el 13/10/2026. Entrega funcional local; no instala cron, daemon, B2 ni equipo. INF-03 conserva operación/off-host pendiente. Mini PC: preparación cerrada, ejecución real diferida al final por el usuario.

## Resultado

Nuevo [CLI](../../../../scripts/inf03-schedule.mjs), [módulo](../../../../scripts/inf03-schedule-common.mjs), [pruebas](../../../../scripts/inf03-schedule.test.mjs) y [procedimiento](../../../../infra/inf03/SCHEDULE.md). `init` explícito vincula calendario/configuración/identidades existentes; `plan` y ciclo por defecto sólo verifican. `cycle --apply` ejecuta una pasada serial: backup sintético permitido → upload idempotente → retención local y del destino simulado → publish/verify de custodia → finalización firmada. Agrupa slots perdidos, prioriza el único pendiente y realiza mantenimiento aun sin nuevo backup. Cadencia diaria usada como fixture; no es un RPO elegido ni un timer instalado.

Intent durable antes del backup y filename por slot. Un resultado incierto no relanza backup: requiere registro original válido para reconciliar. No renueva fecha/ID/hash ni adopta ciphertext suelto. Guarda si publicó objeto remoto; una copia publicada desaparecida bloquea plan/apply, incluso si se pierde durante otra ejecución. Un pendiente vencido antes de upload puede retirarse sin afirmar una transferencia inexistente. No poda journal ni tombstones; 1000 slots máximos, sin rotación automática. Claves distintas, paths privados/disjuntos, identidades y locks propios; missing/tamper/fork fallan cerrado.

## Verificación

- Sol6.1 HIGH, único encargo (1/4), implementó y obtuvo [13 focales iniciales](INF-03-calendario-evidencia/schedule-focal.log). Interrumpido por límite de uso antes del handoff final; root tomó propietario/revisión, sin duplicar agentes.
- Root agregó cobertura de pérdida del objeto completo y de pérdida durante nuevo backup. [14 focales](INF-03-calendario-evidencia/schedule-final-focal.log) y [15 finales](INF-03-calendario-evidencia/schedule-final-coverage-focal.log) verdes por cambios sucesivos; no sumar pruebas repetidas ni afirmar baseline rojo no ejecutado. Deadline callback acotado y settlement probado; CLI espera close y grupo local, conserva lock si no logra drenar.
- [Stop/check estándar exacto una vez](INF-03-calendario-evidencia/current-check-result.json), [log completo sanitizado](INF-03-calendario-evidencia/current-check.log): **1146/1146, cero skips**. 489 backend +13 scanner +6 e2e +562 frontend +15 monitor +54 backups (incluye15 nuevas) +7 package. Lint/tipos/builds Nest y Next Turbopack verdes. Clon estándar marcado y Redis propios; tests/timeouts/flags intactos.
- [15 controles integrados distintos](INF-03-calendario-evidencia/runtime-result.json), un runtime verde: CLI real/genesis explícito/journal compilado; plan preserva bytes; `pg_dump` PG16/age1.2.1; ciphertext transferido idéntico; segunda pasada sin duplicados; baja posterior genuina → mantenimiento publica → normal restore/replay deja cuenta A ausente y B presente. Anchor ausente bloquea sin éxito ni inventario modificado. Fallo simulado posterior a un backup real registrado → reinicio conserva ID/fecha/hash con una sola invocación de backup. Dos copias reales vencidas se retiran local/destino; journal/checkpoint intactos, repetición cero retiros y custodia actual verificada.
- Vencimiento mediante **clock controlado library +30d**, calendario de mantenimiento todavía sin slot debido; CLI usa reloj real. No espera TTL completo ni modifica fecha del manifiesto. Focales usan doble acotado de journal/callback sintético; consumidor integrado sí usa módulo compilado genuino, backup y SQL reales.

## Integridad y limpieza

[1487 fuentes/outputs seleccionados intactos durante runtime](INF-03-calendario-evidencia/runtime-integrity.json); [baseline543](INF-03-calendario-evidencia/source-integrity.json),541 intactos/2deltas autorizados (package y README) más4archivos nuevos. Baseline después del dispatch, selección explícita; no afirmar snapshot completo de dirty tree. Se conservan históricos y dependencias/DTOs/schema/fotos intactos.

[Cleanup consumidor](INF-03-calendario-evidencia/runtime-cleanup.json): seis recursos Docker propios retirados por IDs/labels, conexiones SQL0; directorio privado por identidad y claves/bytes efímeros eliminados. [Cleanup gate](INF-03-calendario-evidencia/cleanup-receipt.json): clon/Redis propios ausentes; dev13migraciones/22usuarios/22colecciones/69items/13shares/20670cartas/5GIN y TEST11/2/3/2/1/20670/5GIN/7cotizadas preservados; IDs compartidos/PONG corroborados. Conteos acotados, no comparación fila a fila.

[Instancia habitual viva](INF-03-calendario-evidencia/final-instance.json): localhost3000, API4842/Next4857 con ascendencia verificada, login/eliminación/health/ready200; jobs/proveedores/correo/bajas reales apagados. Verificar identidad antes de detener. Sin agentes activos/reserva/recursos QA; sólo instancia solicitada. Sin capturas, traces ni videos. Automatización PAUSED/dos horas intacta.

## Límites y siguiente fase

No acreditados: mini PC/x64/operación energética, B2 físico/off-host, scheduler real, RPO/RTO, timeout real de diez minutos, rollback conjunto de custodio ni tráfico de producción. Matar el grupo local no demuestra que `pg_dump` remoto dentro de Docker terminó; SIGKILL puede dejar staging/locks y requiere operador. No se borra un lock abandonado ni se rehace autoridad como fallback.

La preparación mini PC queda [completada documentalmente](../../../infra/PROMPT-mini-pc-cloudflare.md) y su ejecución se realizará al final. Estado **20/38 IDs completos,18pendientes**: lo real no se cierra por simulación. Cola local autorizada disponible terminada en este alcance; quedan beta/entrevistas/corpus consentido/comprensión y observación manual, después evidencia para contenido/oferta/Pro/pagos y costes/licencias/GO. Infra real/dominio/Tunnel/HTTPS/B2/Resend/monitorización objetivo se conservan para la fase final. No repetir preparaciones/gates verdes intactos ni inventar participantes o decisiones.
