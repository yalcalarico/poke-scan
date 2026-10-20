# Baja propia y supresiones antes de restore

`GET /api/auth/account-deletion-availability` exige sesión propia y responde sólo `{available:boolean}`, con no-store. Comprueba configuración, preparación y registro verificable; no expone paths, checkpoint ni detalles internos. Permite que el consumidor muestre disponibilidad antes de solicitar la contraseña. La instancia habitual queda deshabilitada hasta la provisión operativa; el ensayo propio habilita el registro privado.

`POST /api/auth/account-deletions` requiere JWT propio, `X-Session-Request: 1`, Origin permitido cuando se presenta y JSON `{password, confirmation: 'ELIMINAR'}`. La contraseña tiene 8–72 caracteres. No acepta autoridad de email/userId en el body. Límite: 3/IP/min y 5/cuenta/15min, incluso contraseña incorrecta. Éxito `200 {success:true}` sólo después del commit y limpieza de cookie. Todos los errores y respuestas llevan no-store. No repetir automáticamente un POST incierto.

La baja toma `FOR UPDATE` del usuario, comprueba versión JWT y contraseña vigentes, acepta primero una intención durable y después borra el usuario con cascadas. Una intención aceptada es irrevocable aunque se interrumpa la conexión o falle PG. En ese caso no hay éxito confirmado: login, refresh, guard, recovery y share bloquean esa cuenta por el registro, y el arranque reconcilia las supresiones antes de escuchar tráfico. Tras commit se invalidan best effort las claves conocidas de shares del proveedor vigente en Redis; si Redis falla, PG sigue impidiendo servir esos enlaces. Otras cuentas conservan acceso si el registro es íntegro. Si no puede validarse el registro, toda la protección falla cerrada. Respuestas ya en vuelo y CSV/capturas descargados no pueden retractarse.

## Provisión local explícita

Default `ACCOUNT_DELETION_MODE=disabled`: la app de desarrollo no necesita registro ni modifica cuentas. Para habilitar, el operador crea dos directorios privados **distintos y no anidados**, propiedad del usuario del proceso, permisos 0700; fuera del ciclo de snapshots PostgreSQL. Configura `ACCOUNT_DELETION_MODE=local-private`, `ACCOUNT_DELETION_JOURNAL_DIR`, `ACCOUNT_DELETION_CHECKPOINT_DIR` y `ACCOUNT_DELETION_HMAC_KEY` independiente (mínimo 32 caracteres). Invoca una sola vez `initializeLocalSuppressionJournal(config, coverageStartsAt)` con fecha UTC canónica confiada anterior al backup más antiguo permitido. No existe endpoint público de provisión/restore. No correr provisión encima de un registro existente.

El registro contiene génesis, entradas secuenciales con ID interno y fecha UTC de aceptación, y HMAC SHA256 encadenado. No contiene email, contraseña, tokens, slugs ni contenido personal. El checkpoint firmado incluye identidad del registro, inicio de cobertura, secuencia y cabeza, en custodia separada. Las escrituras/lecturas se serializan; archivos 0600 con O_NOFOLLOW, controles de tamaño (16 MiB/100.000 entradas), owner, links y rutas. Append+fsync antecede a checkpoint temporal+fsync+rename+fsync del directorio. Sólo después de ambos se acepta la intención local. En el modo de custodia local simulada, todavía falta publicar, verificar y cerrar custodia antes de permitir el borrado PG. Una escritura parcial/desajuste deja el registro inválido; no se trunca, resetea ni toma vacío automáticamente.

Dos locks exclusivos (registro y checkpoint) rechazan segunda instancia. Shutdown ordenado libera únicamente locks propios. Crash conserva el lock: el operador debe acreditar proceso anterior detenido, integridad completa y checkpoint vigente antes de retirar exclusivamente ese lock con tráfico cerrado. No adivinar PID, borrar locks ajenos o reinicializar para recuperar disponibilidad. El adaptador local no coordina despliegues distribuidos ni asegura custodia off-host. HMAC acredita integridad con clave protegida, **no frescura** ni resistencia a rollback conjunto de registro+checkpoint. La custodia/checkpoint vigente independiente debe sobrevivir al restore; nunca aceptar el checkpoint del mismo paquete histórico. No alojar archivos en carpetas modificables por terceros ni incluir clave/custodia en evidencias.

