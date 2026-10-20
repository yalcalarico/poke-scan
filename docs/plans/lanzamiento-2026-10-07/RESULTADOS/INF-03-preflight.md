# INF-03 — Preflight de backup externo y restauración

Fecha: 2026-10-07 · Responsable: GPT-6 Luna · Revisión: GPT-6.1 Sol HIGH · Estado: **preflight corregido y aceptado para futura reserva; INF-03 sigue pendiente**. Ver [INF-03-review](INF-03-review.md).

Este preflight inspeccionó documentación, scripts, schema y SQL de migraciones. No ejecutó Docker, PostgreSQL, Redis, pruebas, procesos de aplicación ni transferencias; no leyó filas de usuarios ni secretos. La evidencia local confirma que hay caminos de dump/restore para tests, pero no un backup operativo cifrado ni destino externo configurado. No se atribuyen RPO/RTO medidos.

## Entradas y límite humano pendiente

INF-01 deja resuelta la preparación técnica, pero el host de producción/destino externo sigue sin elección. Para activar una copia off-host hace falta elegir proveedor/servicio y cuenta o bucket, credenciales y política de retención/costo. **Pregunta humana única pendiente, guardada para activar la fase remota:** ¿qué destino fuera del host autorizás, con qué retención y presupuesto? No se envía ahora: no hace falta para diseñar ni ensayar localmente con fixtures. No comprar, contratar, abrir cuentas ni subir datos a remoto en esta fase.

La simulación local podrá demostrar formato, integridad criptográfica y restore aislado; no demostrará off-host, retención remota, recuperación ante pérdida del host, RPO ≤24 h ni RTO ≤4 h. Esos dos últimos valores son objetivos iniciales de INF-03 y sólo se convertirán en resultados después de mediciones con entorno y reloj registrados.

## Inventario estático

- `backend/scripts/setup-test-db.ts` usa `pg_dump` en formato SQL plano con `--clean --if-exists` y `psql` para copiar desarrollo a tests. El código exige Docker y usa `docker exec`; detectar un cliente local no cambia ese camino. Por defecto apunta al contenedor de desarrollo `pokemon-scanner-db`. Es una herramienta destructiva para el destino y **no es un backup operativo seguro**: exige nombre con `test` y distinto de dev, pero eso no acredita aislamiento/propiedad; imprime nombres y conteos; el dump temporal no se cifra ni se elimina al terminar. No reutilizar ese flujo como restore de INF-03.
- `pnpm run db:reset`, `infra:reset`, `test:db:setup`, `seed` y `sync` son comandos de operación/desarrollo existentes, no un runbook de recuperación. `docker-compose.yml` conserva `pgdata` local; el volumen no es copia independiente.
- Scripts de índice visual contienen sus propios manifiestos/respaldos de fixtures, pero son artefactos regenerables del scanner, no backup de PostgreSQL.
- Disponibilidad observada por `command -v` sin ejecutar herramientas: sólo `/usr/bin/openssl` estuvo presente entre `pg_dump`, `pg_restore`, `psql`, `openssl`, `age`, `gpg`, `rclone`, `restic` y `borg`. No se probó versión, cifrado, llaves, cliente pg, ni destino remoto. Esto es evidencia de inventario de esta máquina, no una dependencia que deba darse por presente en el host futuro.

## Qué debe recuperarse

La fuente de verdad del schema es `backend/prisma/schema.prisma`, más todas las migraciones en orden. El SQL registra una extensión e índices que Prisma no modela, y hay extensiones/objetos de trigram posteriores:

