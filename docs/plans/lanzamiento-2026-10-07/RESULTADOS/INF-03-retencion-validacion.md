# INF-03 — inventario, vencimiento y restauración con supresiones

12/10/2026 UTC. **Paso funcional aceptado localmente por root.** [Aceptación](INF-03-retencion-aceptacion-root.json). INF-03 conserva off-host y operación real pendientes: **20/38 completos,18 pendientes**, sin nuevo ID cerrado por este ensayo.

## Entrega

Inventario firmado y checkpoint vigente independientes del repositorio cifrado. Alta explícita, un escritor, identidad/hash/fecha original y estados active/deleting/retired. Copiar no renueva el plazo ni registra la copia. Retención con simulación por defecto y aplicación explícita: a30d persiste intención antes de unlink, retoma un corte controlado y conserva tombstone. No borra archivos ajenos ni el registro de bajas.

Restore existente exige inventario y supresiones actuales con cobertura suficiente, sin fallback legado. Después de pg_restore aplica/verifica las bajas antes de admitir el destino; revalida cabezas, fecha y propiedad. Éxito sólo después de limpiar plaintext y cerrar custodia. Backend y CLI comparten el predicado de cascadas. Sin cambios de schema/DTO/versiones/proveedores.

[Runbook y comandos](../../../../infra/inf03/README.md). `inf03-smoke.mjs` adaptado a los nuevos requisitos; sus paquetes fabricados ahora se rechazan por inventario. No se vuelve a acreditar tar/rollback mediante ese rechazo ni se sobrescribe evidencia histórica. El runner histórico completo no fue reejecutado: este paso usó [consumidor privado reproducible](INF-03-retencion-evidencia/helpers/runtime.mjs) sobre los helpers actuales.

## Validación

- [Check estándar exacto](INF-03-retencion-evidencia/current-check-result.json), una ejecución tras stop, sobre clon estándar marcado y Redis propios: **1075/1075,0 skips**, lint/tipos y builds Nest/Next Turbopack. Desglose466backend+13scanner+6e2e+562frontend+15monitor+13inventario. [Log completo](INF-03-retencion-evidencia/current-check.log).
- Focales:16backend/13inventario-retención/3CLI compilado preSQL, con solapamiento con global. [Focal backend](INF-03-retencion-evidencia/focal.log), [inventario](INF-03-retencion-evidencia/inventory-focal.log), [CLI](INF-03-retencion-evidencia/restore-cli-focal.log). El CLI requiere build vigente; su focal se ejecutó tras compilar, separado del hook estándar que incluye las13regresiones offline de inventario/retención.
- [40controles integrados distintos](INF-03-retencion-evidencia/runtime.json), incluyendo cuatro negativos y sus verificaciones de destino intacto: checkpoint de supresiones/inventario alterados, identidad age incorrecta, copia no registrada. Cero pg_restore antes de esos negativos y uno positivo real.
- pg_dump custom real de origen sintético con13migraciones; agev1.2.1, ciphertext multichunk y recibo registrados; origen destruido. La copia precedía a la baja de A. Restore real en otro contenedor/red/volumen/rol propios, sin puertos PG publicados; A/items/amistad/share/idempotencia permanecen eliminados, B y su colección vacía conservados; catálogo y cincoGIN válidos. CLI no habilita tráfico por sí mismo.
- Sólo tras restore verificado: proxy TCP propio loopback, API/Next actuales compilados, correo/jobs/proveedores bloqueados y navegador temporal. Login A401, JWT firmado A401, share404; B entra, consulta colección y conserva sesión tras recarga. Dos capturas seguras, sin email/token/contraseña ni fotos de consulta.
- Vencimiento a30d exactos mediante reloj **inyectado sólo en biblioteca del fixture**: dry-run conserva ciphertext; corte controlado tras primer unlink deja intención, reapertura completa el recibo una vez, replay0, restore de retirado rechazado. Copia no registrada y custodia de bajas sobreviven hasta cleanup del ensayo. No se esperaron30d ni se modificaron reloj/TTL reales.

