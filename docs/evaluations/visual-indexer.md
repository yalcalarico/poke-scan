# Indexador visual local

Descargá imágenes de referencia del catálogo ya espejado en PostgreSQL, generá embeddings DINOv2-small int8 y guardá ambos en disco. Es un experimento offline; no modifica cartas, precios ni colecciones personales, ni habilita reconocimiento en la app.

## Preparación

Node 22 y pnpm 10.17.1. Desde raíz, instalá dependencias backend con pnpm --dir backend install --frozen-lockfile y generá cliente con pnpm run db:generate. PostgreSQL debe estar disponible en localhost:55432, con DATABASE_URL configurada en backend/.env. No hace falta levantar API/web ni Redis.

Modelo existente: backend/.scanner-models/dinov2-small-int8.onnx; alternativa --model /ruta/modelo.onnx. Este script no descarga el modelo. Se requiere DINOv2-small de 384 dimensiones, export ONNX cuantizado revisión 8b1f705a3a7f6f062f6bdd21986c1583d3ef105d de onnx-community/dinov2-small. Hash del modelo usado en muestra: c179f8f7f592449c4c1bca4cd124a7538021428c5ffb89afde9503935b197efb.

## Comandos desde raíz

```sh
pnpm run scanner:index --help
pnpm run scanner:sets
# Cantidad limitada, cualquier expansión
pnpm run scanner:index --limit 10 --directory .scanner-index/prueba
# Una expansión del catálogo (ID obtenido con scanner:sets)
pnpm run scanner:index --set me55 --limit 10 --directory .scanner-index/me55
# Sólo cinco cartas etiquetadas
pnpm run scanner:index --card-ids me55c-106,me55-23,me55-92,me55-137,me55-145 --limit 5 --directory .scanner-index/cinco
# Toda una expansión, hasta 30000 intentos nuevos
pnpm run scanner:index --set me55 --limit 30000 --directory .scanner-index/me55
# Evaluación: ruta manifiesto relativa a backend
pnpm run scanner:evaluate ../docs/evaluations/manifest.json --directory .scanner-index/cinco
```

Aquí colección significa **set/expansión del catálogo**, no una colección personal. --set y --card-ids se intersectan cuando se usan juntos. --limit es cantidad máxima de intentos nuevos por ejecución: fallos también consumen el límite; referencias ya guardadas se omiten. Default 100, rango 1–30000. Las rutas --directory y --model se resuelven desde backend al usar los comandos pnpm de raíz. Usá rutas absolutas para evitar dudas.

Desde backend, los mismos comandos son pnpm run scanner:index --set me55 --limit 10, pnpm run scanner:sets y pnpm run scanner:evaluate /ruta/manifest.json. También se puede ejecutar node --env-file-if-exists=.env scripts/scanner-visual-spike.mjs index --limit 10 --set me55, o --list-sets.

## Archivos y reanudación

- images/ contiene originales descargados; nombres SHA-256 de ID+URL con extensión .image. Sharp detecta el formato desde bytes. El registro del vector conserva imageUrl e imagePath.
- dinov2-REVISION-int8.jsonl: un objeto por carta con id, name, imageUrl, imagePath y vector normalizado de 384 números.
- meta.json: hash SHA-256 de modelo/preprocesado, revisión, precisión y dimensiones. Un índice legado sin metadata o de otro modelo se rechaza: usá otro directorio.
- index-summary.json: intentos, éxitos, fallos, descargas, imágenes cacheadas, tiempo e interrupción de la última ejecución. Fallos dejan exit code 1.
- evaluation.json: rangos y distractores por ID, top-1/top-10, tiempos y productionReady:false. Manifiesto: arreglo de objetos {path,cardId}, paths a fotos originales e IDs exactos.
- index.lock: exclusión mutua tanto para indexación como evaluación, adquirida antes de leer/modificar metadata o índice.

Para continuar, repetí el mismo comando/directorio: omite vectores existentes, reutiliza imágenes descargadas si la inferencia anterior falló y vuelve a intentar pendientes/fallos. Conservá el directorio completo. No borrar metadata para mezclar modelos. Ctrl+C espera el intento actual (hasta timeout de red 30s más inferencia y pausa), guarda resumen y limpia lock. Con kill -9 o crash nativo puede quedar lock: verificá su PID y borrá sólo si el proceso terminó. Un JSONL dañado se rechaza: conservá copia y reconstruí el índice antes de continuar.

## Tiempo y evaluación pendiente

No hay pausa artificial por defecto (configurable con --delay-ms 0–60000), una descarga activa, timeout 30s y allowlist images.pokemontcg.io/images.scrydex.com. La pausa pasó de 2,3s a 1s y luego a 0ms por pedido del usuario. Es una política del experimento, no un límite verificado del CDN; no afirma que el servidor de imágenes tenga el mismo límite que la API. No se consulta la API pokemontcg.io.