| Migración SQL | Parte relevante para el restore |
|---|---|
| `20260925180500_init_users_and_catalog` | tablas base, claves, índices y relaciones |
| `20260925180600_add_pg_trgm` | `CREATE EXTENSION pg_trgm`; índices GIN sobre `cards.name` y `card_sets.name` |
| `20260926010423_add_friendships` | `friendships` y GIN trigram de `users.username` / `users."displayName"` |
| `20260927120000_add_tcgdex_set_id` | mapeo de fuente de precios |
| `20260928160000_add_cards_artist_trgm` | GIN trigram sobre `cards.artist` |
| `20260929103000_add_card_sets_ptcgo_code` | código impreso de set |
| `20260930180000_add_provider_identity_and_price_provenance` | identidad/procedencia de precios |
| `20260930204819_persistent_job_queue` | cola persistente; su SQL advierte preservar los índices trigram desconocidos por Prisma |
| `20260930210000_job_queue_explicit_utc` | fechas explícitas UTC para jobs |
| `20261005170000_portfolio_snapshots` | snapshots de portfolio |
| `20261007090000_collection_item_add_idempotency` | identificador/operación idempotente de alta |

La lista se debe regenerar desde el filesystem en la implementación, no hardcodear como exhaustiva. Una restauración de dump completo debe conservar `pg_extension` con `pg_trgm`, operadores y los cinco GIN trigram actuales, constraints, índices, secuencias y `_prisma_migrations`. No ejecutar `prisma migrate dev` en un restore para “arreglar” schema: puede eliminar objetos GIN desconocidos. La restauración lógica debe validar los índices directamente en catálogo SQL.

El backup operativo completo debe incluir catálogo y precios replicados, usuarios/sesiones, amistades, colecciones/items, cantidades, operaciones idempotentes y links compartidos, además de jobs/snapshots necesarios al punto de recuperación. Por diseño ese dump contiene PII, `passwordHash` y hashes de sesiones: **debe cifrarse** y custodiarse como dato privado. Excluir PII del manifiesto no vuelve anónimo el dump. En el ensayo, usar fixtures sintéticas con UUID/slug deterministas. Comparar por conjuntos ownership `userId → collections/share_links`, `collectionId → collection_items/share_links` y amistades; verificar `quantity`, variante/condición, UUID de item/colección, operación `key`/`resultItemId` y link público (`slug`, `collectionId` nullable que define alcance, `isActive`, `expiresAt`). No imprimir valores personales ni fixtures de producción.

## Manifiesto recuperable

Cada backup debe contener `manifest.json` y `database.dump` dentro de un archivo estándar cifrado `backup.tar.age`. El manifiesto se valida por schema y queda cubierto por el mismo cifrado autenticado; no hace falta un framework de firmas separado para el ensayo propio. Campos mínimos propuestos:

```json
{
  "manifestVersion": 1,
  "backupId": "UUID",
  "createdAt": "RFC3339 UTC",
  "source": {"project": "pokemon-cards-scanner-app", "environment": "declarado", "postgresMajor": 16},
  "format": {"kind": "pg_dump-custom", "compression": "pg_dump"},
  "database": {"logicalName": "redactado-o-alias", "schemaFingerprint": "sha256"},
  "migrations": ["ids ordenados"],
  "extensions": [{"name": "pg_trgm", "version": "version observada"}],
  "artifacts": {"model": null, "index": null, "policy": "regenerables o versionados aparte"},
  "payload": {"file": "database.dump", "bytes": 0, "sha256": "digest del dump antes de cifrar"},
  "encryption": {"format": "age", "recipientKeyIds": ["fingerprint sin secreto"]},
  "privacy": {"photos": false, "scannerQueryImages": false, "manifestContainsPii": false, "dumpContainsPrivateData": true}
}
```

Un recibo exterior puede registrar backupId, tamaño y SHA-256 del ciphertext para transferencia/inventario. Ese checksum no autentica por sí solo; no debe circular dentro del manifiesto cifrado, lo que produciría autorreferencia. El manifiesto interior vincula el dump por tamaño/digest. Recibo y manifiesto no contienen DSN, usuario, host interno, passwords, hashes de credenciales, tokens ni claves privadas. Usar alias estable de entorno; no anexar filas ni dump parcial de usuarios. La política para modelo/índice DINOv2 se decide según costo: normalmente versión externa inmutable, identificada por `artifactId` y digests compatibles con INF-02; si se copia, hacerlo como artefacto versionado aparte, sólo modelo/metadata/JSONL necesarios y checksums. Excluir fotos de consulta, imágenes `.image` del catálogo innecesarias para runtime, cachés, embeddings de consultas y material de investigación. La allowlist del paquete prueba qué archivos se respaldan, no anonimato del contenido de la DB.

