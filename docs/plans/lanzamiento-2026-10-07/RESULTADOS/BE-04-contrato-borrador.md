# BE-04 — Borrador revisado de precios, antigüedad y cobertura

**Fase:** contrato preparatorio aceptado para UX-03 el 8/10/2026 tras revisión/corrección Sol HIGH. Campos propuestos: **no implementados**. BE-04, FE-03 y gate del lote valores siguen pendientes.

**Alcance:** inspección local y handoff documental. Sin cambios de aplicación, DTOs reales, schema, migraciones o datos; sin servicios, suites, consultas DB/Redis ni requests externos. Registro/planes pertenecen al coordinador.

## Decisiones para UX-03 e implementación

Identidad de cotización: carta + variante + proveedor API + mercado (`source`) + moneda. Condición registrada sin ajuste monetario automático; variante exacta del item, sin sustituirla por normal/la más cara.

`fetchedAt` significa consulta/registro local, **no actualización del mercado**. Separar `freshness` (consulta/proveedor) de `upstreamFreshness` (fecha informada por la fuente). Upstream null implica edad upstream unknown incluso con consulta fresh: “Fecha de actualización de la fuente no disponible”. Feed antiguo verificable consultado hoy conserva upstream stale y ambas fechas distintas.

Cobertura por **copias**: market 0 cuenta como conocido; market null/falta de fila no contribuye aunque mid exista. Vacío: importe 0. No vacío totalmente sin precio: null. Parcial: subtotal conocido y copias cubiertas. Nunca deducir ausencia comparando importe con cero.

Persistencia mínima decidida: **ninguna columna nueva en este mínimo**. Upstream null porque adapter/contrato local no conservan fecha atribuible. Snapshot ya guarda totalCards/unpricedCards: cobertura histórica derivable exactamente, antigüedad histórica no registrada. Sin backfill con inventario actual, fetchedAt ni rawJson de otro proveedor.

## Fuentes locales verificadas

Referencias al árbol inspeccionado el 8/10; cambios previos preservados.

| Fuente real | Hecho observado |
|---|---|
| `backend/src/modules/providers/providers.module.ts:10` | Catálogo PokemonTcgIoProvider; precios TcgdexProvider. Los límites de pokemontcg.io no lo convierten en proveedor actual de precios. |
| `backend/prisma/schema.prisma:123` | CardPrice guarda identidad, valores y fetchedAt, sin upstream. |
| `backend/src/modules/providers/card-provider.interface.ts:40`; `backend/src/modules/providers/tcgdex.provider.ts:65,124`; `backend/src/modules/providers/tcgdex.provider.spec.ts:5` | RemoteCardPrice, adapter y fixtures locales no conservan/acreditan upstream. Esto no prueba ausencia en toda respuesta externa posible. |
| `backend/src/jobs/sync-prices.service.ts:52,115,267,362,395` | Consulta >=24 h/otro proveedor produce isStale; método público actual lee caché/DB y encola. Inserción usa fecha local. Fallback solo cuando no hay ninguna fila activa para esa carta. |
| `backend/src/common/sql/latest-price.ts:48`; `backend/src/modules/collections/collections.service.ts:1300`; `backend/src/modules/share/share.service.ts:390,444` | Items/agregados filtran proveedor/source/currency activos y variante exacta. Join proyecta solo market: ampliar metadatos sin N+1 ni cambiar selección. |
| `backend/src/modules/cards/cards.service.ts:115,773,870,938` | Ficha tiene isStale/deltas; historia sin variant elige mejor market del día entre variantes, no variante fija. |
| `backend/src/modules/collections/collections.service.ts:110,129,162,809,1350` | Colección/stats conservan totalValueUsd:number con COALESCE 0, incluso todo sin precio. |
| `backend/src/modules/share/share.service.ts:82,98,282,444,507` | Precio público allowlist; total number/null; agregados completos separados de lista hasta 500; vigencia antes de caché. |
| `backend/src/modules/collections/portfolio.service.ts:8,20,43`; `backend/prisma/schema.prisma:188` | Portfolio vacío0/desconocido null; snapshot guarda valueUsd,totalCards,unpricedCards y consulta repetida actualiza mismo día UTC. |
| `frontend/types/api.ts:63,264,285,318,364`; `frontend/lib/api/schema.ts:430,473` | Espejo/parsers manuales. PriceDto frontend declara priceArs:number/null; ficha backend produce objeto low/mid/high/market: divergencia preexistente, sin homogeneizar incidentalmente. |
| `frontend/components/collections/portfolio-overview.tsx:25`; `frontend/components/collections/collection-detail.tsx:427` | Historia usa cambio actual cliente; detalle infiere null de total0/faltantes: FE-03 sustituye esa inferencia por valuation.amount. |

