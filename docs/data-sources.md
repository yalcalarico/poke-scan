# Fuentes de datos

> De dónde salen las cartas, los precios y la cotización. Y qué pasa cuando
> la fuente muera.

## Resumen

| Fuente | Qué da | Costo | Estado |
|---|---|---|---|
| **pokemontcg.io v2** | catálogo, sets, imágenes | Gratis | ⚠️ **Deprecada** (ya no da precios) |
| **tcgdex.dev** | **precios** TCGPlayer (USD) + Cardmarket (EUR) | Gratis | ✅ Activa, sin key |
| **DolarApi.com** | cotización USD→ARS | Gratis | ✅ Activa |
| **Scrydex** | catálogo + precios + **Vision API** | Desde USD 29/mes | ✅ Activa, sucesora oficial |

**Catálogo y precios vienen de fuentes distintas.** El catálogo sigue espejándose
desde pokemontcg.io porque sus datos de cartas están vivos y son la base de la
búsqueda y del escáner; los precios se piden a tcgdex porque el feed de precios
de pokemontcg.io quedó **congelado** (ver abajo). Los dos están detrás de tokens
de inyección separados (`CARD_DATA_PROVIDER` y `PRICE_PROVIDER`), así que
cambiar cualquiera de los dos es cambiar una clase.

## tcgdex.dev — la fuente de precios

| | |
|---|---|
| Base | `https://api.tcgdex.net/v2/en` |
| Auth | **ninguna**, no hay que registrarse |
| Límite | **sin límite publicado** ("be considerate") |
| Frescura | TCGPlayer ~cada 1 h, Cardmarket diario |
| Extras | REST + GraphQL, 10+ idiomas, base de datos open source en GitHub |

