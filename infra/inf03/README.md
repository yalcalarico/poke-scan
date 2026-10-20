# INF-03 — respaldo cifrado y recuperación local

Calendario/ciclo local explícito: [procedimiento](SCHEDULE.md). No instala cron ni activa proveedores. La operación real de mini PC y B2 queda diferida al final por pedido del usuario.


Estado: **fase local corregida y gate técnico integrado aprobados Sol HIGH;
operación/off-host y consolidación del coordinador pendientes**.

## Inventario y vencimiento local de copias sintéticas

Los helpers de backup/restore ahora exigen inventario vigente y custodia de
supresiones. Las invocaciones históricas sin esos argumentos fallan cerradas.
Esta ampliación está preparada para el gate local; los reportes históricos
anteriores conservan su alcance original.

Provisión explícita: prepará tres directorios propios existentes, vacíos, 0700,
con rutas absolutas, distintos y no anidados: repositorio de ciphertext,
inventario y checkpoint vigente. Protegé `INF03_INVENTORY_HMAC_KEY` independiente
(mínimo 32 caracteres) fuera del snapshot y de las evidencias. Inicializá una
sola vez:

```sh
pnpm exec node scripts/inf03-inventory.mjs init \
  --repository /ruta/privada/ciphertexts \
  --inventory /ruta/privada/inventario \
  --inventory-checkpoint /ruta/privada/custodia-inventario
```

El marcador firmado identifica exclusivamente el repositorio sintético INF-03,
su UUID y su ruta. El inventario firmado conserva UUID de backup, nombre directo
del archivo, **fecha original del manifiesto**, tamaño/digest SHA-256 del
ciphertext y digest del recibo. Su checkpoint separado fija secuencia y cabeza.
Sólo el flujo de backup propio registra una publicación cifrada verificada;
no existe comando de importar copias ni registro automático de archivos
encontrados. El recibo exterior sigue siendo informativo sobre la publicación:
su fecha, mtime, descarga, copia o movimiento jamás renuevan los 30 días.
Mover el repositorio o presentar una copia desde otra ruta no autoriza restore.

Backup y restore requieren estos mismos tres flags; `--output` debe ser un
archivo directo terminado en `.age` dentro del repositorio marcado. El backup
retira sus hardlinks temporales propios antes de registrar, sin debilitar el
rechazo de hardlinks. Un fallo de registro puede conservar ciphertext/recibo
sin registrar: no se adoptan, restauran ni eliminan automáticamente.

Para comprobar vencimiento, ejecutá el comando sin `--apply`:

```sh
pnpm exec node scripts/inf03-retention.mjs \
  --repository /ruta/privada/ciphertexts \
  --inventory /ruta/privada/inventario \
  --inventory-checkpoint /ruta/privada/custodia-inventario
```

El resultado `{dryRun:true,expired:[...]}` identifica backups vencidos. Edad
**>=30 días** vence; fechas imposibles, futuras o no UTC canónicas se rechazan.
Añadir `--apply` autoriza eliminar exclusivamente ciphertext y recibo registrados
vencidos y devuelve `{dryRun:false,retired:[...]}`. Cada archivo se vuelve a
verificar por digest, tamaño, identidad y links antes de unlink. No se recorren
archivos ajenos ni se borra recursivamente el repositorio. El inventario y sus
tombstones permanecen; tampoco se borra el registro de supresiones.

Se usan locks exclusivos en los tres directorios y archivos 0600 con owner,
O_NOFOLLOW, nlink=1 y límites (4 MiB/10.000 registros para estado; 128 MiB para
ciphertext; 64 KiB para recibo). Antes de operar se verifican todas las copias
activas: ausencia inexplicada, duplicados, metadata discordante, modificación,
symlink/hardlink o checkpoint inválido bloquean la operación completa. No se
interpreta un archivo activo ausente como una eliminación cumplida.

Apply persiste y sincroniza estado `deleting` y checkpoint **antes** del primer
unlink, incluyendo identidad/hash/fecha autorizados. Si se interrumpe después,
esa intención vigente permite completar idempotentemente el segundo unlink y
retirar la entrada, conservando su tombstone. Una copia reaparecida con otra
identidad se rechaza. Un corte entre escritura de estado y checkpoint deja
desacuerdo y requiere intervención; no se repara adivinando. Un crash real
conserva locks: acreditá el proceso anterior detenido, integridad y custodia
vigente antes de retirar exclusivamente sus locks con tráfico cerrado.

