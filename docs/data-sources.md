# Fuentes de datos

> De dónde salen las cartas, los precios y la cotización. Y qué pasa cuando
> la fuente muera.

## Fuentes implementadas — revisión local 20/10/2026

| Fuente | Uso en la app | Integración |
|---|---|---|
| pokemontcg.io v2 | Catálogo, sets e imágenes de referencia | `CARD_DATA_PROVIDER`, catálogo espejado en PostgreSQL |
| TCGCSV | Única fuente activa de precios e histórico TCGplayer USD | `PRICE_PROVIDER` / `TcgcsvPriceProvider`, ingesta por grupo |
| DolarApi | Conversión USD→ARS blue/oficial | Caché backend y fallback de último conocido |
| Scrydex | Alternativa estudiada | Sin adaptador ni binding implementados |

Este estado describe el código local. Condiciones comerciales, disponibilidad,
licencias y límites publicados deben revisarse con fecha antes de una integración
nueva o publicación; no se certifican de nuevo en esta limpieza documental.

Catálogo y precios tienen fuentes e identidades separadas. Cambiar el binding
requiere implementar y verificar el adaptador y sus mappings: no basta renombrar
un proveedor. Las PK canónicas de cartas deben conservarse porque son FK de las
colecciones.

## TCGCSV — única fuente activa de precios

Por decisión del usuario del 20/10/2026, la aplicación utiliza sólo las
observaciones TCGCSV en cartas, búsqueda, colecciones, portafolio, amigos y
compartidos. El proveedor TCGdex, su mapper, worker y ciclo diario se retiraron
del código el 24/10. Los registros anteriores se conservan
como historia y no completan faltantes de la fuente nueva.

Las lecturas de precio usan PostgreSQL y sólo encolan grupos locales. No hay
fallback a otros proveedores ni una caché de carta que demore la publicación de
un build confirmado. Los totales exigen variante, mercado y moneda exactos.
Consultar [precios](../backend/docs/pricing.md) y [providers](../backend/docs/providers.md).

- Descubrimiento de grupos cada 10 min; la asociación exige identidad segura.
- Ciclo de precios 21:00 UTC para los sets habilitados; reanudación cada 15 min.
- `last-updated.txt` y el build señalan nuevas publicaciones. Se guardan fecha de
  recepción, fecha del feed y estado de la descarga; el feed no demuestra la hora
  real de la cotización.
- Un mismo archivo de precios se reserva como máximo una vez por ventana de
  24 h, incluso al pedir un ciclo manual. Los topes internos anteriores de
  40 grupos/500 requests y lotes de diez fueron retirados.
- Worker serial, leases persistentes, caché de respuestas recibidas y publicación
  atómica; respetar 429/Retry-After y no resetear fechas para forzar descargas.
- Los días no observados quedan como huecos. No se supone que exista archivo
  histórico descargable ni se fabrican valores para completar una gráfica.

Operación: `pnpm run prices:sync` solicita un ciclo y muestra avance;
`pnpm run prices:status --watch` sólo observa; `pnpm run prices:sets` administra
el alcance. Ctrl+C cierra la vista, no cancela los jobs del backend.
Ver [jobs](../backend/docs/jobs.md), [comparación](../frontend/docs/comparison.md)
y [cierre del plan diario](plans/precios-diarios-priorizados-2026-10-18-estado.md).

## pokemontcg.io — catálogo (y precios muertos)

### Estado: deprecada

- No se dan API keys nuevas.
- Las keys existentes funcionan hasta el **1 de marzo de 2027**.
- El proyecto funciona **sin key**, con límites más bajos.

La propia documentación de la API recomienda migrar a Scrydex.

### Hallazgo histórico: feed de precios congelado

Éste fue el hallazgo que motivó separar catálogo y precios; las mediciones
siguientes corresponden a esa investigación, no a un nuevo sondeo actual. El `rawJson` de cada carta trae
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

