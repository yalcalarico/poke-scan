# INF-03 — implementación y ensayo local

Fecha: 2026-10-08 · Run: `inf03-beb6f1226ff2` · Estado: **fase LOCAL revisada/corregida y aceptada Sol HIGH**. INF-03 sigue abierto para off-host y operación; no cierra el gate global.

## Resultado medido

Se creó una base PostgreSQL 16 vacía aplicando 11 migraciones SQL existentes en orden sobre un origen sintético; luego se generó un dump custom, se empaquetó con exactamente `manifest.json` y `database.dump`, y se cifró con age. Confirmado el ciphertext, se destruyó sólo el origen etiquetado y se restauró en una segunda base vacía, con contenedor, red interna, volumen y rol propios. El rol de restore fue login, sin superuser, createdb ni createrole. No se publicaron puertos.

- Herramientas: age v1.2.1 desde [release oficial](https://github.com/FiloSottile/age/releases/download/v1.2.1/age-v1.2.1-darwin-arm64.tar.gz); imagen oficial `postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4`, digest `postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4`.
- Dump: 342279 bytes, SHA-256 `2f8c9d4aadc28bd5c84d5ce174ce66d0479a25f18610631895a02a001563d8e3`; ciphertext: 347416 bytes, SHA-256 `e58d3208cafa2be89d09d69552bc4f3c159fd041031e52c675aab8d8fa025907`; recibo SHA-256 `ed23b61435ddd6c1347b19db941044a1c745281a00c25f9111c70c48b72c4318`. Los artefactos y llaves efímeros se borraron al terminar.
- Tiempos: bootstrap fuente 1563 ms; backup 1102 ms; restore 1932 ms; desde inicio del runner hasta retorno del restore positivo 22208 ms (incluye descarga/aprovisionamiento/negativos; los checks adicionales y cleanup continuaron después). Son mediciones de este ensayo sintético, no un RTO.
- Punto recuperable: commit fixture observado tras SQL 2026-10-08T12:29:16.082Z; timestamp de datos 2026-10-08T12:29:16.009000Z no tratado como hora de commit; incidente simulado 2026-10-08T12:29:17.867Z; brecha observada 1785 ms. Es una brecha local entre timestamps sintéticos y no demuestra frecuencia ni RPO operativo.
- Checks restaurados: 11; 11 filas de migración, extensión pg_trgm y 5 índices GIN válidos; UUIDs de usuarios/amistad/colección/items, cantidades 2 y 3, item de idempotencia y share link activo con alcance collectionId.
- Pruebas: 1 recorrido positivo y 16 negativos; alteración y truncamiento del último chunk age, identidad/recibo incorrectos, marcador target incorrecto, digest de dump errado dentro de ciphertext válido, manifiesto incompatible, archivo extra, symlink, target ocupado. El contador observó 2 invocaciones de pg_restore: rollback controlado y caso positivo.
- Cleanup: completo para los recursos etiquetados del run. Snapshot de contenedores compartidos antes/después idéntico: `pokemon-scanner-db`, `pokemon-scanner-redis`.

## Uso

Desde la raíz, con pnpm 10.17.1, Node 22.20.0 y Docker: `pnpm exec node scripts/inf03-smoke.mjs --download-tools`. El runner descarga age a un directorio privado temporal, valida versión/procedencia, usa la imagen fijada por digest y usa sólo recursos Docker con nombres/labels del run. Los helpers independientes son `scripts/inf03-backup.mjs` y `scripts/inf03-restore.mjs`; el formato, guards y límites están en [infra/inf03/README.md](../../../../infra/inf03/README.md).

## Límites

El dump contiene datos privados de PostgreSQL por diseño aunque el ensayo use exclusivamente fixtures sintéticas; el cifrado no anonimiza ni prueba autoría del origen. Fotos de consulta, configuración, modelo e índice no se empaquetaron. La identidad age fue efímera y no sirve para recuperación futura. La operación idempotente de la fixture se conservó por conjunto; su key/hash sintéticos no acreditan replay por API. El gate integrado ajustará esa entrada y validará consumidor API/web sobre DB restaurada en una reserva separada. Ver [revisión local final](INF-03-local-review.md). No se configuraron destino off-host, retención, calendario, alertas ni verificación remota; la elección humana de destino/retención/presupuesto sigue pendiente. El ensayo no acredita RPO ≤24 h ni RTO ≤4 h ni recuperación ante pérdida del host.