Este comando automatiza la decisión y aplicación local y puede ser invocado por
un operador futuro. No instala calendario global, scheduler ni destino off-host.
HMAC acredita integridad bajo clave protegida, **no frescura si un custodio
revierte conjuntamente todo el estado y sus checkpoints**. La premisa es
custodia actual independiente del backup, disponible y protegida por el operador.

## Supresiones obligatorias antes de admitir restore

Además del inventario, restore requiere `--suppression-journal DIR`,
`--suppression-checkpoint DIR` y `INF03_SUPPRESSION_HMAC_KEY`, con dos directorios
privados de custodia vigente distintos entre sí y de los tres anteriores.
Provisioná el registro usando `initializeLocalSuppressionJournal` como indica
[el procedimiento de baja](../../docs/infra/account-deletion.md). La cobertura
debe empezar antes del backup más antiguo admisible; nunca se crea un registro
vacío como fallback cuando falta el actual.

Compilá el backend vigente antes de invocar restore. El CLI reutiliza los
módulos puros compilados `backend/dist/modules/account-deletion/restore-policy.js`
y `suppression-journal.js`; no crea Prisma, no lee `.env` ni conecta a DSN del
host. Toma locks de ambos registros, verifica inventario, fecha/hash/identidad
del paquete y cobertura/cabeza actuales antes de pg_restore. Revalida todos
esos datos inmediatamente antes de la mutación.

Después de pg_restore aplica las intenciones actuales y verifica las relaciones
personales en una transacción SQL cerrada mediante psql dentro del contenedor
propio, con el mismo predicado del helper backend. El catálogo y las colas
globales se conservan. Si falla replay/verificación, cambia una cabeza o vence
el backup durante el procedimiento, el destino permanece aislado y no se emite
`restored:true`. Ese resultado se emite sólo tras replay verificado, última
revalidación, limpieza de plaintext y cierre de locks; incluye
`suppressionsApplied:true`. No habilita tráfico por sí mismo.

Regresiones offline nuevas (restore CLI necesita el build backend vigente):

```sh
pnpm exec node --test scripts/inf03-inventory-common.test.mjs scripts/inf03-retention.test.mjs scripts/inf03-inventory-restore.test.mjs
```

Estas pruebas cubren plazo exacto, copias sin renovación, checkpoint actual,
archivos propios, corrupción/links/faltantes, corte tras cada unlink y rechazo
antes de SQL/reapertura. El ensayo real aislado debe verificar además supresión
de una cuenta que todavía estaba presente en el snapshot y conservación de otra.

## Gate opcional con consumidor API/web

```sh
pnpm run stop
pnpm exec node scripts/inf03-smoke.mjs --download-tools --app-flow
```

`--tools-dir /ruta/absoluta/binarios-age --app-flow` permite el mismo recorrido
sin descarga. El modo habitual conserva sus fixtures y evidencia. El modo app
agrega **antes del backup** otra operación con UUID/hash canónico válidos, una
nota privada sintética y un icono local de catálogo; conserva la operación
legado. El JSON completo restaurado se compara antes de unir consumidores.
Después del restore positivo, inicia las imágenes locales INF-02 aceptadas
por sus IDs exactos, con scanner desactivado y worker/crons de precios apagados.
No reconstruye imágenes ni repite el warmup DINOv2.

API y Redis propios permanecen únicamente en la red interna del destino. La
web añade una red de ingreso propia y un puerto loopback libre; SSR consulta
la API por `API_INTERNAL_URL`. El transporte de este gate SSR es HTTP local.
La configuración de sesiones declara un origen HTTPS sintético para respetar
el guard de production; no se ejecutan login, cookies ni flujos de sesión.
Los JWT HS256 de prueba identifican exclusivamente las cuentas sintéticas.
La evidencia HTTPS/auth/DINOv2 de INF-02 se conserva separada.

El helper verifica cantidades/atributos/UUIDs restaurados, ownership 404,
401 anónimo, replay sin incremento, conflicto 409 y nueva intención en SQL.
También comprueba allowlist pública, no-store, SSR/noindex, bundle sin host
privado y revocación/reactivación/vencimiento con caché Redis caliente.
La expiración se fuerza por SQL sólo en el link propio: el DTO admite días,
no segundos. No se consultan proveedores ni se persisten fotos. Un replay
puede encolar un job propio pendiente; worker apagado y red interna impiden
ejecutarlo, y se retira junto con la DB descartable.

