# Custodia y recuperación local simulada INF-03

Esta herramienta reconstruye el repositorio de backups, su inventario y el
journal de bajas después de **simular** la pérdida de sus cinco carpetas. No
usa red, B2, PostgreSQL, Redis, age ni descifrado. Devuelve siempre
`restoreEligible:false`: después de la reconstrucción, el CLI normal de restore
debe admitir el backup, reproducir las bajas y probar el consumidor.

## Autoridad y límites

El custodio confiado conserva **dos ubicaciones independientes**: `store`, con
snapshots de metadatos inmutables, y `anchor`, con el checkpoint actual. Cada una
tiene un marcador propio, UUID y HMAC distinto; ambas son privadas 0700 y están
fuera del árbol lógico que contiene los cinco originales. El destino existente
de transferencia también queda fuera de ese árbol y separado de store/anchor.
Todas las rutas son absolutas canónicas, disjuntas y sin symlinks. Los archivos
son 0600, propios y con un solo enlace. Los padres de los cinco destinos de
recuperación deben existir con permisos 0700; los cinco destinos deben faltar.

El anchor referencia exactamente un snapshot completo mediante UUID y hash del
commit firmado; jamás se elige por nombre, fecha de modificación o por un
checkpoint incluido en un dump. No hay búsqueda de un snapshot anterior si
faltan bytes. Perder el anchor, detectar un desacuerdo o encontrar corrupción
bloquea la recuperación. Sólo `init` puede provisionar un estado inicial sin
snapshot; `publish` nunca inventa un journal vacío.

Las cuatro claves se entregan exclusivamente por entorno y permanecen en
memoria; no se escriben dentro de snapshots, descriptors ni salida estándar:

- `INF03_CUSTODY_HMAC_KEY`: mínimo 32 bytes, distinta de todas las demás.
- `INF03_INVENTORY_HMAC_KEY`: clave del inventario original.
- `INF03_SUPPRESSION_HMAC_KEY`: clave auténtica del journal de bajas.
- `INF03_TRANSFER_HMAC_KEY`: clave del destino de transferencia; obligatoria para recuperar.

Se confía en el custodio, sus claves, su reloj y la persistencia de anchor.
Un rollback conjunto de anchor y store con firmas válidas **no se detecta**.
Un actor que controle todas las claves y permisos puede fabricar autoridad.
Filesystem local no equivale a off-host: separar carpetas no sobrevive la pérdida
física de la misma máquina o disco. Fsync y locks no acreditan pérdida eléctrica,
SIGKILL ni durabilidad de un proveedor externo.

Una publicación manual sólo acredita el journal observado mientras se toman
sus locks. La API tiene un binding opt-in **local simulado** explicado abajo;
ninguno de los dos garantiza un ack durable off-host. La custodia externa y su
frescura verificable siguen pendientes. Una baja posterior al último anchor
publicado no aparece durante recovery hasta publicar sus pendientes válidos.

## Comandos

Creá previamente `store` y `anchor`, vacíos, privados y propios. Conservá las
claves fuera del host lógico perdido. `init` requiere que los cinco originales
existan; no los modifica ni valida su contenido como una publicación.

```sh
pnpm exec node scripts/inf03-custody.mjs init --mode local-simulated \
  --store /ruta/custodio/store --anchor /ruta/anchor/actual \
  --repository /ruta/host/repositorio --inventory /ruta/host/inventario \
  --inventory-checkpoint /ruta/host/checkpoint-inventario \
  --suppression-journal /ruta/host/bajas \
  --suppression-checkpoint /ruta/host/checkpoint-bajas
```

`publish` toma locks exclusivos de custodia y abre el inventario **normal** con
su auditoría completa y el journal auténtico actual. Requiere el build vigente
del backend: importa de forma diferida únicamente
`backend/dist/modules/account-deletion/suppression-journal.js`. No carga `.env`,
Prisma ni servicios de aplicación.

```sh
pnpm exec node scripts/inf03-custody.mjs publish --mode local-simulated \
  --store /ruta/custodio/store --anchor /ruta/anchor/actual \
  --repository /ruta/host/repositorio --inventory /ruta/host/inventario \
  --inventory-checkpoint /ruta/host/checkpoint-inventario \
  --suppression-journal /ruta/host/bajas \
  --suppression-checkpoint /ruta/host/checkpoint-bajas
```