Con el default de 0ms no se agrega tiempo de pausas: la duración depende de red e inferencia. Con --delay-ms 1000 se sumarían ~5,7 horas para 20.670 cartas; con 2300, ~13,2 horas. El script muestra pendientes/presupuesto antes de avanzar. No iniciamos descarga completa. Disco depende de tamaño de imágenes; medí un lote pequeño primero.

La muestra de cinco referencias obtuvo 5/5 top-1 con sólo cuatro distractores. No cierra aceptación del spike: faltan catálogo completo, reimpresiones similares, dataset50–100, negativos, comparación fp32/int8/CLIP, aumentaciones y medición fría. Ver visual-2026-10-02.md y JSON. Un abort nativo ONNX aislado sigue pendiente de investigar.

Verificaciones CLI: ayuda desde raíz sin modelo/DB exit0; listado read-only de sets exit0; --set me55 --card-ids me55-137 --limit1 descargó una referencia y produjo un vector exit0. Simulación de vector pendiente con imagen ya cacheada produjo downloads=0,cachedImages=1,completed=1 exit0. Evaluate por CLI dio 5/5 top1 nuevamente. Límite0 rechazado antes de modelo/DB exit1. node --check, oxlint y diffcheck pasaron. Fullcheck a cargo del coordinador. SIGINT está implementado pero falta verificación con señal en proceso real.

## Lotes y almacenamiento

Se lee PostgreSQL y se descargan imágenes del CDN, sin llamadas a la API de catálogo/precios. El límite documentado de la API sin key (1000/día, 30/minuto) no demuestra un límite del CDN. El script no impone cuotas diarias: --limit acota intentos por ejecución.

```sh
# Repetí más tarde para procesar los siguientes 500 intentos pendientes
pnpm run scanner:index --limit 500 --delay-ms 0 --directory .scanner-index/catalogo
# Volver a la pausa anterior
pnpm run scanner:index --limit 500 --delay-ms 2300 --directory .scanner-index/catalogo
```

Conservá el mismo directorio para reanudar sin repetir vectores. La cola de precios mantiene su throttling independiente. Si el CDN responde 429, no continúes lanzando lotes; respetá la espera del proveedor. El script registra el fallo pero no interpreta Retry-After automáticamente.

Las imágenes son caché para regenerar vectores o cambiar modelo. La evaluación usa vectores, modelo y fotos de consulta; no requiere originales de referencia. Por ahora se conservan. El aniversario quedó en backend/.scanner-index/30th-anniversary/images/ (191 originales). storage-estimate.json registra 166,8 MiB de imágenes y 1,52 MiB de vectores.

## Organización común de respaldos

La guía operativa para todas las expansiones está en backend/.scanner-index/RESPALDO.md. Para nuevas expansiones usá --set ID --directory .scanner-index/<nombre del set>; mantené un directorio por set y repetilo para reanudar. El índice combinado existente 30th-anniversary se conserva por compatibilidad con el experimento de reconocimiento. El reconocedor actual no agrega automáticamente múltiples directorios. Copiá .scanner-index completa al USB y el modelo como respaldo adicional.

## Lotes de sets completos y validación

```sh
# Revisar hasta diez sets pendientes, sin descargas
pnpm run scanner:index:sets --limit 10 --dry-run
# Procesar todas las cartas de hasta diez sets pendientes
pnpm run scanner:index:sets --limit 10
# Verificar pertenencia, faltantes y vectores contra PostgreSQL
pnpm run scanner:validate
pnpm run scanner:validate --set me55 --json
```

En scanner:index:sets, --limit cuenta sets incompletos o nuevos (default 1), no cartas. En scanner:index, --limit sigue contando intentos de cartas. El lote omite sets completos por IDs exactos, URLs y vectores compatibles; reanuda carpetas incompletas. Reconoce el aniversario combinado por sus vectores, no por el conteo de un manifiesto. Crea las nuevas carpetas directamente por nombre de expansión. Un índice incompatible o con cartas ajenas exige revisión antes de continuar. --set ID restringe a un set, --directory cambia la raíz y --delay-ms/--model se propagan al indexador. No hay presupuesto diario automático.

La validación es de lectura: reporta cartas faltantes, ajenas, duplicadas, vectores/URLs inválidos e imágenes ausentes. Las imágenes ausentes no invalidan los vectores porque pueden estar respaldadas. No confirma contenido visual ni hashes de imágenes. Exit 0 completo, 1 incompleto/inválido, 2 activo o sin set identificado. Un directorio activo se omite para evitar leer mientras se escribe. --json lista IDs detallados.

