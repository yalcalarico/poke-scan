# Transporte local simulado INF-03

Este adaptador copia ciphertext age y recibos entre el repositorio local
registrado y un directorio de objetos simulado. No usa red, B2, SDKs ni
dependencias nuevas. No acredita recuperación ante pérdida total del host.

La provisión del destino es explícita y admite el inventario original ya provisionado. Creá un directorio de objetos existente, propio,
vacío y con permisos 0700, distinto y no anidado respecto del repositorio,
inventario y checkpoint originales. La identidad queda fijada por un UUID y
un marcador HMAC con `INF03_TRANSFER_HMAC_KEY` (mínimo 32 bytes); la clave debe
ser independiente de `INF03_INVENTORY_HMAC_KEY` y quedar fuera de los datos.

```sh
pnpm exec node scripts/inf03-transfer.mjs init --mode local-simulated \
  --objects /ruta/privada/objetos \
  --repository /ruta/privada/ciphertexts \
  --inventory /ruta/privada/inventario \
  --inventory-checkpoint /ruta/privada/custodia-inventario
```

Subí sólo un backup que el inventario original admita como activo y vigente:

```sh
pnpm exec node scripts/inf03-transfer.mjs upload --mode local-simulated \
  --objects /ruta/privada/objetos --repository /ruta/privada/ciphertexts \
  --inventory /ruta/privada/inventario \
  --inventory-checkpoint /ruta/privada/custodia-inventario \
  --input /ruta/privada/ciphertexts/backup.age \
  --receipt /ruta/privada/ciphertexts/backup.age.receipt.json
```

La carpeta de objeto usa el `backupId` y contiene ciphertext, recibo y descriptor
firmado con el timestamp original, tamaños y hashes. El descriptor se publica
al final, después de sincronizar y verificar las copias; un objeto incompleto
falla cerrado y necesita intervención. Repetir una subida completa idéntica es
idempotente. Colisiones y corrupción se rechazan. Los archivos se crean 0600,
con `O_NOFOLLOW`, un solo hardlink y lecturas limitadas a 128 MiB/64 KiB.

La descarga requiere que el registro original siga activo y vigente. El destino
debe no existir, dentro de un directorio privado propio. Se copian los tres
archivos y se vuelven a verificar descriptor y hashes contra el inventario
original; no se registra ni se altera el inventario. La respuesta indica
`restoreEligible:false`: la cuarentena **no** es entrada admisible al CLI de
restore. Se comprueba el timestamp original durante toda la operación, por lo
que copiar no renueva la retención de 30 días.

```sh
pnpm exec node scripts/inf03-transfer.mjs download --mode local-simulated \
  --objects /ruta/privada/objetos --repository /ruta/privada/ciphertexts \
  --inventory /ruta/privada/inventario \
  --inventory-checkpoint /ruta/privada/custodia-inventario \
  --backup-id UUID --destination /ruta/privada/cuarentena/backup-UUID
```

El retiro de objetos simulados tiene comando y capacidad de aplicación
separados. Primero revisá el dry-run predeterminado; `--apply` persiste una
intención firmada antes de quitar bytes. El descriptor y la fecha original
determinan vencimiento. La intención ancla dev/ino/ctime de ambos archivos;
una sustitución idéntica también se rechaza. El estado deleting/retired permite reanudar después de una
interrupción sin podar el registro de supresión ni borrar metadata.

```sh
pnpm exec node scripts/inf03-transfer.mjs retire --mode local-simulated --objects /ruta/privada/objetos
pnpm exec node scripts/inf03-transfer.mjs retire --mode local-simulated --objects /ruta/privada/objetos --apply
```

Los locks son exclusivos y sobreviven un crash para exigir revisión manual.
Estados parciales, links, symlinks, propiedad/permisos incorrectos y rutas
ambiguas bloquean la operación. El CLI sólo emite JSON acotado tras cerrar
locks; nunca imprime secretos. Sólo admite `--mode local-simulated`, rechaza
URLs, modos remotos, opciones desconocidas y flags de reloj.

Estos roles/capacidades son guards de aplicación para la simulación. No
representan permisos efectivos de B2, del sistema operativo ni un destino
fuera del host. `BackupInventory.open()` y su auditoría siguen requiriendo los
originales actuales; este adaptador no permite recuperar si se pierde el host
ni demuestra que el inventario conozca todas las ubicaciones posibles.


Máximo 1000 objetos simulados; cada lectura es acotada. Parent/destino y el
repositorio de objetos se revalidan por cadena privada e identidad, también
antes del retiro y al finalizar descarga. El CLI rechaza flags duplicados o
irrelevantes para el subcomando y claves de transferencia/inventario iguales.
Un error durante copia conserva cuarentena o objeto parcial para intervención
con ownership acreditado; no se publica éxito ni se asume elegibilidad.
Retiro completado siguiente devuelve cero entradas; no reabre copias retiradas.
No se ensayan pérdida eléctrica/SIGKILL ni ataques de un proceso con todos los
mismos secretos/permisos del custodio. No garantiza frescura externa o recuperación
tras perder originales/custodia; el inventario actual mantiene su auditoría.

La retirada de este comando cubre los objetos del destino simulado; no rastrea
ni borra las cuarentenas descargadas. El consumidor debe limpiarlas tras verificar
su uso, con ownership comprobado y dentro del plazo original. El ensayo de root
hace esa limpieza explícita. No confundir esta cobertura con inventario de todas
las copias operativas ni con retirada/frescura remota implementadas.