Se eligió sobre [pokewallet.io](https://pokewallet.io) comparando documentación
y probando en vivo. Resumen de por qué:

| Criterio | tcgdex | pokewallet |
|---|---|---|
| Auth | ninguna | registro + API key |
| Límite free | sin límite | 100/h · 1.000/día |
| IDs de carta | deterministas (`{set}-{localId}`) | hashes opacos (`pk_…`) → 2 requests por lookup |
| Precios | embebidos en la carta (verificado en vivo) | `pricing` en la carta, no verificable sin key |
| Variantes | `normal`, `holofoil`, `reverse-holofoil`, `1st-edition*`, `unlimited*` | `Normal`, `Holofoil`, `Shadowless`, … |
| Imágenes | URLs deterministas y hotlinkeables | endpoint **con auth** por carta |
| Datos | estructurados, open source | strings aplanados (`hp: "200.0"`), 2 pipelines sin normalizar |
| Proyecto | comunitario, años, 10M requests/mes | un dev, v1.x, sin SLA |

El plan era "migrar todo a una fuente", pero resultó que el problema no era la
fuente sino **cuál fuente de qué**: con el split, migrar precios a Scrydex
después es cambiar una clase y no mover ningún ID de carta.

### Limitaciones conocidas de tcgdex

- **Matching de precios con casos raros**: a veces dos printings distintos de la
  misma carta quedan mapeados al mismo listing de TCGPlayer, y una carta regular
  muestra el precio de su SAR. Lo están arreglando con `variants_detailed`
  (IDs de marketplace explícitos por variante; ya asoma como `productId`).
- **Cartas sin precio**: Full Arts de eras viejas (BW, HGSS),Cards que solo
  existen en un mercado, y **lanzamientos recientes** sin listados todavía. Es lo
  que hace que `me55` (30th Celebration, lanzado hace días) no muestre precio:
  no es un bug nuestro, el precio aparece cuando el feed lo ingiere. El backend
  reintenta cada 6 h solo (caché negativa).
- **503 ocasionales**: el provider reintenta con backoff y, si sigue fallando,
  degrada a lo último conocido en vez de romper el endpoint.

## pokemontcg.io — catálogo (y precios muertos)

### Estado: deprecada

- No se dan API keys nuevas.
- Las keys existentes funcionan hasta el **1 de marzo de 2027**.
- El proyecto funciona **sin key**, con límites más bajos.

La propia documentación de la API recomienda migrar a Scrydex.

### El feed de precios está congelado

Este es el hallazgo que forzaron el split. El `rawJson` de cada carta trae
`tcgplayer`, pero con `updatedAt: "2023/03/27"` y sin claves `prices` en
muchos casos. Medido sobre las 20.670 cartas del catálogo:

| Cartas | Total |
|---|---|
| Con precios (congelados) | 19.545 |
| Con `tcgplayer` pero sin `prices` | 848 |
| Con `tcgplayer: null` | 277 |

Los sets salidos después de 2023 —incluida toda la era **Mega Evolution**— nunca
tienen precio de esa fuente. Para verificar que no era culpa del sync local se
consultó la API en vivo: `base1-8` (Machamp, Base Set) responde con el objeto
`tcgplayer` vacío de precios, igual que en nuestra copia.

Por eso `refresh()` **no** parsea más el `rawJson`: "refrescar" no refrescaba
nada, solo reescribía el mismo dato viejo con un `fetchedAt` nuevo.

### Límites sin key

| Límite | Valor |
|---|---|
| Requests por día | **1.000** |
| Requests por minuto | **30** |

Estos dos números explican casi todas las decisiones de arquitectura. **Es el
restricción más importante del proyecto.**

### La API es lenta e inestable

Medido en pruebas reales:

- **~8,7 s** por request de cartas (a veces 500 ms, a veces 17 s)
- **500 y 502 frecuentes** (~50 % de los requests fallan en algunas corridas)
- A veces responde HTML en vez de JSON

Por eso existen:
- `fetchWithRetry` en el provider: 4 intentos, backoff 1→2→4→8 s con jitter
- `withPageRetry` por página en el sync: 8 intentos, hasta 30 s de espera
- El sync **reanudable**: guarda `sync:cards:lastPage` en Redis. Si una página
  falla, no avanza el cursor, así que no pierde cartas.

### Qué usamos de la respuesta

El objeto `card` trae muchos campos. Guardamos en el schema lo que se usa y el
resto queda en `rawJson` (JsonB) para no perder nada:

```jsonc
{
  "id": "base1-4",
  "name": "Charizard",
  "supertype": "Pokémon",
  "subtypes": ["Stage 2"],
  "hp": "120",
  "types": ["Fire"],
  "number": "4",
  "rarity": "Rare Holo",
  "artist": "Mitsuhiro Arita",
  "set": { "id": "base1", "name": "Base", "releaseDate": "1999/01/09" },
  "images": { "small": "...", "large": "..." },
  "tcgplayer": {                       // ← precios
    "prices": {
      "holofoil": { "low": 449.99, "mid": 839.99, "high": 3499.1, "market": 944.53 }
    }
  },
  "rawJson": { /* todo lo anterior, tal cual */ }
}
```

### Las 7 claves de variante (trampa importante)

TCGPlayer nombra las variantes según la antigüedad del set. Contadas sobre las
20.670 cartas del catálogo:

| Clave | Cartas | Set |
|---|---:|---|
| `reverseHolofoil` | 12.463 | modernos |
| `normal` | 11.567 | modernos |
| `holofoil` | 7.286 | modernos |
| `1stEdition` | 673 | Base y antiguos |
| `unlimited` | 673 | Base y antiguos |
| `unlimitedHolofoil` | 164 | Base |
| `1stEditionHolofoil` | 159 | Base |

**Si el `VARIANT_MAP` no cubre las 7, 1.510 cartas quedan sin precio** aunque la
fuente lo tenga. Este bug existió y costó encontrarlo. Está documentado en
`backend/docs/providers.md`.

### El catálogo

- **20.670 cartas**, **176 sets**
- Se sincroniza con `pnpm run sync` → 83 páginas de 250 → ~90 requests
- Tarda ~15-20 min por la latencia de la API
- Es reanudable: se puede cortar y `pnpm run sync` sigue donde quedó

Los precios **no** vienen con el sync. Se piden bajo demanda (ver
`backend/docs/pricing.md`).

## DolarApi.com — la cotización

API abierta y gratuita hecha en Argentina. Devuelve las cotizaciones del dólar.

**Ojo con la forma de la respuesta:** la documentación y la mayoría de los
ejemplos online dicen `{ value, currency, timestamp }`, pero **la respuesta real
es un objeto con `moneda`, `casa`, `nombre`, `compra`, `venta` y
`fechaActualizacion`**, y `/v1/dolares` devuelve un **array**, no un objeto.

```json
{
  "moneda": "USD",
  "casa": "blue",
  "nombre": "Blue",
  "compra": 1540,
  "venta": 1560,
  "fechaActualizacion": "2026-09-25T20:58:00.000Z"
}
```

Nuestro backend usa **`venta`** (cuánto pagás por 1 USD), con fallback a `compra`.
También expone `blue` y `oficial`; **no existen** `mep` ni `ccl` en esta API.

Se cachea 1 h en Redis. Si la API se cae, se devuelve el último valor conocido
marcado como `stale`.

## Migrar a Scrydex — el plan

Scrydex es el sucesor oficial. Empieza en USD 29/mes (5.000 créditos) e incluye
lo que pokemontcg.io no tenía: **Vision API** (`POST /vision/v1/cards/identify`),
que identifica una carta desde una imagen con ~99 % de precisión y elimina por
completo el pipeline de OCR. Además cubre los casos donde tcgdex se traba:
IDs de marketplace explícitos por variante y Reportes de población.

Por qué no migramos ya:

1. Cuesta plata.
2. El OCR actual acierta 7/8, que es usable con la UI de confirmación.
3. tcgdex cubre gratis el problema que nos traía (precios congelados).

Lo bueno del split catálogo/precios es que **la migración se puede hacer por
partes**. Las dos opciones son baratas:

| Migrar | Costo | Riesgo |
|---|---|---|
| **Solo precios** a Scrydex | ~1 día | Bajo: cambiar `PRICE_PROVIDER` + refazer el mapeo de sets |
| **Vision API** (OCR) | ~1 día | Medio: reemplaza `lib/scanner/`, se puede dejar el OCR como fallback |
| **Catálogo** a Scrydex | ~1 semana | Alto: los IDs de carta son FK de las colecciones de los usuarios |

El paso 1 de los tres es siempre el mismo y ya está hecho como ejemplo:
**escribir la clase del provider y cambiar una línea del binding**. Ver
`backend/docs/providers.md` para el caso de los precios y para las 3
opciones de migración del catálogo.

### Lo que ya está listo para el día del swap

Migrar precios no es cambiar un string: es que dos fuentes convivan en
`card_prices` sin mezclarse. Eso ya está resuelto.

- `card_prices.provider` + `card_external_ids` / `card_set_external_ids`: las
  escrituras de la fuente nueva no tocan las PK canónicas, así que colecciones,
  links y rutas siguen apuntando a lo mismo.
- `card_prices.provider = NULL` en las 180 filas previas: no se les atribuye
  procedencia que no se puede probar. `?provider=legacy` las consulta, y la app
  las muestra como último conocido con `isStale: true`.
- Rankings, totales y links públicos leen **solo** el proveedor activo, por
  `defaultSource` y `defaultCurrency`. Un ranking mezclando dos APIs es un
  número que no existe.
- La caché de precios está namespaced por proveedor (`prices:v2:<id>:<cardId>`),
  así que el swap no invalida ni pisa la entrada de la otra fuente.
- Las claves de lectura de friend/share están namespaced por proveedor, porque
  sus snapshots Siam números de valuación y no solo listas de cartas.

Lo que falta para el swap, y es lo único: **un backfill** que escriba las filas
del proveedor nuevo. Sin él, los totales valen cero desde el punto de vista del
usuario (que es la decisión correcta, ver `backend/docs/gotchas.md` §32).

## Reglas para no romper el rate limit

1. **Nunca** llamar a la fuente desde un handler público.
2. Los precios pasan por `SyncPricesService`, que ya aplica Redis + Postgres.
3. El sync de catálogo respeta el límite de pokemontcg.io (30/min, 1.000/día).
   La cola de precios tiene 2,3 s entre requests por cortesía hacia TCGdex; es
   otro proveedor y ese ritmo no consume la cuota de pokemontcg.io.
4. Los jobs de sync son los únicos autorizados a paginar el catálogo entero.
5. Antes de agregar cualquier llamada externa, preguntate si podría pasar por
   el servicio de precios o por la cola.
