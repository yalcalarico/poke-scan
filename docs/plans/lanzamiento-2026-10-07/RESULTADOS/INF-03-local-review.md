# INF-03 — revisión local final Sol HIGH

Fecha: 2026-10-08 · Revisor/corrector: GPT-6.1 Sol HIGH.
Estado: **fase LOCAL corregida, ejecutada y aceptada**. INF-03 permanece abierto:
gate integrado del lote y operación/off-host pendientes. No se ejecutó check
global ni se acredita recuperación ante pérdida del host, RPO ≤24 h o RTO ≤4 h.
Se libera la reserva de writer/DB/Docker/suites; coordinación conserva el único
permiso de escritura de registro/planes.

## Resultado que habilita el gate integrado

[Run corregido](INF-03-evidencia.json) **`inf03-beb6f1226ff2`**, de 12:29:08.977
UTC a 12:29:31.661 UTC antes de finalizar cleanup. Se descargó age oficial,
se aplicaron las 11 migraciones existentes en un origen sintético propio y se
respaldó un dump custom cifrado. Se destruyó únicamente el origen propio después
de confirmar ciphertext/recibo y se restauró en un segundo PostgreSQL vacío,
con contenedor, volumen, red interna y rol independientes. No se publicaron
puertos ni se consultaron filas dev/test, Redis, precios, fotos o APIs de datos.

- **1 recorrido positivo** y **16 negativos de prevalidación**, cada uno exige el motivo de rechazo correspondiente sobre target vacío (el caso ocupado usa su tabla guard propia).
- **0 invocaciones de pg_restore durante esos 16 negativos**. El total del contador es **2**: un fallo SQL controlado con dump propio truncado y un restore positivo. No confundir el fallo SQL deliberado con rechazo antes de SQL.
- Age directo produjo **327680 B de output parcial** y exit **1** tanto al alterar el byte final como al truncar 8 bytes finales. El helper recibió recibos recalculados, alcanzó age, esperó EOF y rechazó ambos sin invocar pg_restore. El paquete de **347416 B** contiene cinco chunks completos autenticados antes del final; no es la prueba de un único chunk del ensayo anterior.
- **11 migraciones con checksums**, pg_trgm **1.6**, **5 GIN** con método/opclass/indisvalid/indisready verificados y **33 constraints p/u/f validadas en public**, además de ownership del rol limitado.
- Comparación por digest del JSON completo de fixtures de users, friendships, collections, items, operaciones idempotentes, share links y registro de migraciones: UUID, propietarios/relaciones, cantidades 2/3, variantes normal/holofoil, condiciones NM/LP, alcance de colección, actividad y expiry del link, referencias y timestamps se conservaron. No se publicaron filas/credenciales.
- Commit posterior que cambió el nombre de colección, observado confirmado antes de destruir el origen, **no entró en el backup**. El destino mantuvo el nombre incluido originalmente.
- Colisión de backup rechazada sin sobrescritura. Staging interno vacío tras backup, fallo SQL y restore positivo. Cleanup completo y snapshots compartidos idénticos.

Los 16 motivos registrados son: alteración final, truncamiento final, identidad
errónea, hash exterior incorrecto, argumento marker incorrecto, digest interior
erróneo, versión incompatible, campo extra de manifiesto, checksum de migración
erróneo, entrada tar extra, symlink tar, target ocupado, comentario real de DB
incorrecto, rol CREATEDB, múltiples redes y nombre de contenedor compartido.
Son 16 escenarios, no una suma de sus assertions ni de los 22 checks offline.

El dump custom truncado, con manifiesto/digest propios actualizados y age válido,
llegó a pg_restore y falló; la base volvió a estar vacía y la restauración positiva
posterior funcionó en esa misma DB. Se usó `--single-transaction --exit-on-error`.
No se instrumentó qué DDL intermedio se llegó a ejecutar antes de ese error;
la evidencia concreta es proceso fallido, destino vacío y reuso positivo.

## Correcciones revisadas

La entrega histórica `inf03-370200abbf0c` informaba diez negativos ejecutados
**después** del restore, sobre target ocupado; además alteración/truncamiento
conservaban el recibo original. Esos diez negativos **no se aceptaron** como
prueba de age/tar/manifiesto. Se preservan [JSON Luna](INF-03-Luna-historico.json)
y [reporte histórico](INF-03-Luna-implementacion-historica.md). La revisión
[parcial anterior](INF-03-local-review-parcial.md) conserva hallazgos, bloqueo y
resultados offline, sin convertirlos en una nueva corrida.

