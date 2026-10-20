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
sus locks. **No garantiza que cada baja aceptada por HTTP ya tenga un ack durable
off-host.** El binding vivo entre aceptación de bajas y publicación de autoridad,
la custodia externa y su frescura verificable siguen pendientes. Una baja
posterior al último anchor publicado no aparece mágicamente durante recovery.

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