Cleanup verifica IDs, imágenes, labels, redes y binds exactos antes de retirar
los consumidores. La red destino vuelve a ser exclusiva de PostgreSQL y pasa
la guarda original; después se retiran DB, volúmenes, redes y temporales del
run. El resultado se escribe en `RESULTADOS/LOTE-OPERACION-integracion.json`,
sin sobrescribir `INF-03-evidencia.json` ni el reporte local previo. Los
intentos anteriores del gate se conservan por separado.

Las regresiones del helper no necesitan DB/Docker:

```sh
pnpm exec node --test scripts/inf03-app-flow.test.mjs
```

Este modo acredita HTTP/SSR sobre una restauración sintética. No acredita UI
interactiva, precisión, dispositivos físicos, producción, off-host o RPO/RTO.
El check global y la suite INF-02 se ejecutan serialmente al cierre del lote,
después de cleanup; consultá `RESULTADOS/LOTE-OPERACION-validacion.md`.

Los 10 negativos del ensayo original no verificaban las capas anunciadas: se
rechazaban por destino ocupado. Consultá
[la revisión](../../docs/plans/lanzamiento-2026-10-07/RESULTADOS/INF-03-local-review.md).

Los helpers sólo admiten bases sintéticas `inf03_source` / `inf03_destination`
en recursos Docker propios `inf03-<12 hex>`, sin puertos publicados. No aceptan
DSN, no cargan `.env` y no leen datos de desarrollo ni tests. La imagen fijada
por digest debe estar disponible localmente:

`postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4`

El origen y el destino tienen contenedor, volumen y red interna independientes.
Las guardas verifican labels, identidad de imagen, ausencia de mounts adicionales,
exclusividad real de volumen/red, major de cliente/servidor, propietario de DB,
marcador de bootstrap y rol sin superuser/createdb/createrole/replication/bypassrls,
sin membresías ni herencia. El restore exige destino sin objetos ajenos y
revalida inmediatamente antes de SQL. No usa `--clean`, `--create` ni migrate dev.

## Ejecución reproducible

Node **22.20.0**, pnpm **10.17.1**, Docker local y la imagen anterior ya cacheada.
Primero liberá API/web:

```sh
pnpm run stop
```

Checks offline reales, sin descargas, con cleanup propio:

```sh
pnpm exec node scripts/inf03-review-offline.mjs
```

El runner completo **no descarga por defecto**. Con age **v1.2.1** y age-keygen
oficiales ya disponibles en un directorio local (sin identidades privadas):

```sh
pnpm exec node scripts/inf03-smoke.mjs --tools-dir /ruta/absoluta/a/binarios-age
```

El usuario autorizó explícitamente la descarga oficial el 8/10. Esta alternativa
descarga age al staging privado, sin instalarlo:

```sh
pnpm exec node scripts/inf03-smoke.mjs --download-tools
```

Esta opción descarga únicamente el release oficial age; no hace `docker pull`.
El run `inf03-beb6f1226ff2` pasó un restore positivo y 16 negativos de
prevalidación, más un fallo SQL controlado y una colisión de backup. Los dos
fallos del chunk final produjeron 327680 B parciales en age directo, y el helper
no invocó pg_restore: autenticación completa precedió a SQL de restauración.
La compatibilidad ensayada es macOS ARM64; no se promete Linux,
Windows ni otras arquitecturas. El runner registra versión y SHA-256 observado
de binario/archive; HTTPS + hash observado no equivalen a una firma verificada
del publicador. Nunca reutilices las identidades efímeras de prueba para operación.

## Paquete y límites

`pg_dump -Fc --no-owner --no-acl` produce un snapshot lógico consistente. Se
empaquetan únicamente dos archivos regulares USTAR: `manifest.json` y
`database.dump`. El manifiesto estricto tiene alias sintético, formato, versión,
UUID, migraciones **y sus checksums**, extensión, huella del schema público,
tamaño/SHA-256 del dump y política de privacidad. No incluye PII, credenciales,
configuración, fotos, modelo ni índice. El dump sí debe tratarse como privado.
El recibo exterior vincula UUID/tamaño/hash del ciphertext; no prueba autoría.

