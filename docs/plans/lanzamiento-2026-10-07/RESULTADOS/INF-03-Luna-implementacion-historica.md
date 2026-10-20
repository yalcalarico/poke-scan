# INF-03 — implementación y ensayo local

> **Revisión Sol HIGH 8/10: entrega histórica, no aceptación de la fase local.** Los 10 negativos del run original se ejecutaron después del restore sobre un target ocupado y no acreditan las guardas age/tar; alteración/truncamiento además conservaban el recibo original. Los scripts fueron corregidos. Hay 22 checks offline ejecutados y evidencia separada; el nuevo roundtrip multichunk age está pendiente por rechazo automático de descarga y autorización humana sin respuesta. Ver [INF-03-local-review.md](INF-03-local-review.md). Los tamaños, digests, tiempos y 143 constraints de este texto pertenecen al run Luna histórico (143 incluye catálogo PostgreSQL), no al código corregido.

Fecha: 2026-10-08 · Run: `inf03-370200abbf0c` · Estado: **fase LOCAL entregada para revisión**. INF-03 sigue abierto para off-host y operación; no cierra el gate global.

## Resultado medido

Se creó una base PostgreSQL 16 vacía aplicando 11 migraciones SQL existentes en orden sobre un origen sintético; luego se generó un dump custom, se empaquetó con exactamente `manifest.json` y `database.dump`, y se cifró con age. Confirmado el ciphertext, se destruyó sólo el origen etiquetado y se restauró en una segunda base vacía, con contenedor, red interna, volumen y rol propios. El rol de restore fue login, sin superuser, createdb ni createrole. No se publicaron puertos.

- Herramientas: age v1.2.1 desde [release oficial](https://github.com/FiloSottile/age/releases/download/v1.2.1/age-v1.2.1-darwin-arm64.tar.gz); imagen oficial `postgres:16.15-bookworm`, digest `postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4`.
- Dump: 42672 bytes, SHA-256 `e69f57e41ceb6ba5b0c3af81998efa77038f75eff1de52e2fd7494ad2db6e0ce`; ciphertext: 51400 bytes, SHA-256 `ee077f288199b298ab462a7115530c8590b317eb2b6756dc20978653d14bc57e`; recibo SHA-256 `83a6463faa3306bbee711627ab47f30fd0697a536fd6a0d8707855b1118b6384`. Los artefactos y llaves efímeros se borraron al terminar.
- Tiempos: bootstrap fuente 1495 ms; backup 523 ms; restore 884 ms; flujo local completo 14311 ms. Son mediciones de este ensayo sintético, no un RTO.
- Punto recuperable: último commit fixture 2026-10-08T11:32:20.347000Z; incidente simulado 2026-10-08T11:32:21.064Z; brecha observada 717 ms. Es una brecha local entre timestamps sintéticos y no demuestra frecuencia ni RPO operativo.
- Checks restaurados: 11; 11 filas de migración, extensión pg_trgm y 5 índices GIN válidos; UUIDs de usuarios/amistad/colección/items, cantidades 2 y 3, item de idempotencia y share link activo con alcance collectionId.
- Pruebas: 1 recorrido positivo y 10 negativos; alteración y truncamiento del último chunk age, identidad/recibo incorrectos, marcador target incorrecto, digest de dump errado dentro de ciphertext válido, manifiesto incompatible, archivo extra, symlink, target ocupado. El contador observó 1 invocación de pg_restore: la del caso positivo.
- Cleanup: completo para los recursos etiquetados del run. Snapshot de contenedores compartidos antes/después idéntico: `pokemon-scanner-db`, `pokemon-scanner-redis`.

## Uso

Desde la raíz, con pnpm 10.17.1, Node 22.20.0 y Docker: `pnpm exec node scripts/inf03-smoke.mjs`. El runner descarga age a un directorio privado temporal, valida versión/procedencia, baja la imagen fijada por tag y usa sólo recursos Docker con nombres/labels del run. Los helpers independientes son `scripts/inf03-backup.mjs` y `scripts/inf03-restore.mjs`; el formato, guards y límites están en [infra/inf03/README.md](../../../../infra/inf03/README.md).

## Límites

El dump contiene datos privados de PostgreSQL por diseño aunque el ensayo use exclusivamente fixtures sintéticas; el cifrado no anonimiza ni prueba autoría del origen. Fotos de consulta, configuración, modelo e índice no se empaquetaron. La identidad age fue efímera y no sirve para recuperación futura. No se configuraron destino off-host, retención, calendario, alertas ni verificación remota; la elección humana de destino/retención/presupuesto sigue pendiente. El ensayo no acredita RPO ≤24 h ni RTO ≤4 h ni recuperación ante pérdida del host.