Credenciales de cifrado/recuperación son independientes de secretos de aplicación y no se guardan en Git, `.env`, imagen, manifiesto o junto al backup. Para `age`, separar destinatario público de cifrado (puede estar en config no secreta) de identidad privada de recuperación, custodiada en gestor de secretos/offline y probada por recuperación autorizada. Definir más de una copia segura de la identidad y procedimiento de acceso sin imprimirla. Secretos app necesarios para reanudar auth se inyectan luego desde el gestor de secretos del entorno, aparte del dump; rotar si no se pueden recuperar con seguridad. La configuración secreta de aplicación no se agrega al paquete; hashes y datos privados que ya viven en la DB sí quedan dentro del payload cifrado.

## Formatos y cifrado candidatos

| Opción | Ventaja | Riesgo/uso recomendado |
|---|---|---|
| `pg_dump -Fc` (custom) + `pg_restore` | Compresión integrada, objetos seleccionables, portabilidad lógica entre minor versions y buen control de restore. Preserva datos, schema, ACL salvo opciones; extensiones requieren que el servidor tenga archivos de extensión. | Recomendado para primera implementación. Preferir dump consistente; ejecutar `pg_restore --exit-on-error` y evitar restaurar owners/ACL del origen en sandbox. Registrar versión de cliente/servidor. |
| `pg_dump -Fd` (directory) | Paralelismo de dump/restore y formato custom por tabla. | Más archivos y manifiesto/transferencia atómica complejos; reservar para volumen medido que requiera throughput. |
| SQL plano + `psql` | Inspeccionable y ya usado en `setup-test-db.ts`. | Menos control de objetos, manejo de errores/cortes más delicado, compresión/cifrado externos; el script actual imprime e interactúa de forma inapropiada para operación. No recomendado para nuevos scripts. |
| Snapshot/copia de volumen Docker | Rápida en el mismo host. | No es off-host ni suficientemente portable/consistente como único backup; puede depender de versión y estado del servidor. No usar como criterio de aceptación.

