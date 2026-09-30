# Providers — la frontera con la API externa

> Hay **dos** fuentes detrás de tokens de inyección: `CARD_DATA_PROVIDER`
> (catálogo, `PokemonTcgIoProvider`) y `PRICE_PROVIDER` (precios en vivo,
> `TcgdexProvider`), con el `VARIANT_MAP` de tcgdex y la traducción de IDs de
> set entre las dos.

## Por qué existe un provider

`api.pokemontcg.io` v2 **no da API keys** (la API está deprecada) y tiene
límites duros: **1.000 requests/día** y **30 requests/minuto**. De ahí salen
decisiones de arquitectura en todo el proyecto, y la primera es: **ningún
handler de request puede llamar a la API externa**. El catálogo ya está espejado
en Postgres y los precios se piden bajo demanda y cacheados.

Si toda la app hablara con pokemontcg.io en cualquier parte, cambiar de fuente
sería imposible sin reescribir el backend. El patrón `CardDataProvider` es esa
costura.

## Las dos fuentes y por qué están separadas

| | Catálogo | Precios |
|---|---|---|
| Token | `CARD_DATA_PROVIDER` | `PRICE_PROVIDER` |
| Provider | `PokemonTcgIoProvider` | `TcgdexProvider` |
| Fuente | `api.pokemontcg.io/v2` | `api.tcgdex.net/v2/en` |
| Auth | ninguna (sin key) | ninguna |
| Límite | 1.000/día · 30/min | sin límite publicado |
| Qué trae | cartas, sets,etadata, imágenes | precios TCGPlayer (USD) + Cardmarket (EUR) |

El split existe porque **el feed de precios de pokemontcg.io está congelado**
(`updatedAt: "2023/03/27"`): los sets salidos después —toda la era Mega
Evolution— nunca iban a tener precio. Sus datos de *cartas* sí están vivos, así
que el catálogo sigue saliendo de ahí. Ver [pricing.md](pricing.md) para los
números medidos.

Como cada fuente numera los sets con su propio esquema (`me55` en una,
`30th` en la otra), pedir un precio exige traducir: eso hace
`TcgdexSetMappingService`, que persiste el resultado en
`card_sets.tcgdexSetId` (ver [jobs.md](jobs.md)).

## La interfaz

`src/modules/providers/card-provider.interface.ts` define tres tokens de
inyección y tres contratos.

### `CARD_DATA_PROVIDER`

```ts
export const CARD_DATA_PROVIDER = Symbol('CARD_DATA_PROVIDER');

export const PROVIDER_IDS = {
  POKEMON_TCG_IO: 'pokemontcg.io',
  TCGDEX: 'tcgdex',
  SCRYDEX: 'scrydex',
} as const;

export interface PagedResult<T> {
  data: T[]; page: number; pageSize: number; total: number; totalPages: number;
}

export interface RemoteSet {
  id: string; name: string; series: string | null;
  printedTotal: number | null; total: number | null;
  releaseDate: string | null;          // string: la API manda "1999/01/01"
  logoUrl: string | null; symbolUrl: string | null;
  raw: unknown;                        // el objeto original, va a card_sets.rawJson
}

export interface RemoteCard {
  id: string; name: string; supertype: string; subtypes: string[];
  hp: string | null; types: string[]; number: string;
  rarity: string | null; artist: string | null;
  setId: string;                       // en pokemontcg.io viene anidado: raw.set.id
  imageSmall: string; imageLarge: string;
  regulationMark: string | null;
  language: string | null;
  raw: unknown;                        // va a cards.rawJson
}

export interface RemoteCardPrice {
  cardId: string; variant: string;
  low: number | null; mid: number | null; high: number | null; market: number | null;
  source: string;                      // mercado/listing: 'tcgplayer', no la API
  currency: string;                    // 'USD'
}

export interface CardDataProvider {
  readonly id: string;
  getSets(page: number, pageSize: number): Promise<PagedResult<RemoteSet>>;
  getCardsPage(page: number, pageSize: number): Promise<PagedResult<RemoteCard>>;
  getCard(id: string): Promise<RemoteCard | null>;
  getPricesForCard(
    card: RemoteCard | { id: string; tcgplayer?: unknown },
  ): Promise<RemoteCardPrice[]>;
}
```

