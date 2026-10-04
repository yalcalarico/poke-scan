# Testing — cómo escribir specs en este proyecto

> Vitest 4 con 11 archivos y 128 tests. Lo más importante: **los specs
> comparten la base de datos de desarrollo y por eso corren de a uno**. Después,
> el patrón de cleanup, cómo testear `$queryRaw` y cómo testear Redis.

## Estado actual

| | |
|---|---|
| Runner | Vitest 4.1 (`vitest run`) |
| Config | `vitest.config.ts` (`**/*.spec.ts`) y `vitest.config.e2e.ts` (`**/*.e2e-spec.ts`) |
| Globals | `globals: true` + `types: ["vitest/globals", "node"]` en `tsconfig.json`: `describe`/`it`/`expect`/`vi` no se importan |
| Archivos | 19 `.spec.ts` · 1 `.e2e-spec.ts` |
| Tests | 320, ~45 s |
| Lint | oxlint type-aware corre sobre `src/` y `test/` |

| Spec | Qué cubre |
|---|---|
| `app.controller.spec.ts` | `GET /health`: sano, degradado, sin Redis configurado |
| `auth.service.spec.ts` | registro, login, hash del refresh, rotación, reuso, expiración, logout |
| `cards.service.spec.ts` | búsqueda con trigram, `getById` 404, `getCardWithPrices` con rate cacheado, `sort=price` global |
| `collections.service.spec.ts` | increment de `quantity`, ownership, stats, 409, cascadas, filtros, marca de intercambio del alta |
| `share.service.spec.ts` | slug, caché, 404 de enlace vencido, `truncated` |
| `friends.service.spec.ts` | búsqueda, solicitudes, responder, 403/404, baja, bloqueo |
| `currency.service.spec.ts` | feature flag, caché 1 h, `stale` >48 h, DolarApi caído, valores saneados |
| `tcgdex.provider.spec.ts` | mapeo de las 7 variantes, 404 con fallback de padding, retry de 503, parsing defensivo |
| `tcgdex-set-mapping.service.spec.ts` | matcheo por nombre / por ID, validación, miss marker, error de red sin marcar miss |
| `sync-prices.service.spec.ts` | refresh en vivo, TTL negativa, no borra previos ante fallo, frescura de 24 h, ritmo global |
| `price-queue.service.spec.ts` | dedupe, claim con `SKIP LOCKED` entre dos instancias, backoff, recuperación de `processing` abandonados, ritmo global, worker |
| `price-backfill.service.spec.ts` | qué cartas necesitan precio, orden por antigüedad, límite de corrida, y que **no** llame al proveedor |
| `card-prices-retention.service.spec.ts` | consolidación a un punto por día, que la última fila de un grupo no se borre nunca, y que el precio de referencia del delta sobreviva |
| `sync-cards.service.spec.ts` | IDs canónicos + cursor reanudable: reanuda sin re-traer, omite el completo con un request, `force`, parcial no marcado completo |
| `sync-state.service.spec.ts` | el cursor de `sync_state` y la reconciliación de jobs abandonados al arrancar |
| `catalog-sync.service.spec.ts` | lock + `ScanJob`, y que un segundo `start` no arranque nada |
| `scheduled-jobs.service.spec.ts` | kill switches de los tres crons, periodicidades, y que un fallo no tumbe el proceso |
| `redis.service.spec.ts` | locks, y degradación: `WRONGTYPE` real para ver que 10 fallos dan 1 warn |
| `test/global-setup.ts` | (no es spec) el guard que impide correr contra la base equivocada o con un backend vivo |

## La base de tests es otra

Los specs corren contra `DATABASE_URL_TEST`, o contra una base **derivada** de
`DATABASE_URL` con el nombre terminado en `_test`. Por omisión **nunca tocan la
base de desarrollo**, sin configurar nada.

```bash
pnpm run test:db:setup    # crea pokemon_cards_test una vez, como copia
pnpm run test:backend
```

