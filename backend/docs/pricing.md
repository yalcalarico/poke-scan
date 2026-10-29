# Precios — TCGCSV como única fuente activa

Decisión del usuario: **20/10/2026**. Esta política reemplaza TCGdex activo y la
comparación de dos proveedores. El catálogo sigue separado, desde pokemontcg.io.

## Lectura y valuación

`PRICE_PROVIDER` usa `TcgcsvPriceProvider`: `tcgcsv`, mercado `tcgplayer`, moneda
`USD`. La ficha, búsqueda por precio, ítems, listado y estadísticas de colecciones,
sets, portafolio, amigos y enlaces compartidos usan esa política exacta.
Se exige la variante del inventario; no se sustituye por otra variante.

`SyncPricesService.getPricesForCard` lee el lote confirmado de `card_prices`.
No usa fallback de otros proveedores ni la caché Redis de cartas del flujo
anterior: un build confirmado queda visible en la siguiente lectura, sin esperar
una TTL de una hora. Las cachés de enlaces compartidos incluyen el proveedor en
su clave y conservan su política existente de TTL/invalidation.

Precio cero es conocido; `market: null` es ausencia. Una colección vacía vale
cero, toda sin precio tiene valuación `null` y una cobertura parcial conserva
sólo el subtotal cotizado, con sus copias sin precio. Condición no ajusta el
valor. Dos copias Holofoil con referencia USD 1,09 suman USD 2,18 en el resumen.
ARS se convierte en el cliente con el rate vigente, no en estas series USD.

## Refrescos e ingesta

Las lecturas públicas no descargan precios. Una referencia ausente o vencida
solicita trabajo a `TcgcsvService.enqueueCards`, que resuelve cartas a grupos en
lote con SQL local, sin N+1. La colección filtra ownership en la misma consulta.
Pins y registros deben dar una identidad unívoca: una asociación conflictiva o
un grupo sin identidad segura no se encola.

El alta y edición, refresco explícito de colección y señales manuales usan la
misma cola `tcgcsv_group_jobs`. Pending no se duplica, processing conserva su
lease, el backoff no se adelanta y una reserva de descarga de 24 h no se borra.
Un grupo procesa todas las cartas asociadas; no se crean requests por cada copia.

`getPricesForCard` conserva la lectura local y solicita el grupo si hace falta. El endpoint admin
`POST /jobs/refresh-prices` devuelve `requested`, `queued`, `refreshed: 0`,
`failed: 0`: encolar no acredita una cotización nueva. Sólo la ingesta publica
observaciones, conservando fechas reales; refrescar no vuelve a fechar el precio
anterior ni crea historia.

La ingesta mantiene validación de `last-updated.txt`, build, productos/precios,
checksums, tamaños, idioma/número/nombre/subtipo y publicación atómica. Un build
repetido no agrega puntos. Un fallo conserva el lote anterior. Worker serial,
leases persistentes, una descarga del mismo archivo cada 24 h y pausas
429/Retry-After; no hay topes globales de 40 sets/500 requests.

## Ciclo diario y operación

- `ENABLE_TCGCSV_INGESTION=true` habilita descubrimiento, planificador y consumidor.
- Sets habilitados en `price_sync_sets`, con prioridades y demanda de colecciones.
  El planificador incorpora semilla curada, demanda de colecciones y todos los sets
  con asociación validada (prioridad 200 para las altas nuevas). No reactiva bajas
  manuales ni cambia prioridades ya registradas.
- Tanda común a las **21:00 UTC (18:00 Argentina)**. Su alcance se persiste al
  abrirse en `tcgcsv_daily_batches`, independiente de objetivos previos o bajas
  posteriores; una demanda nueva espera la tanda siguiente. El consumidor serial
  continúa el lote activo después de medianoche con su fecha y publicación fijas.
  No hay cierre horario que deje grupos pendientes: cada uno termina `completed`,
  `failed` o exceptuado con motivo. El lote cierra cuando todos tienen resultado;
  si alguna parte falla, su estado global es `failed` con éxitos y fallos separados.
- `tcgcsv_batch_groups` registra resultados por tanda; `tcgcsv_group_jobs` conserva
  presupuesto y lease globales por grupo. Un lease durable de consumidor en
  `tcgcsv_discovery_state` impide descargas paralelas entre procesos. La publicación
  confirma ambos leases y guarda precio y resultado en la misma transacción.
- Reanudación cada 15 min y consumidor cada cinco segundos; descubrimiento cada
  diez minutos. Antes de abrir una tanda no se descargan grupos aislados por una
  lectura o señal. Al arrancar o reanudar se recupera la última apertura vencida:
  antes de las 21 UTC corresponde a la fecha UTC anterior, incluso después de
  medianoche (21 ARG). No se abre la tanda del nuevo día calendario antes de hora
  ni se reconstruyen todos los días perdidos. Una tanda ya abierta conserva
  alcance y publicación; una cerrada no se reabre. No se promete ejecución
  mientras la PC esté suspendida.
- Los errores anteriores al contenido admiten hasta tres intentos acotados; si
  ya se consumió un archivo, el grupo falla y conserva las 24 h. La tanda siguiente
  vuelve a incluir todo el alcance habilitado, también los éxitos y fallos previos.
  Si la publicación objetivo fue reemplazada, o llegan las siguientes 18 sin
  terminar, lo restante falla explícitamente; no se mezcla otro feed ni se pisa
  una tanda activa con la siguiente.