No lanzar otro lote mientras haya una indexación activa. El lote que ya estaba ejecutándose conserva la semántica anterior (intentos de cartas por set); este cambio aplica a nuevas ejecuciones.

## Excepción de imagen HGSS18

Sólo el indexador offline usa una URL fija de static.tcgcollector.com para hsp-HGSS18 (Tropical Tidal Wave, Worlds 10, HGSS18). Las URLs originales responden 404 y la alternativa de Scrydex devuelve un dorso genérico. Referencia verificada: JPEG 320×446. scanner-reference-url.mjs limita la excepción al ID y URL exactos; el resto de cartas conserva las URLs del catálogo. La DB no se modificó. La validación y la planificación reconocen esta referencia alternativa.

## Excepciones McDonald’s Collection 2014

Las 12 URLs de mcd14 devolvían HTTP 404. Se verificaron las referencias de https://www.tcgcollector.com/sets/1193/mcdonalds-collection-2014: nombres, números 1/12–12/12 y logo McDonald’s en los frentes. card-image-overrides.json fija una URL exacta por ID; sólo se usan en indexación offline, sin modificar PostgreSQL ni URLs de otros sets. Imágenes JPEG de 320 píxeles de ancho; precisión de reconocimiento no evaluada. Las descargas verificadas se conservaron en la caché de la expansión y los 12 vectores se generaron desde ella.

## URLs corregidas en el catálogo (3 de octubre de 2026)

Las 13 referencias alternativas de HGSS18 y McDonald’s 2014 ya están en cards.imageSmall/imageLarge. El indexador lee esas columnas sin sustituciones locales; la allowlist conserva las excepciones de URL exacta por ID. La fuente de correcciones es backend/src/catalog/card-image-overrides.json, aplicada por SyncCardsService usando el ID canónico para protegerlas en futuras sincronizaciones. rawJson sigue preservando la respuesta original del proveedor.

Para otra instalación: pnpm run db:fix-images muestra el plan; --apply actualiza ambas columnas en una transacción y guarda respaldo previo en backend/.scanner-index/db-image-urls-before-TIMESTAMP.json. No toca precios ni otras cartas. Next permite static.tcgcollector.com/content/images/** para servir esas referencias. Es necesario reiniciar Next si ya estaba corriendo con la configuración anterior. La calidad es de 320 píxeles de ancho, no alta resolución.

### McDonald’s Collection 2015

Se agregaron las 12 URLs de mcd15 (25 correcciones totales con las anteriores) desde https://www.tcgcollector.com/sets/1194/mcdonalds-collection-2015. Se comprobaron respuestas HTTP 200 y los frentes con nombres/números del set. db:fix-images --apply actualiza sólo las columnas imageSmall/imageLarge; no ejecuta indexación. El script indexador lee PostgreSQL y la allowlist acepta sólo la URL exacta asociada a cada carta corregida.

### McDonald’s Collection 2017

Se corrigieron ambas URLs de mcd17-1 a mcd17-12 desde https://www.tcgcollector.com/sets/11121/mcdonalds-collection-2017. Se verificaron respuestas HTTP 200, nombres, frentes y numeración 1/12–12/12. Hay 37 correcciones totales. Sólo se actualizan las URLs en PostgreSQL y su protección en sync; no se ejecuta indexación.

### McDonald’s Collection 2018

Se corrigieron `imageSmall` e `imageLarge` de las 12 cartas `mcd18` con referencias de https://www.tcgcollector.com/sets/11139/mcdonalds-collection-2018. Todas respondieron HTTP 200 y se verificaron visualmente los nombres y números 1/12–12/12 contra el catálogo local. La corrección está en el mapa compartido del catálogo y se preserva durante el sync. No se ejecutó la indexación.

El lote continúa con el siguiente set si el indexador termina con error. Al final muestra `failedSets` y devuelve exit code 1 si quedó alguno pendiente; Ctrl+C sigue interrumpiendo el lote. Los errores de integridad detectados antes de descargar siguen deteniendo la ejecución. Se corrigió también la referencia de Oddish `svp-102` con https://www.tcgcollector.com/cards/43279/oddish-scarlet-and-violet-promos-102, verificada por HTTP y visualmente.

Se corrigieron las referencias `xyp-XY39` (Kingdra) y `xyp-XY46` (Altaria) desde TCG Collector, y `xyp-XY68` (Chesnaught) desde https://www.serebii.net/card/xypromos/068.shtml. Las tres imágenes respondieron correctamente y se verificaron visualmente nombres, números y estampas de prerelease. Ambas columnas de imagen se actualizan en DB; Next permite únicamente `/card/xypromos/68.jpg` de Serebii.