La copia es una `pg_dump` de la base de desarrollo, y no una base vacía, porque
varios specs dependen del catálogo espejado: `cards.service.spec` mide el tramo
cotizado de `sort=price` sobre las 20.670 cartas reales y el reconocimiento visual DINOv2
rankea candidatos sobre las mismas. Con una base vacía no tendrían nada que
medir.

La resolución está en `test/test-env.ts`: `DATABASE_URL_TEST` gana; si no, se
deriva de `DATABASE_URL`. Y `vitest.config.ts` la inyecta con `test.env`, porque
**los specs no leen `process.env`**: instancian `PrismaClient` y Prisma carga
`.env` por su cuenta. Un guard que mirara `process.env.DATABASE_URL` estaría
viendo una variable vacía y no dispararía nunca.

### El guard del arranque

`test/global-setup.ts` corre antes que cualquier spec y **se niega a correr** si:

1. Hay algo escuchando en el puerto de la API.
2. La base resuelta no tiene "test" en el nombre.

El primero parece obvio hasta que se explicó: con la cola de precios
persistente, el worker del backend drena la **misma** `price_refresh_jobs` que
los specs: un test encolaba un job y el worker se lo llevaba antes de que el test
lo reclamara. La suite quedaba flaky sin que el código tuviera nada de malo, y
el mensaje de error —"expected null not to be null"— no señalaba para nada.

**En la práctica: `pnpm run stop` antes de correr los tests.**

## `fileParallelism: false` — y por qué

`vitest.config.ts`:

```ts
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    env: { DATABASE_URL: resolveTestDatabaseUrl() },
    // Los specs comparten base y hacen deleteMany() de `users`: correrlos en
    // paralelo hace que una suite borre los datos de la otra a mitad de test.
    // Se ejecutan de a uno, en un solo hilo.
    fileParallelism: false,
    globalSetup: ['./test/global-setup.ts'],
  },
});
```

**No es una preferencia de estilo: es una corrección.** Los specs usan la base
de tests y el cleanup de casi todos es:

```ts
await prismaClient.user.deleteMany({ where: { email: { endsWith: '@test.local' } } });
```

Con los archivos en paralelo, `auth.service.spec.ts` (que hace
`user.deleteMany()` **sin filtro**, `auth.service.spec.ts:57`) borra los
usuarios de `friends.service.spec.ts` en mitad de un test. El síntoma no es un
fallo de aserción sino errores de **foreign key**:

```
ERROR: update or delete on table "users" violates foreign key constraint
       "collection_items_..." on "collection_items"
```

o bien `NotFoundException` donde se esperaba un item. Ambos son flaky y
dependen del orden de arranque.

**No lo saques.** Si algún día querés paralelizar, la precondición es una base
separada por worker (`DATABASE_URL` por shard) o `pgTAP`/Testcontainers. Mientras
se comparte la DB, los specs son seriales.

El mismo razonamiento aplica a Redis: los specs de `currency` precargan
`currency:usd:blue` y lo borran en `beforeEach`. Con dos suites de moneda
corriendo en paralelo se pisarían.

## Comandos

```bash
pnpm run test         # vitest run — la suite completa (~45 s)
pnpm run test:watch   # vitest, watch
pnpm run test:cov     # vitest run --coverage (v8)
pnpm run test:debug   # vitest --inspect-brk --no-file-parallelism
pnpm run test:e2e     # vitest run --config ./vitest.config.e2e.ts
```

`test:debug` ya pasa `--no-file-parallelism` explícito: en modo breakpoint el
runner se cuelga, y si otro archivo arranca en paralelo el debugger se engancha
al proceso equivocado.

Desde la raíz del monorepo: `pnpm run test:backend`.

**`pnpm run stop` antes**: el guard del arranque se niega a correr los specs si
hay un backend escuchando en el puerto de la API.

## Cómo escribir un spec nuevo

### El esqueleto