Los tres tipos `Remote*` son **la forma normalizada de la fuente**: el schema de
Prisma, los DTOs y los DTOs del frontend no dependan de cómo se llame la API.
`raw` existe para no perder nada: `cards.rawJson` es lo que permite después ir a
buscar precios sin volver a pegarle a la API.

`id` es el identificador estable de la fuente y se persiste aparte de
`RemoteCardPrice.source`, que indica el mercado. Las PK existentes siguen siendo
canónicas: `card_external_ids` y `card_set_external_ids` guardan las relaciones
entre proveedor e IDs externos. La primera migración las carga para pokemontcg.io
y preserva los mappings TCGdex actuales. `SyncSetsService` y `SyncCardsService`
ya resuelven y registran aliases al sincronizar el proveedor actual; los jobs
rechazan otro `CARD_DATA_PROVIDER` hasta que se implemente una importación en
sombra que reconcilie sus IDs.

El mapper TCGdex mantiene los aliases junto con el campo transitorio
`tcgdexSetId`. También falla al iniciar si se intenta enlazarlo con otro
`PRICE_PROVIDER`; hace falta un mapper genérico antes de cambiar la fuente.

### `CARD_IDENTIFICATION_PROVIDER`

```ts
export const CARD_IDENTIFICATION_PROVIDER = Symbol('CARD_IDENTIFICATION_PROVIDER');

export interface IdentificationCandidate { cardId: string; score: number }

export interface CardIdentificationProvider {
  identify(imageBase64: string): Promise<IdentificationCandidate[]>;
}
```

La única implementación es `OcrLocalProvider`, que devuelve `[]` y loguea un
`debug`. El OCR real corre **en el cliente** (Tesseract.js), no en el server: el
contrato existe para poder pluggear un proveedor de visión server-side sin tocar
nada, pero hoy está sin usar.

### `PRICE_PROVIDER`

```ts
export const PRICE_PROVIDER = Symbol('PRICE_PROVIDER');

export interface RemotePriceSet { id: string; name: string }
export interface RemotePriceSetDetail { id: string; name: string; localIds: string[] }

export interface PriceProvider {
  readonly id: string;
  listSets(): Promise<RemotePriceSet[]>;
  getSetDetail(setId: string): Promise<RemotePriceSetDetail | null>;
  getCardPrices(cardId: string, setId: string, localId: string): Promise<RemoteCardPrice[]>;
}
```

Es un contrato **distinto** del de catálogo a propósito. El de precios no pagina
cartas ni trae metadata: pide una carta por (set, localId) y devuelve precios
listos para persistir. `cardId` viaja en el argumento para que el caller no
tenga que re-estampar cada fila.

`listSets` y `getSetDetail` existen solo para el mapeo de IDs: el primero para
matchear nombres, el segundo para validar que un set candidato contiene nuestros
números de carta antes de persistir el mapeo.

### El binding

`providers.module.ts` — `@Global()`:

```ts
@Module({
  providers: [
    { provide: CARD_DATA_PROVIDER, useClass: PokemonTcgIoProvider },
    { provide: CARD_IDENTIFICATION_PROVIDER, useClass: OcrLocalProvider },
    { provide: PRICE_PROVIDER, useClass: TcgdexProvider },
  ],
  exports: [CARD_DATA_PROVIDER, CARD_IDENTIFICATION_PROVIDER, PRICE_PROVIDER],
})
@Global()
export class ProvidersModule {}
```

Los consumers inyectan así:

```ts
// SyncCardsService (catálogo)
constructor(
  private readonly prisma: PrismaService,
  private readonly syncSetsService: SyncSetsService,
  private readonly redis: RedisService,
  @Inject(CARD_DATA_PROVIDER) private readonly provider: CardDataProvider,
) {}

// SyncPricesService (precios)
constructor(
  private readonly prisma: PrismaService,
  private readonly redis: RedisService,
  @Inject(TCGDEX_SET_MAPPING) private readonly mapping: Pick<TcgdexSetMappingService, 'resolve'>,
  @Inject(PRICE_PROVIDER) private readonly priceProvider: PriceProvider,
) {}
```

`@Inject(...)` explícito es necesario porque los tokens son `Symbol`, no clases:
sin el decorador, Nest no puede resolverlos por tipo. `TCGDEX_SET_MAPPING` es un
token propio (no la clase) para poder meter un stub en los tests del service de
precios sin levantar el módulo entero.

## `TcgdexProvider`

`src/modules/providers/tcgdex.provider.ts`. Mismo estilo que el otro: `fetch`
nativo, sin dependencias.

| Método | Request | Devuelve |
|---|---|---|
| `listSets()` | `GET /sets` | `{ id, name }[]` de los ~220 sets EN |
| `getSetDetail(setId)` | `GET /sets/{setId}` | Los `localId` de todas sus cartas |
| `getCardPrices(cardId, setId, localId)` | `GET /sets/{setId}/{localId}` | Precios mapeados a `RemoteCardPrice[]` |

Tres detalles que no son obvios:

1. **El `localId` va sin padding.** tcgdex acepta `"18"` para sets que
   internamente numeran `"018"` (verificado con `30th/18` y `miscp/1`). El
   provider igual tiene un fallback: si da **404** y el número es numérico,
   reintenta con `padStart(3, '0')`.
2. **404 no se reintenta salvo por padding.** Para números no numéricos
   (`XY99`) un 404 es un error real y se propaga, para que el caller degrade a
   lo último conocido.
3. **La moneda sale del payload** (`pricing.tcgplayer.unit`), con `USD` de
   fallback. Nunca está hardcodeada.

El `VARIANT_MAP` de tcgdex (kebab-case) al enum nuestro (camelCase):

```ts
const VARIANT_MAP: Record<string, string> = {
  normal: 'normal',
  holofoil: 'holofoil',
  'reverse-holofoil': 'reverseHolofoil',
  '1st-edition': 'firstEdition',
  '1st-edition-holofoil': 'firstEditionHolofoil',
  unlimited: 'unlimited',
  'unlimited-holofoil': 'unlimitedHolofoil',
};
```

Con `lowPrice`/`midPrice`/`highPrice`/`marketPrice` → `low`/`mid`/`high`/`market`.
Las claves `unit` y `updated` del objeto se ignoran: no son variantes.

Dos limitaciones conocidas de tcgdex, de su propio FAQ:

- El matching precio↔listing es por ID de marketplace y a veces mapea dos
  printings distintos al mismo listing (una carta regular mostrando el precio de
  su SAR). Lo están arreglando con un campo `variants_detailed` que ya asoma
  como `productId` por variante.
- Sets muy recientes y Full Arts de eras viejas pueden no tener precio. Es
  esperable y el backend lo maneja con la caché negativa de 6 h.

## `PokemonTcgIoProvider`

`src/modules/providers/pokemon-tcg-io.provider.ts`. **No usa `@nestjs/axios` ni
ninguna otra dependencia**: `fetch` nativo de Node 22, que ya trae timeout por
señal y retry sin dependencias.

```ts
const BASE_URL = 'https://api.pokemontcg.io/v2';
const USER_AGENT = 'PokemonCardsScannerApp/1.0 (+https://github.com/pokemon-cards-scanner-app)';

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const BASE_BACKOFF_MS = 1000;
const MAX_ATTEMPTS = 4;
```

Endpoints que usa:

| Método | Path | Nota |
|---|---|---|
| `getSets(page, pageSize)` | `/sets?pageSize=&page=` | |
| `getCardsPage(page, pageSize)` | `/cards?pageSize=&page=` | |
| `getCard(id)` | `/cards/:id` | devuelve `null` ante cualquier error, no propaga |
| `getPricesForCard(card)` | **no hace HTTP** | queda del diseño viejo, ver abajo |

> **`getPricesForCard` ya no se usa para precios.** Quedó en la interfaz cuando
> los precios salían del `rawJson` congelado. `SyncPricesService.refresh` ahora
> usa `PRICE_PROVIDER` (tcgdex). El método y su `VARIANT_MAP` quedan como
> referencia del formato de pokemontcg.io; si se borran, no cambia ningún
> comportamiento. **No lo vuelvas a usar como fuente de precios**: por diseño no
> hace red y devolvería los valores congelados de 2023.

### `fetchWithRetry`

```ts
private async fetchWithRetry(url: string, intentos: number = MAX_ATTEMPTS): Promise<any> {
  for (let attempt = 0; attempt < intentos; attempt++) {
    let waitMs = BASE_BACKOFF_MS * 2 ** attempt;         // 1s, 2s, 4s

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      });

      if (response.ok) return await response.json();

      if (!RETRYABLE_STATUS.has(response.status)) {
        throw new NonRetryableError(...);                // 404, 401 → sale YA
      }

      lastError = new Error(`pokemontcg.io respondió ${response.status} para ${url}`);
      const retryAfter = Number(response.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) waitMs = retryAfter * 1000;
    } catch (error) {
      if (error instanceof NonRetryableError) throw error;   // no reintenta
      lastError = error;
    }

    if (attempt < intentos - 1) await delay(waitMs + Math.floor(Math.random() * 250));
  }
  throw lastError instanceof Error ? lastError : new Error(`Fallo de red al consultar ${url}`);
}
```

Cuatro decisiones que importan:

1. **Solo se reintenta lo reintentable.** `RETRYABLE_STATUS` incluye los 5xx y el
   429; un 404 o un 400 salen inmediatamente con `NonRetryableError`, que el
   `catch` detecta por `instanceof` y re-lanza sin gastar más intentos.
2. **Backoff exponencial + jitter.** `1s · 2^attempt` más un random de hasta
   250 ms. Sin el jitter, todos los clientes que reintentan al mismo tiempo
   vuelven a caer juntos.
3. **Se respeta `Retry-After`.** Si la API manda `retry-after: 30`, se espera
   30 s en vez de 1 s. Es la señal de rate limit explícita.
4. **Timeout de 30 s por request.** La API externa tarda ~8 s por request
   normalmente; 30 s es el techo antes de abandonar.

La API **responde 500/502 con frecuencia y se demora ~8 s por request**. Por
eso el retry existe y por eso el sync de cartas es reanudable
([jobs.md](jobs.md)): si se corta a mitad, se retoma desde la última página
guardada en Redis en vez de perder las 20.670.

> Nota sobre el `getJson` que envuelve todo: devuelve `any`. El `mapSet`,
> `mapCard` y `mapPaged` castean campo por campo con `toNumber`,
> `toNullableString` y `toStringArray`, así que la forma externa está
> normalizada aunque el payload sea `any`. Son los únicos `any` del proyecto y
> están acotados a la frontera.

### `VARIANT_MAP` (el viejo, de pokemontcg.io)

Solo aplica a `getPricesForCard`, que ya no se usa para precios (ver la nota
arriba). Se documenta porque explica de dónde salió nuestro enum de 8
variantes: la fuente usa una **clave distinta según la antigüedad del set**. Los
sets modernos usan `normal` / `holofoil` / `reverseHolofoil`; los antiguos
(sobre todo **Base**) usan `1stEdition` / `unlimited` / `unlimitedHolofoil` /
`1stEditionHolofoil`.

