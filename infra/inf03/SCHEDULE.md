# INF-03: calendario y ciclo local simulado

`node scripts/inf03-schedule.mjs` ejecuta una sola pasada. No instala cron,
launchd, daemon ni seguimiento; no usa B2, red o cuentas reales. Sigue limitado
al origen sintético propio de `inf03-backup.mjs` y no decide un RPO operativo.

## Provisión y uso

Creá explícitamente un directorio vacío, privado `0700`, separado de repository,
inventory, checkpoint, objetos, store, anchor y ambos directorios del journal.
Las autoridades existentes deben estar provisionadas y verificables; el calendario
no las crea ni recupera. El backend debe estar compilado: el CLI importa el
`LocalSuppressionJournal` genuino, sin cargar `.env` ni Prisma.

Los tres comandos usan estos argumentos obligatorios, con rutas absolutas:

```text
init | plan | cycle [--apply]
--mode local-simulated
--schedule <directorio privado>
--starts-at <ISO UTC canónico>
--cadence-ms <entero entre 60000 y 2592000000>
--repository <directorio> --inventory <directorio> --inventory-checkpoint <directorio>
--objects <directorio> --store <directorio> --anchor <directorio>
--suppression-journal <directorio> --suppression-checkpoint <directorio>
--run inf03-<12 hex> --container inf03-<12 hex>-source-pg
--database inf03_source --db-user inf03_source
--recipient <recipient age> --age <ejecutable absoluto age1.2.1>
```

Pasá por entorno `INF03_SCHEDULE_HMAC_KEY`, `INF03_INVENTORY_HMAC_KEY`,
`INF03_TRANSFER_HMAC_KEY`, `INF03_CUSTODY_HMAC_KEY` e
`INF03_SUPPRESSION_HMAC_KEY`: todas distintas, de al menos 32 bytes. Sólo el
backup requiere `INF03_DB_PASSWORD`, con las mismas restricciones previas.
No pongas claves en argumentos ni archivos de evidencia.

`init` provisiona únicamente el marcador firmado del calendario. Vincula la
configuración por digest, el path/inodo propio y las identidades de las autoridades.
No se acepta cambiar origen, claves, paths o cadencia para reutilizar ese marcador.
`plan` y `cycle` sin `--apply` son dry-run: no cambian autoridades ni crean intents;
abren y cierran locks temporales para verificarlas. `cycle --apply` ejecuta:

1. Verificación completa de autoridades y ledger; selección del último slot debido,
   o reconciliación prioritaria del único slot pendiente. Los slots perdidos no
   generan una ráfaga de backups.
2. Intent firmado durable antes del backup, con filename determinístico. El
   backup existente registra el original; un reinicio sólo admite ese registro
   verificado. Upload conserva `backupId` y `originalCreatedAt` y es idempotente. La finalización registra si hubo publicación remota; si después falta ese objeto completo, se bloquea plan/apply sin recrearlo automáticamente. Un pendiente que venció antes de upload puede retirarse sin declarar una publicación inexistente.
3. Prune local y retiro de objetos con los módulos existentes, incluso cuando no
   corresponde backup. El vencimiento sigue siendo exactamente 30 días desde
   `originalCreatedAt`; los estados deleting y sus intents se preservan al retomar.
4. Publish y verify de custodia. Sólo después se agrega una finalización firmada;
   el resumen sale después de cerrar locks.

No se poda el journal de bajas, los intents del calendario ni la metadata/tombstones
de retiro. El ledger admite hasta 1000 slots; al alcanzar ese límite, falla cerrado
sin rotación automática. El marcador y ledger son estado local firmado, sin una
nueva garantía de antirollback externa. Cada módulo conserva sus checkpoints.

## Cortes y límites

Si el backup falla o se interrumpe antes de un registro aceptado, la siguiente
pasada falla cerrado: no relanza el backup, no importa un ciphertext suelto ni
elige otro slot. Conservá los archivos y locks para diagnóstico del operador.
Si el original está registrado, se reconcilia y continúa; si venció entretanto,
se retira con su fecha original, sin crear un reemplazo para ese slot.

Cada fase se espera hasta que termine; el deadline real se revisa entre fases.
El callback library debe ser acotado y devolver sólo con sus escrituras asentadas.
El CLI limita el backup a diez minutos, mata su grupo de procesos locales y
espera `close` y desaparición del grupo. Si el grupo no desaparece tras cinco
segundos adicionales, conserva el lock del calendario. Nunca devuelve un timeout
con una promesa de mutación que siga en segundo plano.

Matar el grupo local **no acredita** que un `pg_dump` dentro de Docker haya
terminado. Un SIGKILL puede dejar staging o locks: requiere verificación y limpieza
manual sobre la identidad propia antes de continuar. El calendario no borra locks
ajenos/obsoletos ni hace cleanup amplio. Un fallo de fsync al crear un lock también
lo conserva si no pudo acreditar su identidad.

El reloj del CLI siempre es real. La inyección de reloj sólo existe en la library
para fixtures. Los focales usan inventario, transfer y custodia reales con callback
de backup sintético y un doble del journal explícitamente acotado; eso no acredita
la cadena HMAC del backend ni la restauración PostgreSQL. El consumidor aislado
con backup real y journal compilado se verifica por separado.