Las correcciones en `scripts/inf03-common.mjs`, backup, restore y smoke incluyen:

- Pgpass escapa `\` antes de `:`; rechaza CR/LF/NUL. Contraseñas con ambos caracteres se probaron contra PostgreSQL real. No se publica stderr crudo.
- Staging host 0700/archivos 0600, paths/parents sin symlinks y staging de contenedor con UUID propio. Cleanup en `finally`, verificando identidad y registrando fallos; no borrar nombres fijos ajenos.
- Descifrado age completo con límite duro de output 128 MiB/deadline 120 s antes de tar/SQL, sin streaming a pg_restore. Tar entero validado antes de escritura exclusiva: dos archivos regulares exactos, sin links, extras, duplicados, paths ajenos, headers/tamaños/EOF inválidos; extracción 0600 aunque el paquete declare 0644.
- Pin PostgreSQL **por digest real**, comprobación del image ID runtime, labels/proyecto, único mount propio, volumen/red realmente exclusivos e internos sin ports, major cliente/servidor, DB owner y marker ligado al run.
- Rol login sin superuser/createdb/createrole/replication/bypassrls, sin membresías ni herencia; target sin objetos. Revalidación inmediatamente antes de SQL. Sin clean/create/migrate dev.
- Schema estricto de manifiesto/recibo, alias sin PII/config/secretos/fotos, nombres y checksums de migraciones, digest interno sin autorreferencia. Huella de columnas con tipos/default/nullability, constraints y definiciones de índices **de public**; no representa todos los objetos PostgreSQL.
- Publicación exclusiva sin sobrescritura, recibo al final, output y archivos acotados, procesos con deadlines. No se promete durabilidad ante corte eléctrico ni borrado físico de SSD.
- Readiness de bootstrap por TCP: se espera el servidor final, no el temporal de inicialización.

Cifrado/hash no acreditan autoría ni vuelven seguro SQL desconocido. Los helpers
son herramientas de ensayo sintético local propio: no se aceptan DSN, no se carga
.env y no se presentan como runbook operativo listo para backups ajenos.

## Versiones, procedencia, tamaños y tiempos

Node **v22.20.0**, pnpm **10.17.1**, macOS **ARM64**; no se instalaron paquetes
ni se actualizaron versions/locks. Age runtime **v1.2.1** desde el
[release oficial](https://github.com/FiloSottile/age/releases/tag/v1.2.1).
[Metadata consultada](INF-03-age-proveniencia.json): tag v1.2.1 publicado
2024-12-18, asset darwin-arm64 de **4758557 B**, URL de descarga oficial igual
a la usada en el runner. El API devuelve **digest null**: hashes observados por
HTTPS, sin atribuir firma/attestation verificada del publicador.

| Artefacto | SHA-256 observado |
|---|---|
| Archive age | `cf79875bd5970dc2dac60c87fa50cee1ff1f9a41b0eb273f65e174aff37c367a` |
| Binario age | `d2b0d4211fd9e364ea8dd1cb150653a7f21dfc08e96632de444aa209db5fc0d0` |
| Dump custom, 342279 B | `2f8c9d4aadc28bd5c84d5ce174ce66d0479a25f18610631895a02a001563d8e3` |
| Ciphertext, 347416 B | `e58d3208cafa2be89d09d69552bc4f3c159fd041031e52c675aab8d8fa025907` |
| Recibo | `ed23b61435ddd6c1347b19db941044a1c745281a00c25f9111c70c48b72c4318` |
| Huella schema public | `c352ac6ab770d71d5343454bc7f9d5fc55562e53d533bc8194bdbf160c264d37` |

Servidor y clientes pg_dump/pg_restore **16.15 (Debian 16.15-1.pgdg12+2)**.
Imagen cacheada reutilizada, sin nuevo pull:
`postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4`.
Runtime ID:
`sha256:4b5d4fd438e2c1ce13106e4996fc604f0a1cff39cde48b546fcac3cf1a233c3a`.

| Medición | ms | Alcance |
|---|---:|---|
| Aplicar migraciones en fuente lista | 1563 | No incluye aprovisionamiento PG |
| Helper backup completo | 1102 | Wrapper, dump/age/publicación y cleanup |
| Helper restore positivo completo | 1932 | Validaciones, descifrado, restore y cleanup |
| Inicio runner → retorno restore positivo | 22208 | Incluye descarga/aprovisionamiento y negativos; después siguieron assertions/cleanup |
| Incidente → últimas verificaciones de fixtures/versiones | 13722 | Incluye negativos; no es RTO operativo |

Fixture SQL observada confirmada **12:29:16.082 UTC**; timestamp de fila
12:29:16.009000 no tratado como hora exacta de commit. Modificación posterior
observada confirmada **12:29:17.399 UTC**, ausente en restore; incidente simulado
**12:29:17.867 UTC**. Brecha local observada **1785 ms** entre incidente y
confirmación observada de la fixture incluida. El padding de catálogo se actualizó
antes del dump; no se afirma que el timestamp de la fixture sea el último commit
exacto de toda la DB. Ninguna duración o brecha acredita frecuencia/RPO operacional.

## Checks previos, autorización y cleanup final

Se preservan **22 checks offline** del run `inf03-199c552cc3b5`, más el intento
parcial `inf03-64ff4551dd20` que falló en bootstrap (sus once checks se solapan).
[Offline final](INF-03-offline-evidencia.json) y [intentos 1](INF-03-offline-intento-1.json)/[2](INF-03-offline-intento-2.json)
conservan la falsa alarma de cleanup de shadow ya eliminado y la confirmación
posterior independiente. No se suman como 33 checks ni se fabricó un tercer run.

Auto-review rechazó inicialmente consultar GitHub por la regla «no contactar
terceros»; no se eludió. El usuario autorizó después explícitamente **«Bueno dale
descárgalo y continua»**. Se retomó metadata/descarga oficiales dentro de ese
scope; autorización y hashes quedaron registrados. No hay bloqueo actual de age
ni nueva pregunta de permiso pendiente para este ensayo.

Se ejecutó `pnpm run stop` antes del nuevo recorrido. `node --check` pasó para los
cinco scripts y se verificaron whitespace/newline de los archivos reservados.
No se ejecutaron global ni consumer API/web: corresponden a la siguiente reserva
integrada del lote, no a repetir checks por tarea.

[Cleanup final](INF-03-cleanup-review.json), **12:32:18.539 UTC**: cero contenedores,
redes o volúmenes propios de los cuatro runs revisados, cero tmpdirs propios,
metadata scratch retirado y ningún dump, ciphertext, tar, pgpass, counter o
identidad temporal residual. Staging interno vacío comprobado antes de retirar
los contenedores del run. Shared IDs saludables e idénticos antes/después:
`pokemon-scanner-db 18aa2f693752`, `pokemon-scanner-redis f2d2ca0ad580`.
Puede quedar cacheada la imagen PostgreSQL; no se retiró cache ajena. El binario
y las identidades age fueron efímeros y no se instalaron ni guardaron en Git.

## Handoff y pendientes

Para repetir, con la imagen pinned ya cacheada y acceso autorizado a GitHub:

```sh
pnpm run stop
pnpm exec node scripts/inf03-smoke.mjs --download-tools
```

El runner no descarga por defecto. Sin red, se puede usar `--tools-dir` con
binarios oficiales locales verificados. Los checks offline siguen reproducibles
con `pnpm exec node scripts/inf03-review-offline.mjs`. Preservar runId previo si
se repite; ver [runbook](../../../../infra/inf03/README.md).

La fixture actual conserva una operación idempotente con key/hash sintéticos,
que no son UUID/payload válidos para un replay por DTO HTTP. Se comprobó su
recuperación por conjunto y referencia, **no replay API**. El gate integrado
siguiente ajustará esa entrada con UUID/hash canónico y verificará consumidor
API/web sobre DB restaurada, sin modificar esta fase ni claim de login real
(con passwordHash sintético). No se creó un fixturefile huérfano ni se ejecutó
ese flujo en esta reserva.

La aceptación local habilita esa revisión integrada Sol HIGH, `pnpm run stop`,
check global y flujo real aislado acordados; no cierra el lote antes de que pasen.
Off-host, retención, calendario, alertas, claves duraderas, transferencia/restore
remoto y recuperación ante pérdida del host permanecen pendientes. La pregunta
humana única de destino/retención/presupuesto sigue registrada sin repetirla.

Fuentes primarias consultadas: [formato age y chunks finales](https://age-encryption.org/v1),
[metadata release age v1.2.1](https://api.github.com/repos/FiloSottile/age/releases/tags/v1.2.1),
[escape de pgpass](https://www.postgresql.org/docs/16/libpq-pgpass.html),
[pg_restore y single-transaction](https://www.postgresql.org/docs/16/app-pgrestore.html).