## Revisión y fallos conservados

[Revisión sólo lectura y resoluciones root](INF-03-retencion-evidencia/review-resolution.json): éxito prematuro, fsync de payload/recibo y vencimiento durante replay. Regresiones causales antes/después: [backend3pasados/1fallo](INF-03-retencion-evidencia/baseline.log)→16focales verdes; [cierre4pasados/1fallo](INF-03-retencion-evidencia/close-baseline.log)→13verdes. Archivos sincronizados antes del inventario; cierre sincroniza directorios antes de emitir éxito. Durabilidad ante pérdida eléctrica no ensayada.

[Intento1](INF-03-retencion-evidencia/runtime-attempt-1.json) completó21controles pero Docker internal impidió alcanzar el proxy. Se agregó ingreso propio con binding loopback después de restore. [Intento2](INF-03-retencion-evidencia/runtime-attempt-2.json) completó28controles y falló por selector accesible exacto de Email. Se sustituyó por ID existente del formulario; intento3 pasó40/40. Ambos fallos y cleanup preservados, dos correcciones con evidencia nueva; no retries idénticos ni otra suite global. No se atribuyen fixes a los históricos socket/backfill.

## Integridad, cleanup e instancia

[1462fuentes/outputs seleccionados intactos durante runtime](INF-03-retencion-evidencia/runtime-integrity.json), caché mutable Next excluida. [Baseline516](INF-03-retencion-evidencia/source-baseline-comparison.json) capturado después del dispatch y antes de la extracción backend: seis deltas seleccionados autorizados; diez archivos de tarea fuera de esa selección. No es snapshot completo previo del dirty tree.16copias actuales de fuentes; [45artefactos con hashes](INF-03-retencion-evidencia/artifact-hashes.json).

Los tres intentos retiraron sus contenedores/redes/volúmenes etiquetados, plaintext, ciphertext/identidades y custodia de fixtures. Contenedores comparados por fullID al retirar; redes/volúmenes por nombre/labels del run. API/Next QA y navegador cerrados. [Cleanup final root](INF-03-retencion-evidencia/cleanup-receipt.json): clon estándar por marker/fullID/SQL0 y Redis propio por fullID/label, absent comprobado. Dev13migraciones/22usuarios/22colecciones/69items/13shares/20670cartas/5GIN y TEST11/2/3/2/1/20670/5GIN/7cotizadas conservados; compartidos mismosIDs/healthy/PONG. Controles agregados, no comparación fila por fila.

[Instancia habitual viva](INF-03-retencion-evidencia/final-instance.json): http://localhost:3000, API77205/Next77219, ascendencia verificada. Login/eliminar-cuenta/health/ready200, anónimo disponibilidad401no-store. Sin fixtures en dev; jobs/proveedores/correo y eliminación real deshabilitados. Verificar recibo y procesos antes de detener. Dos encargos delegados de máximo cuatro, root correcciones/gates/centrales; sin agentes ni QA propios activos. Automatización PAUSED/dos horas conservada.

## Límites y próximo paso

No scheduler instalado, copia off-host, custodia real de claves, prueba de energía/SIGKILL ni RPO/RTO operativo. HMAC no detecta rollback conjunto si el custodio también revierte su checkpoint; se requiere custodia actual confiada. Un crash real con locks exige intervención acreditada; no se adivina el estado. Copias externas o no registradas no desaparecen automáticamente; no podar supresiones por plazo30d.

Mini PC todavía no adquirida; activación real y Resend quedan para el final. **Próximo propuesto: elegir destino externo de copias cifradas y custodia de claves, sin contratar ni activar servicios. Preguntar y esperar al usuario antes de iniciar.**

## Capturas reales

[Cuenta conservada tras restore y login](INF-03-retencion-evidencia/coleccion-restaurada-mobile.png) · [Enlace de cuenta suprimida](INF-03-retencion-evidencia/enlace-suprimido-mobile.png).