Comentarios históricos de inFlight/CardsService hablan de proveedor directo en request; el método getPricesForCard real leído es lectura/cola. Separar estado observado de comentarios históricos. La restricción futura sigue siendo ningún request externo desde handler público; admin/worker son caminos diferentes.

La caché negativa puede guardar latestKnownPrices, incluido fallback (`sync-prices.service.ts:283`); no afirmar “fallback jamás cacheado” por docs antiguas. Positivo1 h, negativo6 h, edad Postgres24 h. No cambiar TTL, claves, cola ni ritmo.

## Tipos aditivos decididos

Los nombres/ubicaciones siguientes son handoff preciso. Mantener campos reales existentes, cardId donde ya existe, deltas y formas priceArs por endpoint. No extender la allowlist pública con campos privados.

```ts
type PriceFreshness = 'fresh' | 'stale' | 'unknown';
type AggregateFreshness = PriceFreshness | 'mixed';

interface PriceMetadataDto {
  evaluatedAt: string;             // ISO UTC del cálculo; no rejuvenece por cache hit
  freshness: PriceFreshness;        // consulta/proveedor, no actualidad del mercado
  upstreamUpdatedAt: string | null; // hoy null; nunca sustituto de fetchedAt
  upstreamFreshness: PriceFreshness;
}

interface CopyCoverageDto {
  totalCopies: number;
  pricedCopies: number;
  unpricedCopies: number;
  coverageRatio: number | null;
}

interface PriceRecencyDto {
  freshness: AggregateFreshness;
  freshCopies: number;
  staleCopies: number;
  unknownFreshnessCopies: number;
  upstreamFreshness: AggregateFreshness;
  oldestFetchedAt: string | null;
  newestFetchedAt: string | null;
}

interface ValueAggregateDto {
  amount: number | null;
  currency: 'USD';
  evaluatedAt: string | null;     // histórico null: instante exacto no persistido
  coverage: CopyCoverageDto;
  recency: PriceRecencyDto | null; // histórico null: antigüedad no persistida
}
```

Servidor nuevo produce campos descritos. Espejo/parser frontend tolera ausencia durante transición: ausencia significa metadatos desconocidos, nunca fresh/cobertura completa. Bloque presente se valida entero; no fabricar ceros para campos faltantes. Respuestas actuales nuevas: evaluatedAt/recency no-null; snapshots: ambos explícitamente null.

### Ubicación por DTO/endpoint

Todas las rutas llevan prefijo `/api`.

| DTO / endpoint real | Adición concreta |
|---|---|
| CardPriceDto, `GET /cards/:id/prices` | Cuatro campos PriceMetadataDto top-level en cada prices[]. Preservar identidad, fetchedAt, isStale, deltas y priceArs con forma propia de ficha. |
| PriceDto de colección, `GET /collections/:id/items`, `/duplicates` y altas/ediciones que devuelven item | Cuatro campos top-level dentro item.price. Sin fila sigue price:null; price.variant=item.variant. No añadir isStale donde no existe ni cambiar priceArs. |
| PublicReferencePriceDto, `GET /s/:slug` | Cuatro campos top-level en items[].price; variante sigue en item. No agregar cardId, low/mid/high, notas, IDs inventario, emails/sesión. |
| CollectionDto, `GET /collections`, `GET /collections/:id`, `POST/PATCH /collections` | Añadir valuation:ValueAggregateDto por colección, scope completo. Conservar totalValueUsd:number, totalValueArs y campos legacy; FE-03 muestra valuation.amount. |
| CollectionStatsDto, `GET /collections/:id/stats` | Añadir valuation sobre toda la colección. Mantener contadores legacy; cardsMissingPrice privado cuenta cartas distintas, no copias. |
| PortfolioDto, `GET /portfolio` | Añadir valuation raíz: amount=valueUsd; coverage coherente con totalCards/unpricedCards. Scope todas las colecciones del usuario; una copia registrada en dos colecciones cuenta en ambas. |
| PortfolioDto.history[] | Añadir valuation: amount=point.valueUsd; coverage de ese snapshot; evaluatedAt=null, recency=null. date continúa como día UTC. |
| PortfolioDto.topCards[] | Añadir reference con provider/source/currency/fetchedAt y cuatro campos PriceMetadataDto; carta/variante/marketUsd ya en item. Mantener agrupación/límite5, sin coverage redundante. |
| PublicShareStatsDto, `GET /s/:slug` | Añadir stats.valuation sobre scope entero, no solo lista500. amount=stats.totalValueUsd. pricedGroups/cardsMissingPrice siguen grupos; totalCards son copias. |
| PriceHistoryPointDto, `GET /cards/:id/prices/history` | Añadir cuatro campos PriceMetadataDto por punto. provider/source/currency/variant siguen en envelope; variant puede ser null con “mejor disponible por día”. No inventar variante fija del punto. |

