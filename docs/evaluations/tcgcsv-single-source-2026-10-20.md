# TCGCSV como única fuente de precios — 20/10/2026

## Pedido y resultado

El usuario mostró que el resumen de «Prueba escáner · 4 octubre» seguía sin precio
tras la corrección de ítems. Pidió retirar TCGdex y usar una sola fuente.
La política activa ahora es TCGCSV / TCGplayer / USD, variante exacta, en ficha,
búsqueda, colección, totales, sets, portafolio, amigos y compartidos. La colección
original tiene dos copias y suma USD 2,18 con la misma selección SQL del resumen.

## Implementación

- `PRICE_PROVIDER` usa `TcgcsvPriceProvider`. El catálogo conserva su proveedor.
  `JobsModule` deja de registrar mapper, worker y ciclo diario TCGdex. Los controles
  de esa fuente se marcan inactivos; sus observaciones previas se conservan.
- Las lecturas de precios TCGCSV usan PostgreSQL, sin fallback ni caché de carta
  que retrase una publicación. Los refrescos resuelven grupos en SQL local y
  encolan sin red; la selección de colección conserva ownership y variante.
- La cola rechaza identidades ambiguas, deduplica por grupo, no toma processing
  ni adelanta cooldown/backoff. Se mantienen reservas de 24 h, publicación real,
  validación del feed, serialización y 429/Retry-After. Ningún refresco reestampa
  el precio anterior. Admin comunica `queued`, con `refreshed: 0`.
- TCGCSV incorpora semilla y demanda del registro de sets. Conserva ciclo
  21:00 UTC, reanudación cada 15 min, descubrimiento y consumidor existentes.
  Las señales manuales y estado operativo usan sólo TCGCSV; el seed ya no
  consulta TCGdex. El ejemplo de entorno no duplica flags contradictorios.
- La UI reemplaza la comparación por historial de una fuente. El guard exige
  una serie TCGCSV cuando es el proveedor activo. El portafolio usa snapshots
  atribuidos a TCGCSV; no une historia previa sin proveedor.
- Se retira el workaround `referencePrice` de la primera corrección: `price`
  activo vuelve a servir ítems y totales. Se conservan las mejoras de variante
  automática, puntos, fechas y huecos de la tarea anterior.

La metadata de consulta conserva recepción local. El historial ya calculaba la
recencia por publicación del feed; ahora se etiqueta explícitamente como tal,
para distinguir ambas fechas sin atribuir una hora upstream desconocida.

## Validación

`pnpm run stop` y cierre de dos arranques antiguos que reactivaban la API al
cambiar archivos. `pnpm run check` terminó en 0: lint, tipos, 600 pruebas backend,
6 HTTP, 626 frontend, suites de scripts/operación y ambas compilaciones.

Las cuatro pruebas nuevas integran la inyección real, total USD 2,18, exclusión
de TCGdex, lectura tras publicación, ausencia de reestampado, cola sin red,
identidad ambigua, ownership, deduplicación y cooldown. Pasaron también 12 casos
focales del backfill legado y los seis HTTP. Se actualizaron fixtures HTTP que
seguían sembrando TCGdex como activo. Un test legado volvió explícita una fecha
`availableAt` vencida para evitar depender del redondeo de `DEFAULT now()`.

Runtime con stack habitual y aislamiento temporal de ingesta durante QA:

- La ficha, listado de colecciones, estadísticas, portafolio y enlace público
  devolvieron TCGCSV, USD 1,09 por copia y USD 2,18 para dos copias.
- El navegador verificó la tarjeta resumen que faltaba, el detalle, alta y edición,
  Holofoil fija y cinco puntos históricos reales. Una alta real incrementó a tres
  copias (USD 3,27), después restituidas a dos en la colección temporal.
- Chrome en 1440×1000 y 390×844, claro/oscuro y movimiento reducido: sin desborde
  horizontal ni errores JavaScript. No se tomaron capturas ni se probó un dispositivo físico.
- Cuenta temporal eliminada; cero cuentas QA remanentes. El arranque normal fue
  restaurado. El estado operativo informa sólo TCGCSV, con su planificador/worker
  habilitados y el planificador TCGdex deshabilitado.

Revisión independiente: sin bloqueantes de DI, cola o portafolio; dos encargos,
sin subdelegación. Se aclaró en UI la diferencia de recencia de consulta/feed.
Durante navegación apareció un log `ERR_HTTP_HEADERS_SENT` en
`CollectionsController.getCardLocation`, también presente en el runtime de la
corrección anterior. La ruta no cambió en este lote; los flujos de precio y
aserciones HTTP/navegador descritos pasaron. No se acredita ausencia de errores
backend ajenos a este alcance ni se declara reparado ese log.

Evidencia: [gate](tcgcsv-single-source-2026-10-20-evidence/check.json),
[navegador](tcgcsv-single-source-2026-10-20-evidence/browser.json).