El snapshot captura **bytes exactos** del marcador de repositorio,
`inventory.json`, ambos `checkpoint.json`, `genesis.json` y `entries.jsonl`.
No incluye dump ni ciphertext. Guarda hashes, tamaños, rutas originales,
repositoryId/journalId, secuencias, heads y cobertura del journal en un descriptor
firmado. Los backups activos deben quedar cubiertos desde su fecha original.
Revalida las fuentes antes y después de copiarlas; escribe el commit sólo después
de sincronizar todos los metadatos y avanza anchor después del commit completo.
Repetir exactamente las mismas cabezas y bytes es idempotente. Rechaza rollback,
cambio de IDs/cobertura, bifurcación con igual secuencia, cambios del prefijo del
journal y eliminación o regresión de registros ya publicados. Los registros
retirados conservan sus tombstones; un estado `deleting` bloquea publicación.

Los ciphertexts necesarios deben haber sido subidos previamente mediante el
[transporte local simulado](TRANSFER-LOCAL.md). Recovery abre ese destino sin
`inventoryConfig`, usa sus guards y `verifyObject`, y compara los bytes limitados
contra el record original firmado. No usa `download`, cuyo contrato exige los
originales actuales y permanece intacto.

```sh
pnpm exec node scripts/inf03-custody.mjs recover --mode local-simulated \
  --store /ruta/custodio/store --anchor /ruta/anchor/actual \
  --repository /ruta/host/repositorio --inventory /ruta/host/inventario \
  --inventory-checkpoint /ruta/host/checkpoint-inventario \
  --suppression-journal /ruta/host/bajas \
  --suppression-checkpoint /ruta/host/checkpoint-bajas \
  --objects /ruta/transferencia/objetos
```

Recovery exige las mismas cinco rutas canónicas ancladas en publicación. Hace
preflight de todos los registros activos, hasta 1000, antes del primer mkdir.
Un activo vencido por su fecha original de 30 días, un objeto retirado, incompleto,
corrupto o ausente bloquea el conjunto. Los registros retirados sólo recuperan
metadata/tombstones; nunca payload. Se conservan los UUID, fechas y firmas
originales, incluido el marcador que vincula el repositorio a su ruta: no se
vuelve a registrar ninguna copia ni se vuelve a firmar el inventario.

Crea directorios nuevos 0700 y archivos nuevos 0600 con exclusividad, lecturas
acotadas y revalidación de paths, dev/ino, hashes y anchor. Sincroniza antes de
reabrir el inventario normal y el journal auténtico; exige que sus cabezas y
bytes coincidan con el anchor. Revalida retención durante la operación y el
cierre. Sólo emite JSON acotado después de cerrar todos los locks; un error de
cierre impide emitir éxito. La única sustitución de archivo autorizada es el
checkpoint mutable `anchor/current.json`, después de verificar su identidad y
sus bytes actuales; originales y snapshots nunca se sobrescriben.

Los CLI rechazan opciones desconocidas, duplicadas, irrelevantes, URLs, modos
remotos y flags de reloj. Los errores son genéricos y no revelan entradas de
bajas, claves ni paths. Una interrupción conserva snapshot incompleto, temporales,
locks o originales parciales para intervención; no borra ni repara nada por
su cuenta. Un retry de recuperación con cualquier original presente falla.

`verify` admite exactamente los mismos flags que `publish`. Abre el inventario
normal y el journal auténtico, compara todos sus bytes/cabezas contra el anchor
actual y vuelve a verificarlo antes de cerrar; nunca publica ni avanza autoridad.
Invocalo inmediatamente antes y después del restore normal, antes de abrir
tráfico. Si el anchor se adelantó y los originales reconstruidos quedaron atrás,
`verify` falla: no hay republish automático ni admisión de autoridad histórica.
Los resultados operativos incluyen `expiresAt`, el menor vencimiento original
de los activos, o null si no hay activos; el CLI también lo comprueba después de
cerrar custodia, justo antes de emitir JSON.

## API y verificación

`scripts/inf03-custody-common.mjs` exporta:

- `initializeCustody(config)`: provisión explícita.
- `LocalSimulatedCustody(config)`: `open`, `publish`, `verify`, `recover({objects, transferKey})`, `close`.

Config contiene `store`, `anchor`, `key`, `inventoryConfig` con
`repository/inventory/checkpoint/key`, `journalConfig` con
`journalDirectory/checkpointDirectory/hmacKey`, `journalFactory` obligatoria,
`transferKey` opcional hasta recovery y `clock` inyectable sólo para ensayos.
La factory async devuelve una instancia con `open/snapshot/close`; la autoridad
del protocolo es `LocalSuppressionJournal`, no este adaptador.

`inf03-custody.test.mjs` usa un doble acotado que compara bytes contra una
autoridad en memoria. Prueba custodia, integridad, rutas y rollback sin depender
de dist. **No acredita el protocolo MAC/cadenas del backend.** El ensayo real
requiere factory compilada, journal con MAC/cadenas reales y el CLI normal de
restore/consumidor después de una pérdida aislada de originales. Permanecen los
gates del proyecto: stop antes de tests, check completo y flujo aislado real.
No se usan datos ni recursos de desarrollo en los fixtures.