```ts
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/index.js';
import { MiService } from './mi.service.js';

const TEST_CARD_PREFIX = 'test-mi-modulo-';       // 1. prefijo propio
const TEST_EMAIL_A = 'mi-a@test.local';            // 2. emails @test.local

describe('MiService', () => {
  const prismaClient = new PrismaClient();         // 3. PrismaClient pelado
  let moduleRef: TestingModule;
  let service: MiService;

  beforeAll(async () => {                          // 4. el módulo, una vez
    moduleRef = await Test.createTestingModule({
      providers: [
        MiService,
        { provide: PrismaService, useValue: prismaClient },
      ],
    }).compile();
    service = moduleRef.get(MiService);
  });

  afterAll(async () => {
    await prismaClient.<tabla>.deleteMany({ where: { id: { startsWith: TEST_CARD_PREFIX } } });
    await prismaClient.$disconnect();              // 5. siempre
    await moduleRef.close();
  });

  beforeEach(async () => {                          // 6. cleanup + fixtures
    await prismaClient.user.deleteMany({ where: { email: { endsWith: '@test.local' } } });
    await prismaClient.card.deleteMany({ where: { id: { startsWith: TEST_CARD_PREFIX } } });
    // ...crear fixtures
  });
});
```

Las reglas que importan:

1. **Prefijo único por spec** para todo lo que se cree en el catálogo.
   `test-collections-`, `test-share-`, `test-friends-`. Es lo que permite un
   `deleteMany` quirúrgico en `afterAll` sin tocar el catálogo real.
2. **Emails `@test.local`**. Es el filtro que usan todos los `beforeEach` para
   limpiar usuarios. `auth.service.spec.ts` es la excepción: borra todos los
   usuarios, sin filtro.
3. **`new PrismaClient()` directo**, no `PrismaService` de Nest: se inyecta con
   `useValue`. Evita el ciclo de vida del módulo en el setup.
4. **`beforeAll` arma el módulo, `beforeEach` arma los datos.** Nunca al revés:
   `beforeEach` corre N veces y compilar el módulo N veces es lentísimo.
5. **`$disconnect()` siempre** en `afterAll`, o el proceso de Vitest no cierra
   y queda colgado.
6. **El cleanup de `beforeEach` tiene que ir en orden de dependencia inverso**:
   primero `users` (por cascade borran colecciones, items, tokens), después las
   cartas de prueba. Si el orden es al revés, el `deleteMany` de `users` falla
   por foreign key.

### Helpers de DTO

Los DTOs se arman con `Object.assign(new XDto(), ...)`, nunca con un literal
tipado a mano, para que si el DTO cambia el test no deje de compilar:

```ts
const addItem = (cardId: string, dto: Partial<AddItemDto> = {}): AddItemDto =>
  Object.assign(new AddItemDto(), { cardId }, dto);
```

El reconocimiento visual se cubre en `visual-identify.service.spec.ts` y en los tests del índice y la verificación geométrica.


### Cómo testear código que usa `$queryRaw`

No hay que hacer nada especial: los specs **pegan contra la base real** y
ejercitan el SQL de verdad. Eso es justamente lo que los hace útiles — un
`DISTINCT ON` mal escrito se rompe en el test, no en producción.

Para verificar el `DISTINCT ON` (el patrón más delicado) el spec siembra **dos
precios de la misma variante con fechas distintas** y asserta que gana el
reciente:

```ts
await prismaClient.cardPrice.create({
  data: { cardId: TEST_CARD_ID, variant: 'normal', market: new Prisma.Decimal('12.50'),
          source: 'test', currency: 'USD', fetchedAt: new Date('2024-01-01T00:00:00.000Z') },
});
// Precio viejo de la misma variante: el service siempre toma el más reciente.
await prismaClient.cardPrice.create({
  data: { cardId: TEST_CARD_ID, variant: 'normal', market: new Prisma.Decimal('99.00'),
          source: 'test', currency: 'USD', fetchedAt: new Date('2024-06-01T00:00:00.000Z') },
});

expect(normal.price?.market).toBe(99);   // el de junio, no el de enero
```

Tres cosas más que aparecen en los specs con SQL crudo:

- **`Prisma.Decimal` explícito**: si creás un `cardPrice` con
  `market: 12.5` (number) Prisma lo acepta, pero el assert suele compararse
  contra `99` (number) y el `toNumber` del service lo normaliza. Usá
  `new Prisma.Decimal('99.00')` en el seed para no depender de eso.
- **Fechas fijas en el pasado**: `fetchedAt: new Date('2024-01-01T…')` en vez de
  `new Date()`. Un test que depende de "ahora" se rompe cuando la regla de
  frescura (`MAX_AGE_MS = 24 h`) se toca.
- **Un set real**: los specs de collections/share/friends hacen
  `cardSet.findFirst({ orderBy: { id: 'asc' } })` y assertan que no sea `null`
  (`collections.service.spec.ts:61`). Asumen que el catálogo está sincronizado.
  Si la base está vacía, esos specs fallan con un error de `expect(set).not.toBeNull()`.

### Cómo testear Redis

Redis es opcional en el diseño: `RedisService` arranca igual si `REDIS_URL` no
está, y todos sus métodos devuelven `null`/`undefined` sin fallar. Los tests
aprovechan las dos caras.

#### Cara A — Redis real (cuando lo que importa es la caché de verdad)

`currency.service.spec.ts` levanta el `RedisService` real y hace polling hasta
que conecta:

```ts
redis.onModuleInit();
// onModuleInit() conecta en background: esperamos a que resuelva.
for (let i = 0; i < 50 && !redis.isAvailable(); i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
redisAvailable = redis.isAvailable();
```

Si no conecta, **no falla**: se saltea con `ctx.skip()` y avisa por consola.

```ts
it('convert(100, blue) devuelve ars = 100 * rate', async (ctx) => {
  if (!redisAvailable) return ctx.skip();
  await redis.setJson(BLUE_KEY, { rate: 1234.5, rateType: 'blue', fetchedAt: hoursAgo(1) });
  const result = await service.convert(100, 'blue');
  expect(result.ars).toBe(100 * 1234.5);
  expect(globalThis.fetch).not.toHaveBeenCalled();   // la caché evitó el upstream
});
```

El `beforeEach` borra las claves que el test va a usar, siempre:

```ts
beforeEach(async () => {
  if (redisAvailable) {
    await redis.del(BLUE_KEY, BLUE_LAST_KEY, OFICIAL_KEY, OFICIAL_LAST_KEY, BOTH_KEY);
  }
  process.env[FEATURE_FLAG_ENV] = 'true';
  globalThis.fetch = vi.fn(async () => dolarApiResponse()) as unknown as typeof fetch;
});
```

Y `globalThis.fetch` **siempre** está mockeado: la suite nunca sale a la red,
ni cuando testea el camino de éxito.

#### Cara B — Redis falso (cuando lo que importa es que el service degrade)

`share` y `friends` usan un doble que dice "no hay Redis":

```ts
{
  provide: RedisService,
  useValue: {
    isAvailable: () => false,
    get: async () => null,
    getJson: async () => null,
    set: async () => undefined,
    setJson: async () => undefined,
    del: async () => undefined,
  },
}
```

Eso fuerza el camino sin caché y verifica que **el service funciona igual**,
que es la propiedad que importa cuando Redis no está en producción.

### Mockear dependencias de infraestructura

Cuando lo que se testea no necesita la dependencia, se reemplaza por un valor
con la forma mínima. Ejemplos reales:

| Dependencia | Doble | Por qué |
|---|---|---|
| `SyncPricesService` en `cards.service.spec` | `{ getPricesForCard: async (cardId) => [un precio fijo] }` | no querés ir a la API externa |
| `TCGDEX_SET_MAPPING` y `PRICE_PROVIDER` en `sync-prices.service.spec` | `{ resolve: vi.fn() }` y `{ getCardPrices: vi.fn() }` | el mapper y tcgdex son red: se verifican las llamadas con mocks |
| `CurrencyService` en `cards.service.spec` | `{ getCachedRate: async () => cachedRate }` | `cachedRate` es una variable que el test setea en `beforeEach` |
| `SyncPricesService` en `collections.service.spec` | **no se provee** | por eso la inyección es `@Optional()` |
| `ConfigService` en `currency.service.spec` | `{ get: (key) => (key === 'REDIS_URL' ? REDIS_URL : undefined) }` | solo necesita `REDIS_URL` |