El cifrado es age estándar. El restore espera exit exitoso y EOF autenticado
de **todo** age antes de validar tar o ejecutar pg_restore; no conecta su output
directamente a SQL. El tar se valida entero antes de escribir los dos archivos:
se rechazan paths ajenos, absolutos, traversal, links, duplicados, extras,
extensiones tar, headers/tamaños/EOF inválidos. Los archivos extraídos quedan
0600 aunque el tar declare 0644. El manifiesto, las migraciones/checksums y el
digest interno se verifican antes de la restauración.

El límite local es **128 MiB** para dump, ciphertext y plaintext tar, **64 KiB**
para manifiesto/recibo y **4 KiB** para identidad. Cada subprocess tiene deadline
finito (hasta 120 s) y output capturado limitado; el output de dump/age tiene
límite duro durante streaming. No es una herramienta para backups arbitrarios
de producción de mayor tamaño. Los errores de subprocess no publican stderr
crudo. Pgpass escapa primero `\` y después `:`, y rechaza CR/LF/NUL.

Staging del host 0700 y archivos 0600, rutas sin symlinks, subdirectorios internos
propios con UUID y limpieza en `finally` tanto tras éxito como fallo. La limpieza
interna verifica la identidad del contenedor. No se borran nombres fijos de /tmp
ni directorios ajenos. El runner conserva contexto privado si no puede acreditar
cleanup. No se promete borrado físico seguro en SSD ni durabilidad ante corte
eléctrico de la publicación local. La publicación usa hardlinks exclusivos:
no sobrescribe backup/recibo existentes, y publica el recibo al final.

`pg_restore --single-transaction --exit-on-error --no-owner --no-acl` corre con
rol limitado. SQL proviene sólo del dump sintético propio: cifrado/checksums no
hacen seguro un dump de origen desconocido. La huella compara columnas con
tipos/default/nullability, constraints y definiciones de índices de `public`;
no representa todos los objetos de PostgreSQL. Se verifican migraciones,
pg_trgm, GIN válidos y ownership después de restore. Los checks offline
confirmaron 33 constraints p/u/f validadas **en public**, no 143 del catálogo.

## Evidencia y operación pendiente

`INF-03-evidencia.json` registra el run corregido `inf03-beb6f1226ff2`;
`INF-03-Luna-historico.json` conserva el run anterior sin convertir sus diez
negativos en evidencia aceptada.
`INF-03-offline-evidencia.json` registra el ensayo offline separado y el followup
de limpieza; `INF-03-offline-intento-1.json`/`-2.json` preservan los intentos
anteriores. Una ejecución futura actualizará la evidencia integrada y su reporte con un
nuevo runId: preservar el anterior y no sumar intentos solapados. La metadata
oficial del release y los hashes observados están en
`INF-03-age-proveniencia.json`: el API publicador devolvió digest null, por lo
que no se atribuye firma/attestation verificada.

Hay vencimiento local de 30 días para copias sintéticas registradas y comando
invocable de pruning. No hay destino off-host, calendario, alertas, identidad
durable ni restore remoto configurados. La pregunta humana de destino/retención/presupuesto
ya está registrada y no se repite aquí. La fase local no acredita recuperación
ante pérdida del host, RPO ≤24 h ni RTO ≤4 h. Timestamps de filas no son tiempos
de commit; el runner distingue confirmación observada de SQL, commit posterior
excluido, duración del backup y tiempo total del ensayo (incluye negativos).

Fuentes primarias: [age v1.2.1](https://github.com/FiloSottile/age/releases/tag/v1.2.1),
[formato age](https://age-encryption.org/v1),
[pgpass](https://www.postgresql.org/docs/16/libpq-pgpass.html),
[pg_dump 16](https://www.postgresql.org/docs/16/app-pgdump.html),
[pg_restore 16](https://www.postgresql.org/docs/16/app-pgrestore.html).

### Regresión del runner existente

`inf03-smoke.mjs` provisiona inventario y custodia de supresiones separados antes
 del backup, y exige esos mismos guards en restore. El registro vacío del runner
 sirve únicamente para sus fixtures sin bajas; el ensayo de retención/bajas usa
 un registro actual con supresiones aceptadas. Los paquetes fabricados o copiados
 fuera del inventario ahora se rechazan en esa capa, antes de descifrar/SQL: no
 cuentan como una nueva prueba de los guards internos de tar, digest ni rollback.
 Cada ejecución escribe evidencia con nombre único y conserva los reportes
 históricos. No repetir el protocolo previo para justificar esta actualización.