## Binding vivo de la API (opt-in local simulado)

La instancia habitual conserva `ACCOUNT_DELETION_MODE=disabled`. El legado
`ACCOUNT_DELETION_MODE=local-private` sin configuración de custodia sigue
operando sólo con journal local. Para el ensayo vivo, mantené ese modo de journal
y agregá `ACCOUNT_DELETION_CUSTODY_MODE=local-simulated`, más:

- `ACCOUNT_DELETION_CUSTODY_STORE_DIR`, `ACCOUNT_DELETION_CUSTODY_ANCHOR_DIR`
  y `ACCOUNT_DELETION_CUSTODY_HMAC_KEY`.
- `ACCOUNT_DELETION_BACKUP_REPOSITORY_DIR`,
  `ACCOUNT_DELETION_BACKUP_INVENTORY_DIR`,
  `ACCOUNT_DELETION_BACKUP_CHECKPOINT_DIR` y
  `ACCOUNT_DELETION_INVENTORY_HMAC_KEY`.
- Las tres variables existentes del journal
  `ACCOUNT_DELETION_JOURNAL_DIR`, `ACCOUNT_DELETION_CHECKPOINT_DIR`,
  `ACCOUNT_DELETION_HMAC_KEY`.

Usá las mismas rutas y claves ya provisionadas por los CLI, claves distintas
por dominio, directorios privados disjuntos y store/anchor fuera del host lógico.
Con la API detenida, provisioná y publicá explícitamente una primera autoridad
mediante el CLI. Arrancar la API con anchor genesis, faltante o no verificable
falla cerrado; el arranque no inicializa, repara ni selecciona otra autoridad.
El backend compilado requiere los tres módulos comunes INF-03 en la carpeta
`scripts` de la raíz de este repositorio, preservando la ubicación relativa de
`backend/dist/modules/account-deletion/suppression-custody-worker.js`. No depende
del directorio desde el cual se inició Node. Esos `.mjs` deben estar disponibles
como código de sólo lectura. Una imagen futura que empaquete únicamente
`backend` no satisface este opt-in sin incorporar ese layout; este paquete no
modifica Docker ni packaging. El legado sigue siendo el default.

La API reserva un turno exclusivo antes de abrir la transacción que valida
contraseña/versión con User lock. Una espera de turno de 5 s vence sin ejecutar
ese callback. Antes de aceptar exige margen para publicación y commit dentro
del timeout PG de 15 s. Acepta el journal genuino, toma su snapshot bajo los
locks que conserva el proceso vivo y presta ese snapshot a un hijo aislado.
El préstamo no abre otro journal ni libera su writer: `open/close` prestados no
tienen ownership. Las fuentes normales verifican igualdad byte a byte, MAC,
prefijo y monotonía; no se fabrica ni vuelve a firmar el inventario.

El hijo recibe configuración y snapshot por stdin privado, con entorno vacío,
valida el anchor actual publicado y su snapshot, publica monotónicamente,
verifica fuentes contra anchor y cierra los locks de custodia/inventario. Sólo
entonces emite el ack exacto. El padre exige ack acotado, cabeza coincidente,
vencimiento vigente y cierre de proceso con código 0 antes de borrar PG. El
deadline de 8 s mata y drena el hijo antes de liberar el turno. Tanto la admisión
del turno como el cierre cotejan además tiempo monotónico transcurrido: un timer
demorado no admite trabajo ni confirma un ack fuera de plazo. No hay reintentos
automáticos. Un cierre fallido, ack perdido, timeout o publicación incierta
produce error y deshabilita la protección hasta reiniciar; no confirma éxito.
La intención local ya aceptada permanece irrevocable.

Shutdown deja de admitir turnos, espera los ya iniciados (incluido commit PG)
y cierra sólo su journal. Una muerte forzada del hijo puede conservar locks y
parciales: retirarlos requiere acreditar el proceso detenido, revisar integridad
y anchor actual con tráfico cerrado. Nunca borrar locks ni reparar heads por
reintento. En startup, pendientes íntegros del journal se publican sólo como
extensión monotónica de la autoridad vigente validada; después se aplica replay
PG antes de escuchar. Una cabeza local anterior o bifurcada falla cerrado.

Recovery sigue siendo el CLI normal con el anchor actual y tráfico cerrado:
no reanuda desde un ack de HTTP ni desde un checkpoint del dump. El ensayo vivo
debe verificar fallos antes de publicación, respuesta perdida, fallo PG,
concurrencia, restart/replay y pérdida de originales seguida de recovery y
restore. Estas carpetas separadas siguen en una misma máquina: no acreditan
B2, off-host físico, corte eléctrico ni rollback conjunto del custodio.