```ts
const VARIANT_MAP: Record<string, string> = {
  normal:                'normal',
  holofoil:              'holofoil',
  reverseHolofoil:       'reverseHolofoil',
  '1stEditionNormal':    'firstEditionNormal',
  '1stEditionHolofoil':  'firstEditionHolofoil',
  // Sets antiguos: la 1ª edición y la reprint sin límite son ediciones
  // distintas de la misma carta, no una variante de brillo.
  '1stEdition':          'firstEdition',
  unlimited:             'unlimited',
  unlimitedHolofoil:     'unlimitedHolofoil',
};
```

Son **9 claves: 3 modernas + 4 de set antiguo + 2 más de set antiguo** que se
confunden con las anteriores. Conteo real sobre el catálogo de 20.670 cartas:

| Clave remota | Variante normalizada | Cartas con ese precio |
|---|---|---|
| `reverseHolofoil` | `reverseHolofoil` | 12.463 |
| `normal` | `normal` | 11.567 |
| `holofoil` | `holofoil` | 7.286 |
| `1stEdition` | `firstEdition` | 673 |
| `unlimited` | `unlimited` | 673 |
| `unlimitedHolofoil` | `unlimitedHolofoil` | 164 |
| `1stEditionHolofoil` | `firstEditionHolofoil` | 159 |

**Por qué las 7 claves extra**: `1stEditionNormal` y `1stEditionHolofoil` existen
porque hay set que sí distinguen normal de holo de primera edición. Pero
`1stEdition`, `unlimited` y `unlimitedHolofoil` son de sets que reportan la
primera edición y la reprint sin límite **sin desambiguar por brillo**: la
primera edición de un Base holo no trae sub-clave de brillo, solo `1stEdition`.

Con el mapa incompleto (las 3 modernas + `1stEditionNormal` + `1stEditionHolofoil`), **1.510 cartas del set Base se quedaban sin precio**
aunque la fuente los tuviera. La fila de la tabla donde la variante remota
suma 673 + 673 + 164 = 1.510 es exactamente eso. Después del fix, esas 1.510 cartas dejaron de perder el precio en cada refresco: el
servicio pasó a persistir la variante y el total por variante subió a las cifras
de la tabla.

**Cómo se usa**: en `getPricesForCard` se recorre el objeto `tcgplayer.prices`
y cada clave que **no** está en el mapa se descarta con `continue`. Una variante
que no de los cuatro números (low/mid/high/market), tampoco se persiste. Por eso
el mapa es la lista completa: agregar una clave nueva es agregar cobertura, no
cambiar un comportamiento.

Las 8 variantes del mapa coinciden exactamente con `CARD_VARIANTS` en
`collections/dto/card-variant.ts` — que es lo que acepta el DTO
`AddItemDto.variant`. Si agregás una clave al mapa, agregala también ahí.

## Cómo migrar (a Scrydex o a otra fuente de precios)

Hoy el catálogo y los precios son **providers distintos**, así que migrarlos es
independiente:

| Quiero cambiar… | Toco | Qué NO se toca |
|---|---|---|
| **Los precios** | `PRICE_PROVIDER`, mapping de sets, selección de lecturas y política de caché | PK canónicas y colecciones |
| **El catálogo** | `CARD_DATA_PROVIDER` + `card_external_ids` / `card_set_external_ids` | PK canónicas, búsqueda, scanner y colecciones |

### Migrar los precios (el caso fácil)

La interfaz ya normaliza la respuesta, pero cambiar el binding solo no alcanza:
las filas antiguas no se pueden atribuir con certeza, las consultas actuales no
filtran por proveedor y el mapper existente está ligado a TCGdex:

1. Implementá el adaptador y fixtures para monedas, variantes, vacíos y errores.
2. Añadí mappings de sets identificados por proveedor; no reutilices
   `tcgdexSetId` para IDs de otra API. El mapper TCGdex falla al iniciar si se
   intenta enlazarlo con otro proveedor.
