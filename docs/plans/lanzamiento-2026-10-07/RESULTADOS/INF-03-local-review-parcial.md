# INF-03 — revisión local parcial Sol HIGH

Fecha: 2026-10-08 · Revisor/corrector: GPT-6.1 Sol HIGH.
Estado: **correcciones entregadas y checks offline verificados; nuevo ensayo age pendiente**.
INF-03 no está cerrado, su fase local todavía no está aceptada y el gate de
operación/off-host permanece pendiente. Se liberan writer, Docker, DB y suites
al coordinador, que conserva el único permiso de escritura de planes/registro.

## Hallazgos que impidieron aceptar el ensayo original

El run Luna `inf03-370200abbf0c` informó un positivo y 10 negativos. La inspección
del runner confirmó que **todos los negativos se ejecutaban después del positivo**,
cuando el target ya estaba ocupado: se rechazaban antes de age, tar, manifiesto
y digest interno. Alteración/truncamiento además conservaban el recibo original,
por lo que tampoco aislaban autenticación criptográfica. Esos 10 resultados no
se aceptan como evidencia de las capas anunciadas. Se preservan el JSON original
y [su copia histórica](INF-03-Luna-historico.json); no se convierten en resultados
del código corregido. El reporte de implementación quedó marcado explícitamente
como histórico, con esta limitación.

Otras correcciones concretas:

- Escape de pgpass: backslash antes de colon; rechazar CR/LF/NUL. Stderr de procesos sanitizado.
- Staging con UUID dentro de cada contenedor: permisos 0700/0600 y cleanup en `finally`, validando identidad, tras éxito/fallo. Se retiraron los nombres fijos `/tmp/inf03.dump` y `/tmp/inf03.pgpass`.
- Paths/parents sin symlinks; límites de archivo y output durante streaming. Age completo termina antes de tar/SQL, con límite 128 MiB y deadline 120 s; ningún descifrado se canaliza a pg_restore.
- Tar USTAR se valida completo antes de escribir: dos archivos regulares exactos, sin extras, duplicados, links, rutas ajenas, headers/tamaños/EOF inválidos. Escritura exclusiva 0600 incluso si el archivo declara 0644.
- Imagen PostgreSQL realmente fijada por digest, comprobación del runtime image ID, labels/proyecto, DB owner/marcador, rol limitado sin membresías/herencia, major de cliente/servidor y exclusividad real de volumen/red. Revalidación inmediatamente antes de restaurar.
- Schema estricto de manifiesto/recibo, migraciones con checksums de archivos vigentes; huella de columnas (tipos/default/nullability), constraints y definiciones de índices **de public**. Esta huella no representa todos los objetos PostgreSQL.
- `pg_restore --single-transaction --exit-on-error --no-owner --no-acl --no-password`, sin clean/create/migrate dev. Verificación posterior de ownership, pg_trgm y GIN válidos. Constraints contadas sólo en public.
- Publicación exclusiva sin sobrescritura y recibo al final; cleanup registra fallos y conserva contexto si no puede confirmarlo. No se promete durabilidad ante pérdida eléctrica ni borrado físico en SSD.
- El runner espera PostgreSQL por TCP: la disponibilidad del servidor temporal de bootstrap no significa que el servidor final esté listo.

El runner age ahora programa los negativos sobre el target vacío, exige el motivo
correcto de rechazo, recalcula recibos para corrupción, y genera un dump real con
256 KiB de padding sintético aleatorio para superar varios chunks. También
programa comprobación directa de output parcial de age, conjuntos completos de
fixtures, checksums/migraciones, commit posterior excluido, rollback y temporales.
**Estos nuevos casos age y el recorrido integrado no se ejecutaron en esta ronda.**
El contador programado distingue cero invocaciones durante prevalidación,
un intento de fallo SQL controlado y un restore positivo; no se afirma que se
hayan observado esos contadores todavía.

## Pruebas realmente ejecutadas

Se ejecutó `pnpm run stop` antes de las pruebas. Runtime: Node **v22.20.0**,
pnpm **10.17.1**, macOS **ARM64**. No se instalaron dependencias ni se tocaron
packages, locks, app, DTOs, schema, SQL de migraciones o Compose de desarrollo.

Comando reproducible offline, sin red externa:

```sh
pnpm exec node scripts/inf03-review-offline.mjs
```

El primer intento `inf03-64ff4551dd20` duró **4020 ms**, pasó 11 checks parciales
y falló durante bootstrap por disponibilidad transitoria de PostgreSQL; cleanup
completo. Está preservado en [intento 1](INF-03-offline-intento-1.json). Se corrigió
la espera a TCP antes de repetir.