- `pnpm run prices:status -- --watch` observa el avance sin pedir trabajo;
  `prices:sets` administra alcance. La API activa con ingesta habilitada inicia
  y recupera las tandas automáticamente; no hace falta un comando de sync.
- Transición autorizada el **26/10**: la tanda de hoy exceptúa los tres grupos
  con importaciones genuinas de esta mañana (`bw11`, `bwp`, `pop8`). Conservan
  sus objetivos terminales y reservas; a partir del 27/10 entran en el lote nuevo.

La reserva toma el máximo entre el reloj de PostgreSQL, el de la API al finalizar
el archivo y la reserva previa. Esto evita adelantar las 24 h tras una suspensión
que desalineó temporalmente el reloj de Docker. La telemetría permite reparar
reservas anteriores de forma conservadora, sin repetir una descarga.
- `ENABLE_COLLECTION_COMPARISON_CRON=true` conserva el corte diario de valor;
  `ENABLE_PORTFOLIO_SNAPSHOTS_CRON=false` permite deshabilitar el corte diario
  de portafolio. El nombre legacy del flag no vuelve a habilitar dos fuentes.

El proveedor, mapper, cola/worker por carta, backfill y ciclo diario TCGdex
fueron retirados del código el 24/10. Los controles TCGdex se marcan inactivos al arrancar.
Sus tablas, observaciones y clases de migración/pruebas se conservan; no
participan de lecturas ni de nuevas consultas externas de la aplicación.

## Historial y fechas

Los endpoints terminados en `/comparison` conservan sus URLs por compatibilidad,
pero con el proveedor activo TCGCSV devuelven una sola serie TCGCSV. La UI muestra
historial de precio/valor, sin panel de comparación entre proveedores.

Cada observación conserva `fetchedAt` (recepción) y `feedPublishedAt` (publicación
del archivo). No conocemos la hora de cotización upstream. En precios y valuación,
`freshness` describe antigüedad de la consulta; el historial atribuido comunica
explícitamente antigüedad del **feed**. Son fechas distintas y se nombran como tales.
Los días sin datos permanecen como huecos y no se reconstruyen con precios actuales.

TCGCSV publica alrededor de las 20:00 UTC (17:00 Argentina). No documenta un
desfase fijo T-1: antes de esa hora puede seguir disponible el feed del día
anterior. La tanda automática espera una publicación del día de su objetivo
antes de descargar contenido. La fecha de importación no cambia la fecha del
feed ni acredita la hora de cada venta. Ver [sitio](https://tcgcsv.com/),
[reglas de uso](https://tcgcsv.com/docs) y [procedencia](https://tcgcsv.com/faq).

El portafolio usa snapshots de `collection_comparison_snapshots` filtrados a
TCGCSV. No une la nueva serie con `portfolio_snapshots` anteriores sin proveedor.
El valor representa el inventario de ese día, no ganancia. No se borran los
registros históricos de la fuente retirada.

Ver [providers](providers.md), [jobs](jobs.md), [API](api.md) e
[historial en frontend](../../frontend/docs/comparison.md).

## Cobertura y caché de productos — 21/10/2026

`tcgcsv_set_groups` permite que los Trainer Kits revisados compartan un grupo;
la vista `tcgcsv_set_mappings` une esas asociaciones con el registro anterior sin
alterar las restricciones de otros proveedores. La identidad de productos se
resuelve sobre todas las cartas del grupo: una colisión entre sets se rechaza.
Un grupo tiene un job y una publicación atómica, con resultado diario por set.

`tcgcsv_product_cache` conserva el JSON validado, SHA256, bytes, ETag/Last-Modified
y fechas de recepción/validación. Un `304` sólo reutiliza una copia íntegra y
compatible; conserva su recepción. Precios y manifest no se cachean en esta capa.
La caché no adelanta reservas, no vuelve a fechar cotizaciones ni crea historia.
`tcgcsv_http_requests` registra bytes de cuerpo leídos, estado HTTP, duración y
pausas por archivo; un `304` cuenta como petición. No mide bytes de headers ni
tráfico comprimido de red. Un fallo de telemetría no oculta la respuesta original.

Comandos locales (requieren migraciones; conciliación requiere build backend):

```bash
pnpm run prices:coverage
pnpm run prices:diagnose
pnpm run prices:reconcile -- --apply
```

`prices:coverage` informa cobertura por carta/variante observada, antigüedad del feed,
conflictos y tráfico de las últimas 24 h. No presume conocer variantes ausentes
del feed. `prices:diagnose` revisa productos cacheados, fase del fallo y reservas,
sin descargar ni modificar la cola. Una coincidencia de productos no acredita
un precio ni una publicación. `prices:reconcile` concilia sólo el catálogo ya almacenado y amplía el registro;
no descarga ni modifica reservas. La API y su worker siguen siendo necesarios
para publicar los precios. Ver [plan](../../docs/plans/tcgcsv-cobertura-optimizacion-2026-10-21.md).

Un archivo de precios íntegro puede omitir productos: los asociados sin
cotización quedan como `no_quote`, y el set parcial. No se renueva la fecha del precio
anterior ni se agrega cero/null para una variante que el feed no informó. Un
lote sin observaciones compatibles, estructura inválida, identidad conflictiva
o publicación cambiante sigue conservando el lote anterior.