Se propone **age estándar** para la implementación local; fijar después versión/binario y procedencia, sin instalar ni ejecutar cifrado en este preflight. `openssl enc` no sirve como alternativa AEAD: su documentación declara que no admite CCM/GCM y explica el problema de liberar output antes de validar autenticación. La propuesta anterior de exigir AEAD a ese comando era imposible. [OpenSSL enc, Supported ciphers](https://docs.openssl.org/master/man1/openssl-enc/), consultado el 7/10/2026.

Age autentica chunks y distingue el chunk final; un stream puede producir chunks válidos y recién fallar al final por corrupción/truncamiento. Por eso **no canalizar descifrado directamente a pg_restore** si el criterio es fallar antes de SQL de restauración. Es una consecuencia del formato, no un defecto observado en una herramienta aquí. [Especificación age, Payload](https://age-encryption.org/v1), consultada el 7/10/2026.

El flujo propuesto usa un directorio efímero 0700 y archivos 0600. Al crear el backup, producir dump consistente, digest y manifiesto interior, empaquetar con tar estándar y cifrar; esperar salida exitosa, sincronizar y publicar el ciphertext por rename atómico, y el recibo al final. Los temporales plaintext se limitan a esa fase y se borran en `finally`. Al restaurar, verificar tamaño/digest exterior esperado desde inventario propio, descifrar **todo** a buffer limitado o temporal protegido y esperar exit exitoso/EOF autenticado. Sólo entonces validar entradas del tar (dos archivos regulares exactos, sin paths absolutos, traversal, links o duplicados), extraer en ese directorio, validar manifiesto/compatibilidad y tamaño/SHA-256 del dump. No invocar pg_restore conectado hasta completar todo esto. Borrar temporales al éxito/fallo; no prometer borrado físico seguro en SSD.

Autenticación criptográfica y checksum no prueban autoría ni hacen seguro SQL de una fuente desconocida. El ensayo sólo restaura su propio dump sintético y conserva backupId/digest esperado bajo control del run; no implementa firmas ni restaura archivos ajenos. PostgreSQL advierte que un dump puede ejecutar código elegido por el origen. Usar rol restringido, origen confiable y `pg_restore --no-owner --no-acl --exit-on-error`; para el ensayo serial preferir `--single-transaction` para rollback ante error SQL. Esa transacción no reemplaza la autenticación previa. [pg_restore 16](https://www.postgresql.org/docs/16/app-pgrestore.html), consultado el 7/10/2026. Cifrado/transferencia/retención remotos siguen sin proveedor validado.

## Guardas y separación inequívoca

El restore de ensayo sólo apunta a PostgreSQL 16 recién creado y descartable. El futuro script recibe un target explícito del run (`--target-kind disposable-test`, `--confirm-target <run-id>` o equivalente), y verifica identidad real del contenedor, label Compose del proyecto propio, labels del run, red y volumen efímeros propios. Confirmar también desde la conexión la DB/rol esperados, ausencia de tablas de aplicación y marcador aleatorio de bootstrap ligado al run (por ejemplo, comentario de DB). No alcanza un argumento del caller, un nombre con `test` ni una firma de etiquetas. El marcador evita errores de selección dentro del ensayo; no es un sistema de autorización nuevo.

No aceptar `DATABASE_URL` ni `DATABASE_URL_TEST` compartidas, cargar `.env` automáticamente ni montar `pgdata`. Sin puertos publicados, contenedor/red/volumen son distintos de desarrollo y del origen de ensayo; **ambos pueden usar 5432 interno y schema public** sin conflicto. El número de puerto o namespace SQL por sí solo no prueba identidad ni separación. Rechazar recursos sin propiedad comprobable, redes/volúmenes compartidos, DB con tablas de aplicación previas, rol inesperado o marcador ausente. Mantener 55432/6379/3000/3001 del entorno compartido. El rol de restore sólo tiene privilegios sobre su DB/schema, sin superuser, creación de DB ni acceso a dev. Disponibilidad/permisos de pg_trgm se resuelven en bootstrap controlado. No usar `--clean`, `--create` ni `DROP DATABASE` en el script de restore: eliminación de recursos descartables va en cleanup validando project/labels.

Credenciales por env explícita o archivo 0600/`.pgpass` temporal; evitar DSN en argv/logs/errores, tracing y config expandida. Sanear errores y no imprimir claves, hashes de credenciales o filas de usuario. Verificar rutas y archivos contra symlinks/traversal. Las consultas read-only de identidad son admisibles; un backup corrupto, truncado o incompatible debe fallar **antes de SQL de restauración**, después de autenticación completa y verificaciones descritas arriba.

## Ensayo viable en local

Diseño de la prueba posterior, no ejecutado aquí:

1. Preparar directorio temporal nuevo, red Docker interna sin salida y Postgres 16 de prueba con project/labels `inf03-<run-id>`, sin publicar puertos ni montar `pgdata`. Crear rol/DB del run y marcador de bootstrap; comprobar identidad/project/red/volumen/conexión antes de acciones.
2. Aplicar las migraciones Prisma presentes a **ese origen vacío**. Confirmar huella de schema, `_prisma_migrations`, `pg_extension` y cinco índices GIN trigram. No usar `prisma migrate dev` ni copiar la DB de desarrollo/tests.
3. Insertar sólo fixtures sintéticas: dos usuarios con UUID fijos para amistad, una colección, dos items con UUID estables y cantidades distintas, operación idempotente referida a uno, set/carta mínimos y share link con slug de fixture y alcance explícito por `collectionId`. Conservar conjunto esperado de relaciones, IDs, cantidades y tiempos de commits, sin PII real ni seed externo.
4. Producir dump custom comprimido, manifiesto interior y paquete age con destinatario/identidad efímeros de prueba, recibo/digests esperados y cleanup de temporales. Confirmar artefacto antes de eliminar sólo los recursos propios del origen. Crear destino Postgres 16 vacío con contenedor/red/volumen distintos del origen/dev; puede conservar 5432 interno y schema public. Registrar identidad independiente, no exigir diferencia de puerto no publicado.
5. Validar target, descifrar **completo** con autenticación exitosa y verificar manifiesto, digest y compatibilidad antes de pg_restore. Restaurar con rol limitado y opciones indicadas; verificar conjuntos UUID/slug/cantidades/ownership, constraints, migraciones, `pg_trgm`, definición/validez GIN (`indisvalid`). Comparar sólo fixtures; no leer filas reales para buscar PII. La allowlist externa excluye fotos/archivos extra, no datos legítimos del dump.
6. Repetir con ciphertext alterado/truncado (incluido el último chunk), clave equivocada, dump con digest interior incorrecto y manifiesto incompatible; exigir rechazo antes de invocar restore conectado. Repetir con marcador/labels target incorrectos y nombres que incluyen `test` sin ownership, sin mutación. Comprobar que rol/red destino no accedan al origen compartido.
7. Registrar duración del backup (inicio → ciphertext publicado/verificado) separada del punto recuperado. Para pérdida simulada en `t_incidente`, identificar el último commit sintético incluido y recuperable `t_recuperado`: brecha observada = `t_incidente − t_recuperado`, con secuencia de commits incluidos/excluidos. La duración del dump no es RPO. Medir recuperación local desde el inicio declarado del incidente/ensayo hasta aprovisionamiento, descifrado, restore y checks completos; reportar etapas omitidas y no llamarlo RTO operativo. Registrar tamaños/versiones/tiempos/entorno, sin extrapolar a pérdida del host u off-host.
8. Eliminar sólo recursos con project/labels y marcador del run verificados. Preservar evidencia sanitizada de digest, UUID de fixtures, integridad y duración; borrar clave de prueba y cualquier plaintext temporal.

En la aceptación final, la copia debe programarse al menos diariamente si se pretende aspirar a RPO ≤24 h, con alerta observable de fallo/antigüedad. La política remota debe incluir retención definida por persona responsable, verificación periódica de lectura/descifrado, alerta si edad supera 24 h, y test de restore periódico. Para RTO ≤4 h hay que incluir en la medición aprovisionamiento/credenciales, transferencia, descifrado, restore, checks y disponibilidad de modelo/índice/secretos; medir sólo el comando `pg_restore` es insuficiente.

## Reservas de implementación y criterios de entrega

Este preflight no reserva implementación de INF-02 ni INF-03. Coordinación todavía no inició/reservó código de INF-02; su packaging está preparado para una próxima fase serial. **Candidatos** para una futura reserva INF-03: `scripts/inf03-backup.mjs`, `scripts/inf03-restore.mjs`, runbook y `RESULTADOS/INF-03-implementacion.md`; la ubicación final la confirma coordinación. No editar Dockerfiles/ignores, Compose o `scripts/infra/` bajo esa propuesta sin reserva concreta. Serializar ensayos de infra/DB con el coordinador; no ejecutar mientras otro escritor usa los entornos. Registro/planes tienen único escritor de coordinación.

La implementación local se considera revisable cuando deja runbook, herramientas/versiones fijadas, manifiesto/paquete autenticado, backup cifrado con checksums, scripts con guardas, restore en Postgres 16 vacío/aislado, validación de schema/trigram/constraints/ownership/enlaces/cantidades/UUIDs, negativos que fallan antes de restore, cleanup y logs sanitizados. Medir duración/etapas y punto recuperado del ensayo, separados de objetivos RPO/RTO. Después requiere revisión Sol HIGH y gate integrado del lote. Off-host sólo se valida con destino humano elegido/autorizado; copia/retención/alertas remotas y RPO/RTO reales siguen pendientes. Este preflight aceptado habilita reservar preparación/implementación local; no cierra INF-03.