Sin endpoint nuevo ni auditoría de rankings/amigos/progreso por set. Esos mantienen contratos actuales; productores de interfaces compartidas pueden conservar ausencia compatible sin afirmar metadatos nuevos. Espejar tipos y parsers afectados en misma entrega BE-04. FE-03 implementa UI después de UX-03.

### Aritmética y estados

- totalCopies=SUM(quantity); pricedCopies=SUM(quantity) donde market no-null (incluye0); unpricedCopies=totalCopies-pricedCopies.
- ratio=pricedCopies/totalCopies; vacío null. amount=SUM(quantity×market), redondeado después de sumar. Vacío0; total>0/cotizadas0 null; parcial subtotal.
- Seleccionar fila antes de detectar ausencia: última con market=null no salta a anterior/mid.
- freshCopies+staleCopies+unknownFreshnessCopies=pricedCopies. Sin market está en unpricedCopies, no en estos contadores.
- Agregado: conjunto de estados de copias cotizadas vacío/solo unknown => unknown; solo fresh => fresh; solo stale => stale; **dos o tres estados => mixed**, incluidos unknown+fresh, unknown+stale y los tres. Misma regla para upstreamFreshness.
- oldest/newestFetchedAt: fechas válidas de filas que contribuyen al subtotal; null si ninguna válida, excluir inválidas/futuras sin epoch ficticio. Intervalo válido no elimina copias de edad unknown.
- Histórico: totalCopies=point.totalCards; unpricedCopies=point.unpricedCards; pricedCopies=diferencia; ratio derivado. Exacto para esa observación persistida. recency=null aunque ratio=1: cobertura conocida no prueba antigüedad.

### Fechas, reloj y upstream

Un único evaluatedAt por cálculo/respuesta actual para filas y agregados. Validar fechas ISO UTC reales. Edad negativa por fecha futura/ausente/no parseable => unknown, sin etiquetar fresh. No usar epoch/date-only/evaluatedAt como reemplazo al clasificar.

FetchedAt válido no futuro: proveedor distinto al activo (incluido null legacy) => stale; activo edad<24 h => fresh; activo edad>=24 h => stale. Fecha no evaluable => unknown; provider sigue visible y UI informa legacy/otra API separado. isStale actual se conserva: no inferir false=>fresh cuando freshness=unknown.

Upstream null/inválido/futuro => upstreamUpdatedAt=null, upstreamFreshness=unknown. Fecha verificable ligada a cotización => ISO UTC real; edad<24 h fresh o >=24 h stale. Umbral informativo común, **sin cambiar caché/refresco ni certificar precio realizable**. Fecha genérica del catálogo/otro mercado no califica. Hoy todos upstream null; captura verificable posterior requiere evidencia local atribuible, no request real para desbloquear UX.

Caché mantiene evaluatedAt del cálculo: **cache hit no lo vuelve “ahora”**. Freshness expresa estado en ese instante, mostrado con evaluación fechada, no garantía de frescura al descargar. Redis de precios puede recalcular metadatos al deserializar; caché pública conserva instante del agregado/items. Campos ausentes en entradas legacy se tratan como desconocidos. Implementación verifica serialización y coherencia, sin ampliar TTL ni alterar vigencia.

## Selección por endpoint

1. Ficha primero usa filas activas del mercado/moneda actuales. **Solo si ninguna variante activa existe** usa un único proveedor fallback (MAX(fetchedAt) más reciente entre otros, incluido null legacy), última fila por variante. No rellenar variantes faltantes con legacy si ya existe activa.
2. Items/colecciones/portfolio/share: solo proveedor/mercado/moneda activos, variante exacta. Sin fallback ni mezcla activo/legacy.
3. Historia: provider solicitado o activo default, mercado/moneda actuales. Variant explícita restringe; ausente conserva mejor market por día pudiendo cambiar de variante. Un punto/día UTC, sin presentar esa serie como variante fija.

## Ejemplos y copy base para UX-03

