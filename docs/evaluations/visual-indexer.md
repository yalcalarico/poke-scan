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

Hay una pausa de 2,3s entre intentos incluso fallidos, una descarga activa, timeout 30s y allowlist images.pokemontcg.io/images.scrydex.com. Esto es una política conservadora del proyecto; no afirma que el servidor de imágenes tenga el mismo límite que la API. No se consulta la API pokemontcg.io.

20.670 cartas requieren mínimo ~13,2 horas sólo por pausas, más red e inferencia. El script muestra pendientes/presupuesto antes de avanzar. No iniciamos descarga completa. Disco depende de tamaño de imágenes; medí un lote pequeño primero.

La muestra de cinco referencias obtuvo 5/5 top-1 con sólo cuatro distractores. No cierra aceptación del spike: faltan catálogo completo, reimpresiones similares, dataset50–100, negativos, comparación fp32/int8/CLIP, aumentaciones y medición fría. Ver visual-2026-10-02.md y JSON. Un abort nativo ONNX aislado sigue pendiente de investigar.

Verificaciones CLI: ayuda desde raíz sin modelo/DB exit0; listado read-only de sets exit0; --set me55 --card-ids me55-137 --limit1 descargó una referencia y produjo un vector exit0. Simulación de vector pendiente con imagen ya cacheada produjo downloads=0,cachedImages=1,completed=1 exit0. Evaluate por CLI dio 5/5 top1 nuevamente. Límite0 rechazado antes de modelo/DB exit1. node --check, oxlint y diffcheck pasaron. Fullcheck a cargo del coordinador. SIGINT está implementado pero falta verificación con señal en proceso real.
