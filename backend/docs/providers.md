# Proveedores de catálogo y precios

Política activa desde **20/10/2026**: TCGCSV es la única fuente de precios.

| Token | Implementación | Uso |
|---|---|---|
| `CARD_DATA_PROVIDER` | `PokemonTcgIoProvider` | Catálogo y sets espejados en PostgreSQL |
| `PRICE_PROVIDER` | `TcgcsvPriceProvider` | Política TCGCSV / TCGplayer / USD de todas las lecturas y valuaciones |

`TcgcsvPriceProvider` declara identidad, mercado y moneda. Los métodos de consulta
por carta del contrato histórico rechazan su uso: la descarga pertenece
exclusivamente a `TcgcsvService` y su cola por grupo, nunca al handler de una carta.
`SyncPricesService` deriva los refrescos a esa cola y lee las filas confirmadas.
No reestampa observaciones ni usa proveedores alternativos como fallback.

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
serialización y 429/Retry-After. Las lecturas no descargan archivos.
Ver [precios](pricing.md), [jobs](jobs.md) y [fuentes](../../docs/data-sources.md).

## Procedencia histórica

Las observaciones previas de TCGdex/legacy y sus adaptadores de investigación
se conservan para historia y regresión. El mapper, worker y ciclo TCGdex no se
registran en `JobsModule`; el seed tampoco consulta TCGdex. Sus IDs no se
reasignan a TCGCSV ni sus precios se atribuyen a la fuente nueva.