Para el fetch externo hay un helper reusable:

```ts
const failingFetch = () =>
  vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
```

Y para una respuesta de la API, un doble con la forma **real** (verificada, no
asumida) — de hecho el spec tiene el JSON real de DolarApi y un comentario que
lo aclara:

```ts
/**
 * Respuesta REAL de `GET /v1/dolares/blue` (verificada contra la API, no
 * asumida): no usa `value`/`timestamp` sino `compra`/`venta`/`fechaActualizacion`.
 */
function dolarApiResponse(overrides: Record<string, unknown> = {}): Response {
  const body = {
    moneda: 'USD', casa: 'blue', nombre: 'Blue',
    compra: 1540, venta: 1560,
    fechaActualizacion: '2026-09-25T20:58:00.000Z',
    ...overrides,
  };
  return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
           json: async () => body } as unknown as Response;
}
```

Si probás un caso raro, usá `overrides` en vez de escribir un doble nuevo.

### `globalThis.fetch` y variables de env

Cuando un test toca `globalThis.fetch` o `process.env`, **restaurá en
`afterEach`/`afterAll`** o el siguiente test hereda el mock:

```ts
const originalFetch = globalThis.fetch;
const originalFlag = process.env[FEATURE_FLAG_ENV];

afterEach(() => { globalThis.fetch = originalFetch; });
afterAll(async () => {
  globalThis.fetch = originalFetch;
  process.env[FEATURE_FLAG_ENV] = originalFlag;
  await moduleRef.close();
});
```

El feature flag se lee de `process.env` **en runtime**
(`currency.service.ts:94`), no de `ConfigService`, así que setearlo en el test
es la única forma de prenderlo y apagarlo.

## E2E

`vitest.config.e2e.ts` corre `**/*.e2e-spec.ts` (no tiene
`fileParallelism: false` porque hoy hay un solo archivo).

Hoy existe **uno**: `test/app.e2e-spec.ts`, que levanta el `AppModule` completo
con supertest y checkea `GET /api/health`:

```ts
app = moduleFixture.createNestApplication();
app.setGlobalPrefix('api');            // hay que repetirlo: no pasa por main.ts
await app.init();
return request(app.getHttpServer()).get('/api/health').expect(200).expect({ status: 'ok' });
```

Dos cosas a saber si agregás un e2e:

- **`setGlobalPrefix('api')` hay que ponerlo a mano**: el `AppModule` no lo
  define, eso vive en `main.ts`.
- El e2e levanta el `AppModule` entero, así que necesita `JWT_SECRET` en el env
  (`getOrThrow` en `auth.module.ts:15` falla sin él) y Postgres.

## Checklist antes de dar un spec por terminado

- [ ] `pnpm run test` en verde (y no rompiste los otros specs: los datos se
      comparten).
- [ ] `pnpm run lint` en verde (oxlint corre type-aware sobre los specs).
- [ ] Cleanup en `beforeEach` (para que el *siguiente* test arranque limpio) **y**
      en `afterAll` (para que la base de desarrollo quede como estaba).
- [ ] Cartas de prueba con prefijo propio; usuarios con `@test.local`.
- [ ] `globalThis.fetch` y `process.env` restaurados.
- [ ] `await prismaClient.$disconnect()` en `afterAll`.
- [ ] Nada de red real: `fetch` mockeado siempre que el código pueda salir.
- [ ] Si toca Redis: o Redis real con `ctx.skip()` si no conecta, o el doble
      `isAvailable: () => false`.

## Ver también

- [database.md](database.md) — los modelos que los specs siembran
- [gotchas.md](gotchas.md) — por qué `fileParallelism: false` no se toca
