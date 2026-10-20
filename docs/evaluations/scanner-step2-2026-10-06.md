# Evaluación preparada y baseline DINOv2 — 6 de octubre de 2026

## Entrega del paso 2

Evaluador vigente corregido para top-8, tasas con denominadores explícitos,
particiones development/holdout y métricas por origen/condición. Las etiquetas
pendientes quedan fuera de precisión y negativos. Se informan IDs distintos y
hashes duplicados; las repeticiones sólo cuentan para tiempos.

Comando nuevo: `pnpm --dir backend run scanner:evaluate:current`.
No se cambió el worker de producción, embedding, índice, umbrales o UI.
Tests específicos verifican exclusión de etiquetas pendientes, top-8,
referencias ausentes, separación de grupos y no multiplicación por repetición.

## Baseline disponible

Ejecutado con `manifest-dinov2-development.json`, dos pasadas, índice de
20.670 referencias. [Reporte reproducible](dinov2-baseline-2026-10-06.json).

| Métrica | Resultado |
|---|---|
| Fotos / IDs distintos | 5 / 5 |
| Top-1 | 3/5 |
| Top-8 | 4/5 |
| Referencias ausentes | 0 |
| Negativos / holdout | 0 / 0 |
| Tasa de falsas sumas de negativos | No medible (`null`) |
| Bytes duplicados | 0 |

| Foto original | ID esperado | Primer candidato | Puesto esperado |
|---|---|---|---|
| IMG_4985 | me55c-106 | me55c-106 | 1 |
| IMG_4986 | me55-23 | ex16-48 | 2 |
| IMG_4987 | me55-92 | pop5-10 | 418 |
| IMG_4988 | me55-137 | me55-137 | 1 |
| IMG_4989 | me55-145 | me55-145 | 1 |

Estas entradas son **originales directos**, sin preparación cliente. El puesto
418 de Umbreon no contradice la galería real del paso 1, donde tras el recorte
cliente quedó segundo detrás de Luxray. No representan precisión de la app.

Total local frío: 1.740,8 ms (n=1); caliente p50: 256,5 ms, p95/p99: 263,4 ms
(n=9). No incluye preparación cliente/HTTP/precio. Una corrida pequeña no mide
estabilidad, distribución de arranques ni rendimiento bajo carga.

## Corpus amplio pendiente

El usuario confirmó que aún no tomó/clasificó las nuevas fotos y planea hacerlo
por la tarde. La herramienta y el protocolo quedan preparados; **la evaluación
amplia no está cerrada**. Faltan negativos reales, holdout, más dispositivos y
etiqueta exacta del Darmanitan. Los pares JPG de cámara del 4/10 no se encontraron
en las rutas locales consultadas; se conserva su evidencia anterior, sin inventar
una nueva ejecución ni usar Darmanitan como negativo.

Propuesta para aportar material: 60 fotos; un lote inicial de 20 permite comenzar.
40 fotos de 20 cartas con una toma clara y otra difícil, 10 de full-art o
reimpresiones y 10 negativos. Los grupos pueden solaparse; la ficha identifica
cada foto sin duplicarla para sumar cuotas.

Nombres recomendados:

- `001_umbreon-ex_30th-celebration_092_clara.jpg`
- `002_umbreon-ex_30th-celebration_092_funda.jpg`
- `051_negativo_dorso.jpg`

Nombre, colección exacta y número impreso son necesarios; no hace falta buscar
el ID interno. Usar `coleccion-pendiente` si hay duda y agregar aclaración en un
archivo de texto. La etiqueta se corrobora antes de medir precisión. Conservar
los archivos originales; recortes de galería/cámara exportados se registran como
otro origen, no se mezclan con originales en una sola tasa de la app.

[Protocolo vigente](scanner-validation-protocol.md), con formato del manifiesto,
particiones, toma de muestras y medición cliente/HTTP separada del motor local.

## Verificación de la entrega

`pnpm run stop` → `pnpm run check`: exit 0, lint, tipos, 306 backend,
7 tests de scripts, 6 e2e y 347 frontend (**666 pruebas**) y ambos builds.
Log local: `/tmp/scanner-step2-2026-10-06-check.log`. Stack restaurado con
`pnpm run dev`. Los cambios quedan locales; no se hizo commit/push.