## Restore con tráfico cerrado

El operador restaura sólo a un destino Prisma confiado y aislado. `restoreWithSuppressions(prisma, journal, {originalCreatedAt,currentCheckpoint})` recibe fecha original UTC canónica desde inventario confiado actual y checkpoint **vigente** desde custodia ajena al backup. El helper rechaza fecha imposible/futura, edad >=30 días, falta de cobertura, corrupción, truncado o cabeza distinta; copiar/mover/descargar la copia no cambia `originalCreatedAt`. No derivar fecha de mtime de una copia ni confiar metadatos aportados por una copia sin verificarlos contra el inventario.

El helper aplica todas las intenciones (también aquellas cuyo commit original falló), verifica ausencia de usuarios, colecciones, sesiones, recovery, snapshots, operaciones, shares, trabajos personales y amistades; las FKs eliminan los items de las colecciones. Replay repetido es idempotente. Comprueba que la cabeza no cambió durante replay. Sólo después el operador puede evaluar reapertura. Startup habilitado también hace replay antes de escuchar; eso no sustituye validación de antigüedad/inventario antes de restaurar el dump ni habilita tráfico por sí solo.

Cada backup cifrado vence como máximo a los 30 días desde creación original. Esta implementación valida admisión de restore; no instala scheduler, destino off-host, cifrado de backups, inventario ni pruning de copias reales. No borra registros de supresión automáticamente a los 30 días: su retiro requiere demostrar que no quedan copias restaurables que puedan contener esas cuentas. La intención sigue siendo irrevocable; la retención del registro depende de ese inventario, sin prometer conservación eterna. Operación real, custodia/recuperación de claves y responsable siguen pendientes.

## Confirmación de custodia local simulada

`ACCOUNT_DELETION_CUSTODY_MODE=local-simulated` agrega publicación obligatoria
a cada intención aceptada. Es opt-in sobre `ACCOUNT_DELETION_MODE=local-private`;
el modo previo permanece como legado local sin ack de custodia independiente.
Disabled no habilita ni provisiona bajas. Configuración desconocida, dominios
de clave iguales o rutas inválidas fallan cerrado. Variables, provisión y
recuperación de locks están en el
[runbook](../../infra/inf03/CUSTODIA-RECUPERACION-LOCAL.md#binding-vivo-de-la-api-opt-in-local-simulado).

Una cola reserva turno antes de la transacción User lock y cubre aceptación,
publicación, ack y commit PG. Esperar turno no conserva una transacción abierta;
al vencer 5 s no se ejecuta su callback. El hijo custodio (máximo 8 s) presta
el snapshot genuino sin abrir/cerrar el journal vivo. El servicio mantiene
writer locks; las fuentes normales comparan bytes exactos y autoridad actual.
Sólo después de publish, verify, cierre de custodia y cierre exitoso del hijo
se ejecuta deletePG. El éxito HTTP conserva `200 {success:true}` después del
commit: ningún DTO cambia.

El arranque exige anchor ya publicado, valida su snapshot y publica cualquier
prefijo local pendiente como extensión monotónica antes de replay PG y tráfico.
Nunca admite genesis, backup histórico, rollback ni bifurcación. Una aceptación
local con fallo de custodia o ack incierto queda irrevocable y bloquea protección
hasta restart verificado; fallo PG después de ack conserva la supresión y
replay completa el borrado. Shutdown drena turnos iniciados antes de liberar
el journal. No hay retries automáticos, reparación de archivos o claves en
logs. Esta integración no acredita custodia off-host ni habilita la baja real
en la instancia habitual.
