# Proveedores de catálogo y precios

Política activa desde **20/10/2026**: TCGCSV es la única fuente de precios.

| Token | Implementación | Uso |
|---|---|---|
| `CARD_DATA_PROVIDER` | `PokemonTcgIoProvider` | Catálogo y sets espejados en PostgreSQL |
| `PRICE_PROVIDER` | `TcgcsvPriceProvider` | Política TCGCSV / TCGplayer / USD de todas las lecturas y valuaciones |

`TcgcsvPriceProvider` declara únicamente identidad, mercado y moneda. La descarga
pertenece a `TcgcsvService` y su cola por grupo, nunca al handler de una carta.
`SyncPricesService` solicita grupos y lee filas confirmadas, sin fallback ni
reestampado. `PokemonTcgIoProvider` sólo espeja páginas de sets y cartas; el
parser de su feed antiguo de precios fue retirado.

## Identidades seguras

Los IDs canónicos de cartas y sets no cambian: son claves del inventario.
`card_set_external_ids` registra los grupos TCGCSV. Pins revisados y registro
deben coincidir sin ambigüedad. La ingesta valida nombre, número completo,
denominador, idioma y subtipo de cada producto; sellados no se asocian a cartas.
Los detalles de implementación están en `src/jobs/tcgcsv/`.

Un set sin asociación segura queda sin cotización. El precio cero se conserva;
la ausencia no se transforma en cero ni en una cotización de otra variante.

## Actualizaciones

El ciclo diario TCGCSV usa sets habilitados, 21:00 UTC y reanudación cada quince
minutos. Descubrimiento y consumidor respetan build, reservas de 24 h, leases,
serialización y 429/Retry-After. El arranque y la reanudación recuperan la última
apertura vencida de las 21 UTC, también después de medianoche, sin reconstruir
días perdidos ni cambiar la publicación de una tanda abierta.
Las lecturas no descargan archivos.
Ver [precios](pricing.md), [jobs](jobs.md) y [fuentes](../../docs/data-sources.md).

## Procedencia histórica

Las observaciones previas de TCGdex/legacy se conservan para historia y regresión.
El proveedor, mapper, worker por carta, backfill y ciclo diario TCGdex fueron
retirados del código el 24/10. Sus tablas y migraciones históricas se conservan;
no alimentan precios ni totales activos.