3. Actualizá caché y lecturas para distinguir el proveedor activo de filas
   históricas o legado (`provider = NULL`). No sirvas estas últimas como frescas
   de la API nueva.
4. Probá el proveedor en sombra y compará cobertura/costo antes del canary y el
   cambio de binding. Conservá las series antiguas como una serie separada.

`card_prices.provider` y la clave de Redis ya guardan/aislan el proveedor activo,
pero las lecturas de histórico y los DTOs todavía necesitan un paso antes de una
migración real.

Lo que **no** se puede saltar es el mapeo de variantes: tiene que producir
exactamente los 8 valores de `CardVariant`, o los `collection_items`
guardados con `variant: 'holofoil'` dejan de sumar su precio en el
`LEFT JOIN`.

### Migrar el catálogo (el caso caro)

El catálogo guardado tiene los IDs de pokemontcg.io (`base1-4`) y **las
colecciones de los usuarios los tienen como FK**. `card_external_ids` y
`card_set_external_ids` ya contienen el backfill inicial, pero el sync todavía
no resuelve sus upserts a través de esos aliases y rechaza otros proveedores.
Ese paso debe completarse antes de promover otro catálogo.

Opciones, de menor a mayor esfuerzo:

1. **Sync a una tabla/DB paralela** y un flag por env que elige dónde leer. Los
   IDs de pokemontcg.io quedan sirviendo mientras tanto.
2. **Tabla de mapeo** `card_id_map(pokemonId, nuevoId)` y resolver el
   `cardId` del `CollectionItem` en el service. Es la opción limpia pero
   toca `addItem`, `listItems`, `share` y `friends`.
3. **Migración de datos**: actualizar `cards.id` en sitio. Con `onDelete:
   Cascade` en `collection_items`, hay que actualizar las FKs en una
   transacción y el `@@unique` compuesto puede entrar en conflicto si el
   destino ya existe.

La opción 1 es la más segura para una migración sin downtime. Es exactamente lo
que se hizo al revés con tcgdex: en vez de migrar los IDs de las cartas, se
mapeó **un ID por set** (`card_sets.tcgdexSetId`) y se dejó el catálogo
intacto.

### Sobre Scrydex en particular

Scrydex es el sucesor de pokemontcg.io (mismo equipo, **$29/mes sin free tier**,
~160 requests/día con el plan más chico). Da API key, precios de más fuentes y
sets de otros juegos, y además cubre `variants_detailed`-style: IDs de
marketplace explícitos por variante, que es justamente lo que tcgdex todavia no
resuelve bien (el bug de una carta regular mostrando el precio de su SAR).

Si se migra **solo** el precio a Scrydex, el catálogo se queda en pokemontcg.io
y no hay que mover ningún ID. Si además se migra el catálogo, es el trabajo de
la opción 1/2/3 de arriba.

### Lo que NO hay que hacer

- **No** llamar a la fuente externa desde un controller. Si aparece un
  `await priceProvider.getCardPrices(...)` dentro de un handler de request,
  rompen el modelo de caché de dos capas de [pricing.md](pricing.md).
- **No** cambiar los nombres de las 8 variantes normalizadas: están en el enum
  del DTO, en `card_prices.variant` y en el `@@unique` de
  `collection_items`.
- **No** borrar `cards.rawJson` esperando sacarle precios: ahí quedó el
  histórico congelado de pokemontcg.io y sirve para diagnóstico.
- **No** subir `prisma` a 7 esperando un `prisma migrate` más cómodo. Ver
  [gotchas.md](gotchas.md).

## Ver también

- [pricing.md](pricing.md) — las capas de caché y quién dispara el refresco
- [jobs.md](jobs.md) — el mapeo de IDs de set y cómo se llena el catálogo
- [gotchas.md](gotchas.md) — el bug del `constructor(baseUrl: string)` que hizo
  que hoy sea un campo privado