| Caso | Resultado/mensaje |
|---|---|
| Vacío | total0/priced0/ratio null/amount0; recency unknown, contadores0/fechas null. “Todavía no hay cartas en esta colección”. |
| Todo sin market | 3 copias: amount=null/priced0/unpriced3/ratio0. “Sin referencia de precio para estas 3 copias”. No USD0. |
| Cero válido | 2 copias a0 +1 a12.50 => amount12.50/priced3/ratio1. Si todas a0: amount0 con cobertura total. |
| Parcial mixto | 2 copias a10 fresh +1 a4 stale +1 sin precio => amount24/ratio.75/fresh2/stale1/unknown0/mixed. “Referencia parcial · 3 de 4 copias con precio”. |
| Consulta hoy/upstream ausente | freshness fresh, upstream null/unknown. “Consultado [fecha] · Fecha de actualización de la fuente no disponible”. No “precio actualizado”. |
| Consulta hoy/feed viejo verificable | freshness fresh/upstream stale con fecha distinta: “Consultado [hoy] · Fuente actualizada [fecha antigua] · Referencia anterior”. |
| unknown+fresh / unknown+stale | 1 copia cotizada con fecha inválida +1 válida => priced2/unknown1/mixed en ambos. Explicar consulta sin fecha disponible. |
| Fallback | Consulta válida: stale aunque de hoy, provider visible. “Referencia de otra API/legacy”; no afirmar otro mercado si source sigue tcgplayer. |
| Histórico total | snapshot total3/unpriced0 => ratio1/recency null. “Valor observado [día UTC] · 3 de 3 copias con precio · Antigüedad de las referencias no registrada”. |

## ARS, historial, compatibilidad y persistencia

Fuente/mercado/moneda original/variante visibles. ARS: **“Referencia internacional convertida”**, con tipo/fecha del cambio actual cuando el consumidor ya los tiene. “Condición registrada, sin ajuste del valor”. No precio realizable argentino.

Snapshots: observaciones al consultar, actualizables mismo día UTC, hasta365 puntos existentes. Cambios entre puntos pueden incluir cantidad/composición/cobertura/precios: “Valor observado de tus colecciones”; “Puede cambiar por tus cartas, cantidades y referencias de precio”. No ganancia/rentabilidad/ROI. USD histórico convertido al cambio actual cliente: “Historial en USD convertido al cambio actual; no representa valores históricos en pesos”. Mantener gráfico/top cards; no programar snapshots/FX histórico inventados.

Mantener formas/campos legacy; valuation.amount es monto canónico nuevo. Público/portfolio ya tienen null correcto y deben coincidir con valuation.amount. Privado conserva number legacy: no cambia firma para incorporar ausencia honesta.

Público: proyección explícita allowlist también de adiciones; no DTO privado completo. Mantener total completo/lista500/truncated, ownership, vigencia antes de caché, API404, ausencia de payload/metadata sensible, Next no-store/noindex y SW. Next streaming genérico200 sin payload ya fue aceptado; no exigir404 de Next.

No migración para guardar upstream solo null ni duplicar cobertura snapshot. Captura upstream verificable posterior requiere propagación provider→sync→storage→DTO y migración aditiva nullable, filas anteriores NULL; no bloquea UX-03. No editar migraciones, migrate dev ni pg_trgm/GIN. Fotos no persistidas.

Draft FE-01 exige atributos explícitos en grupos listos; no afirmar que todos sus drafts carecen variant/condition. Carta elegida permanece sin precio; guardado/idempotencia no cambia.

## Validación prevista de implementación (no ejecutada)

Fixtures/pruebas enfocadas:

- Variante/proveedor/source/currency exactos; activa vieja/legacy nueva; activa parcial sin rellenar; agregado sin fallback; última market=null sin salto a anterior/mid.
- Cero/vacío/desconocido/parcial/cantidades; copias vs grupos/cartas; share truncado con total completo.
- 23h59m/24h exactas; fechas inválidas/futuras/ausentes; reloj único; unknown+fresh/unknown+stale/tres estados; consulta fresh/upstream unknown o stale.
- Snapshot con cantidades cambiadas después: cobertura propia exacta/recency/evaluatedAt null; upsert mismo día, sin reconstrucción/migración redundante.
- DTO/espejo/parser/caché legacy; evaluatedAt no rejuvenecido; priceArs por endpoint preservado; allowlist/vigencia con caché caliente/no-store/noindex.
- FE-03 selector de variante, estados accesibles/ARS actual, sin ganancia/precio local; carta elegida sin precio preservada.

Revisión enfocada por tarea; **pnpm run stop + pnpm run check y flujo API/web aislado/limpieza al cerrar BE-04+FE-03**, según 11-orquestacion. Sin request real a proveedores. Documento no acredita implementación, tests, stack, lectores de pantalla, dispositivos ni comprensión9/10 con participantes.

## Handoff

UX-03 puede comenzar con estos nombres, ubicaciones, estados y copy base: no quedan alternativas técnicas/persistencia que bloqueen su especificación. BE-04 implementa adiciones/espejo/parsers y preserva selección/cachés/cola. FE-03 consume contrato implementado tras UX-03. Futuras áreas: Luna; revisión/corrección: Sol HIGH. Coordinador conserva cierre de IDs/lote.