Estos límites rigen el sync de catálogo. No aplicarlos como cuotas globales de
TCGCSV, que conserva su política de descarga por archivo.

### La API es lenta e inestable

Medido en pruebas reales:

- **~8,7 s** por request de cartas (a veces 500 ms, a veces 17 s)
- **500 y 502 frecuentes** (~50 % de los requests fallan en algunas corridas)
- A veces responde HTML en vez de JSON

Por eso existen:
- `fetchWithRetry` en el provider: 4 intentos, backoff 1→2→4→8 s con jitter
- `withPageRetry` por página en el sync: 8 intentos, hasta 30 s de espera
- El sync **reanudable**: guarda cursor y completitud por proveedor en PostgreSQL
  (`sync_state`). Si una página falla no avanza el cursor. El lock de exclusión
  del sync sigue en Redis con token y TTL renovable.

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

El sync no actualiza las referencias de precios activas. Éstas se reciben
bajo demanda o mediante los ciclos diarios (ver [precios](../backend/docs/pricing.md)).

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

## Scrydex — alternativa futura, sin integración activa

No hay adaptador ni binding Scrydex implementados. Cualquier decisión futura
exige verificar condiciones actuales del proveedor, permisos, coste y mappings,
con evidencia fechada. No se mantienen aquí cifras comerciales ni estimaciones de
precisión como si fueran resultados de PokéScan.

El reconocimiento vigente es **DINOv2 local autenticado**, sin OCR ni un endpoint
público alternativo. Una alternativa de catálogo/precios no autoriza reemplazar
ese motor ni persistir fotos. Ver [escáner](../frontend/docs/scanner.md).

Una migración sólo de precios debe preservar IDs del catálogo, namespaces de
caché, procedencia, cola, histórico y política de valuación. Una migración del
catálogo necesita reconciliar además las FK de las colecciones. Ver las opciones
en [providers](../backend/docs/providers.md); son trabajo futuro, no un cambio de
configuración listo para activar.

### Lo que ya está listo para el día del swap

Migrar precios no es cambiar un string: es que dos fuentes convivan en
`card_prices` sin mezclarse. Eso ya está resuelto.

- `card_prices.provider` + `card_external_ids` / `card_set_external_ids`: las
  escrituras de la fuente nueva no tocan las PK canónicas, así que colecciones,
  links y rutas siguen apuntando a lo mismo.
- `card_prices.provider = NULL` en las filas legacy sin procedencia probada: no se les atribuye
  procedencia que no se puede probar. `?provider=legacy` las consulta, y la app
  las muestra como último conocido con `isStale: true`.
- Rankings, totales y links públicos leen **solo** el proveedor activo, por
  `defaultSource` y `defaultCurrency`. Un ranking mezclando dos APIs es un
  número que no existe.
- La caché de precios está namespaced por proveedor (`prices:v2:<id>:<cardId>`),
  así que el swap no invalida ni pisa la entrada de la otra fuente.
- Las claves de lectura de friend/share están namespaced por proveedor, porque
  sus snapshots son números de valuación y no solo listas de cartas.

El mecanismo diario actual se limita a los sets habilitados y utiliza la cola
persistente y el gate compartido. Una eventual fuente nueva necesita pruebas del
adaptador y de sus consumidores; los totales no deben atribuirle precios antes
de recibir observaciones válidas.

## Reglas para no romper el rate limit

1. **Nunca** llamar a la fuente desde un handler público.
2. Los precios pasan por `SyncPricesService`, que lee las observaciones TCGCSV confirmadas en PostgreSQL.
3. El sync de catálogo respeta el límite de pokemontcg.io (30/min, 1.000/día).
   La cola TCGCSV conserva una descarga por archivo cada 24 h, ejecución serial
   y pausas 429/Retry-After; no consume la cuota de pokemontcg.io.
4. Los jobs de sync son los únicos autorizados a paginar el catálogo entero.
5. Antes de agregar cualquier llamada externa, preguntate si podría pasar por
   el servicio de precios o por la cola.