El segundo `inf03-199c552cc3b5` duró **9991 ms** y pasó **22 checks offline**:
CRLF; límite de archivo 128 MiB; symlink de parent; tar que declara 0644 escrito
0600; traversal/absoluto/duplicado/hardlink/tamaño excesivo/truncamiento de tar;
guardas de origen y destino; marcador real incorrecto; rol con CREATEDB; target
ocupado; múltiples redes; **volumen realmente compartido** con otro contenedor;
pg_dump real con contraseña que contiene `:` y `\`; pg_restore de dump custom
truncado rechazado; destino vacío después del fallo; roundtrip de schema y
checksums; limpieza interna tras éxito/fallo. El rechazo del custom truncado y
la base vacía son evidencia observada; no se instrumentó qué DDL intermedio
llegó a ejecutar antes del fallo. No se atribuye al ensayo offline autenticación
age ni recuperación completa de las fixtures de aplicación del runner integrado.

La restauración lógica offline conservó:

- **11 migraciones**, con nombres/checksums comparados contra archivos vigentes.
- pg_trgm **1.6** y schema público con columnas, constraints e índices comparados por digest.
- **33 constraints p/u/f validadas en public**. Las 143 del ensayo anterior incluían catálogo PostgreSQL y no se presentan como constraints de la aplicación.
- Huella pública `c352ac6ab770d71d5343454bc7f9d5fc55562e53d533bc8194bdbf160c264d37`.
- Cliente pg_dump/pg_restore y servidor **16.15 (Debian 16.15-1.pgdg12+2)**.

Imagen cacheada reutilizada, sin pull nuevo:
`postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4`.
Runtime image ID:
`sha256:4b5d4fd438e2c1ce13106e4996fc604f0a1cff39cde48b546fcac3cf1a233c3a`.

El segundo intento marcó cleanup incompleto por una falsa alarma: el contenedor
shadow ya retirado producía mensaje de ausencia con distinta capitalización.
La evidencia original se preservó en [intento 2](INF-03-offline-intento-2.json).
Se corrigió el runner y se realizó **verificación posterior independiente**:
ningún recurso con labels del run, y retiro del directorio privado que se había
conservado. [Evidencia offline final](INF-03-offline-evidencia.json) conserva el
error histórico y un followup explícito; no se fabrica una tercera ejecución.
Los 11 parciales se solapan con los 22: **no se suman como 33 pruebas**.

`node --check` pasó para los cinco scripts INF-03. La guarda del runner sin flags
se ejecutó y rechazó el uso sin herramientas locales/autorización de descarga,
antes de crear recursos. Se verificó whitespace/newline de los archivos
reservados. No se ejecutó pnpm run check global: corresponde al gate integrado
del lote por la regla de orquestación, una vez habilitado.

## Bloqueo de herramientas y cómo retomar

Auto-review rechazó el comando que combinaba `docker ps` con:

```sh
curl --fail --silent --show-error --max-time 30 https://api.github.com/repos/FiloSottile/age/releases/tags/v1.2.1 -o /private/tmp/inf03-release-metadata.json
```

Razón exacta: «Aunque Docker y la escritura temporal son de bajo riesgo, el
comando contacta GitHub, contrariando la instrucción explícita de no contactar
terceros.» La acción no se repitió ni se eludió; el archivo no se creó.
La búsqueda local de nombres en tmpdir, /private/tmp, Downloads, Homebrew,
.local/bin, .cache y caché de plugins no encontró age/age-keygen/archive.
La autorización humana solicitada por coordinación seguía sin respuesta al
liberar esta reserva. No hubo descarga, clave age nueva, transferencia, mensaje
a terceros ni alternativa criptográfica improvisada.

Para retomar, primero resolver esa autorización. Con la imagen ya disponible,
los comandos completos son:

```sh
pnpm run stop
pnpm exec node scripts/inf03-smoke.mjs --download-tools
```

Sólo el flag explícito habilita descargar el release oficial age v1.2.1 a un
directorio temporal privado; no instala globalmente ni hace docker pull.
Alternativa sin red, si aparecen binarios oficiales verificados localmente:

```sh
pnpm exec node scripts/inf03-smoke.mjs --tools-dir /ruta/absoluta/a/binarios-age
```

Revisar el nuevo runId, output parcial observado de age en ambos fallos finales,
rechazos por capa sobre target vacío, contadores, conjunto de fixtures, digests,
permisos y cleanup. Registrar el SHA-256 del binario/archive obtenido como hash
observado del HTTPS oficial; no atribuir verificación de firma de publicador si
no se hace. No sobreescribir el histórico como si fuera esa nueva ejecución.

## Cleanup y límites del resultado

[Verificación final](INF-03-cleanup-review.json), **11:52:19 UTC**: cero recursos
Docker propios, cero directorios temporales propios de los tres runs revisados,
ningún counter/dump/pgpass/identidad de prueba residual. El runner offline confirmó
staging interno vacío antes de retirar sus contenedores. Los compartidos siguen
healthy con IDs idénticos: `pokemon-scanner-db 18aa2f693752` y
`pokemon-scanner-redis f2d2ca0ad580`. Puede quedar cacheada la imagen PostgreSQL;
no es un backup y no se limpió cache ajena. No se leyeron ni mutaron bases dev/test,
Redis, precios, APIs externas, fotos o datos del usuario.

El backup histórico tuvo dump **42672 B** y ciphertext **51400 B** (menos de un
chunk completo de 64 KiB): conserva sólo su evidencia histórica, no prueba el
nuevo caso multichunk. Los **14311 ms** originales incluían preparación; no son
RTO. El timestamp de fila **11:32:20.347000 UTC** no acreditaba hora exacta de
commit; la brecha **717 ms** no es RPO operativo. El nuevo runner diferencia
observación posterior a SQL, modificación excluida y tiempo de ensayo (incluye
negativos), pero esa metodología sigue pendiente de ejecución integrada.

Fuentes primarias consultadas el 8/10: [formato age, payload de chunks de 64 KiB](https://age-encryption.org/v1),
[pgpass y su escape](https://www.postgresql.org/docs/16/libpq-pgpass.html),
[pg_restore y single-transaction](https://www.postgresql.org/docs/16/app-pgrestore.html).
La consulta de metadata del release falló por auto-review; no se presenta como
metadata oficial verificada en esta revisión.

No hay destino externo, retención, calendario, alertas, claves duraderas ni
recuperación remota configurados. La pregunta humana de destino/retención/
presupuesto permanece registrada sin repetirla. No se acredita RPO ≤24 h,
RTO ≤4 h, recuperación ante pérdida del host ni operación productiva. La
aceptación local requiere completar el nuevo ensayo age; después todavía falta
la validación integrada del lote y el gate de operación/off-host.
