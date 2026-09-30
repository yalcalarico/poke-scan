# Gotchas — las trampas de este backend

> Fallas **reales** que costaron tiempo en este proyecto, con la causa y el fix.
> Leé esto antes de tocar `package.json`, `schema.prisma`, los providers o los
> scripts. Cada sección dice qué pasó, por qué y cómo queda el código hoy.

## Índice

**Tooling / build**
1. [Prisma 7 eliminó `url` del datasource](#1-prisma-7-eliminó-url-del-datasource)
2. [`prisma migrate dev` dropea los índices trigram](#2-prisma-migrate-dev-dropea-los-índices-trigram)
3. [`JsonB` no es un tipo válido del schema](#3-jsonb-no-es-un-tipo-válido-del-schema-de-prisma)
4. [Los imports ESM necesitan extensión `.js`](#4-los-imports-esm-necesitan-extensión-js)
5. [El `make` de macOS y `python3` no están sin Xcode](#5-el-make-de-macos-y-python3-no-están-sin-xcode)
6. [`wait -n` no existe en bash 3.2](#6-wait--n-no-existe-en-bash-32-el-de-macos)
7. [`curl` puede fallar por falta de licencia](#7-curl-puede-fallar-por-falta-de-licencia-usá-node--e-con-fetch)

**Nest / DI**
8. [`JwtModule.register` con `process.env` se evalúa al importar](#8-jwtmoduleregister-con-processenv-se-evalúa-al-importar)
9. [El decorador `@Public()` no lo lee ningún guard](#9-el-decorador-public-no-lo-lee-ningún-guard)
10. [El `constructor(baseUrl: string = BASE_URL)` rompía el DI](#10-el-constructorbaseurl-string-base_url-rompía-el-di)
11. [`@nestjs/throttler` 6.7.1: `ttl`/`limit` y guard manual](#11-nestjsthrottler-671-ttllimit-y-el-guard-no-se-auto-registra)
12. [El refresh token no es un JWT (deuda)](#12-el-refresh-token-no-es-un-jwt-deuda-técnica)

**Datos y queries**
13. [Tablas snake_case, columnas camelCase](#13-tablas-snake_case-columnas-camelcase)
14. [`pg_trgm` no soporta `\p{L}` en regex](#14-pg_trgm-no-soporta-pl-en-regex)
15. [`set_config` de trigram es local a la transacción](#15-set_config-del-umbral-de-trigram-es-local-a-la-transacción)
16. [`DISTINCT ON` no acepta `WHERE`](#16-distinct-on-no-acepta-where)
17. [`Decimal` sale como `Prisma.Decimal` de `$queryRaw`](#17-decimal-sale-como-prismadecimal-de-queryraw)

**API externa**
18. [pokemontcg.io responde 500/502 y tarda 8 s](#18-pokemontcgio-responde-500502-y-tarda-8-s-por-request)
19. [Los 40 endpoints sin API key: 30/min, 1.000/día](#19-los-límites-de-la-api-sin-key-30min-1000día)

**Bugs y debt que quedaron documentados**
21. [`cardsMissingPrice` no cuenta los `market: null`](#21-cardsmissingprice-no-cuenta-los-market-null)
22. [`sort=price` ya está implementado (antes caía al orden por nombre)](#22-sortprice-ya-está-implementado-antes-caía-al-orden-por-nombre)
23. [`rarity` y `supertype` son igualdad, no substring](#23-rarity-y-supertype-son-igualdad-case-insensitive-no-substring)
24. [`searchBy=number` matchea por igualdad, no por substring](#24-searchbynumber-matchea-por-igualdad-no-por-substring)
25. [`direction` se ignora cuando hay `q`](#25-direction-se-ignora-cuando-hay-q)
26. [El `DISTINCT ON` sin filtro leía toda la tabla](#26-el-distinct-on-de-precios-sin-filtro-leía-toda-la-tabla--arreglado)
27. [`LATERAL` con `LIMIT` gana a `row_number()`](#27-lateral-con-limit-gana-a-row_number-cuando-se-quiere-el-top-n-por-grupo)
28. [El `DISTINCT ON` de `card_prices` es lo que hace barato el delta de 30 días](#28-el-distinct-on-de-card_prices-es-lo-que-hace-que-el-delta-de-30-días-sea-barato)
29. [El `orderBy` de Prisma no llega a `card_prices`, y un filtro escrito dos veces diverge](#29-el-orderby-de-prisma-no-llega-a-card_prices-y-un-filtro-escrito-dos-veces-diverge)
30. [`printedTotal` y `total` no son lo que la carta imprime](#30-printedtotal-y-total-no-son-lo-que-la-carta-imprime)

**Lo que ya se arregló y queda como registro**
31. [Un lock se suelta con compare-and-delete, nunca con `DEL`](#31-un-lock-se-suelta-con-compare-and-delete-nunca-con-del)
20. [`getUsdArsBoth` podía tirar un 500 si caía el tipo preferido — **arreglado**](#20-getusdarsboth-podía-tirar-un-500-si-el-tipo-preferido-fallaba--arreglado)
32. [Un `LEFT JOIN` de precios sin filtro de proveedor compila y miente](#32-un-left-join-de-precios-sin-filtro-de-proveedor-compila-y-miente)
33. [Un rate limit en memoria es un rate limit por proceso](#33-un-rate-limit-en-memoria-es-un-rate-limit-por-proceso)
34. [Un `null` de Redis puede ser "todavía no conectó"](#34-un-null-de-redis-puede-ser-todavía-no-conectó-y-en-un-script-de-migración-es-un-no-op-silencioso)

---

## 1. Prisma 7 eliminó `url` del datasource

**Qué pasó**: al probar Prisma 7, el `datasource` del schema pasó a pedir un
**driver adapter** explícito y **`url` dejó de ser una clave válida**. El
schema de este proyecto es:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Con Prisma 7 eso no compila y la migración a `pg.Pool` + `@prisma/adapter-pg`
implicaba cambiar el `PrismaService`, el `scripts/sync-full.ts`, el `seed` y
todos los tests.

**Cómo quedó**: `prisma` está **clavado en `6.19.3`** (no `^6.19.3`) en
`devDependencies`, y `@prisma/client` en `^6.19.3`. Los dos necesitan ir
juntos: si el cliente se sube solo, el schema se rechaza.

**No subas Prisma a 7** sin antes migrar los tres puntos:
1. `schema.prisma`: `datasource` sin `url`.
2. Un provider de adapter registrado en `PrismaService` (`new PrismaService()`
   con `{ adapter }` en vez de leer `process.env`).
3. Los scripts, que instancian `PrismaService` con `new`.

## 2. `prisma migrate dev` dropea los índices trigram

**Qué pasó**: se corrió `prisma migrate dev` después de agregar el módulo de
amigos. Prisma generó la migración bien, pero **borró los índices trigram**:
Prisma no modela `gin_trgm_ops`, así que ve los
`CREATE INDEX ... USING GIN (name gin_trgm_ops)` como objetos desconocidos y los
dropea para dejar el schema "sincronizado" con el `schema.prisma` (donde no
están). Hoy son 5: los 4 de aquella vez más `cards_artist_trgm_idx`.

El síntoma no fue un error: fue **performance**. `GET /cards/search` pasó de
~70 ms a más de un segundo (seq scan sobre 20.670 filas) y
`GET /users/search` de 0 a hundreds de ms.

**Cómo quedó**: los índices viven en migraciones escritas a mano, con un
comentario que lo dice explícitamente:

```sql
-- prisma/migrations/20260925180600_add_pg_trgm/migration.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS cards_name_trgm_idx ON cards USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS card_sets_name_trgm_idx ON card_sets USING GIN (name gin_trgm_ops);
```

```sql
-- prisma/migrations/20260926010423_add_friendships/migration.sql
-- Son raw SQL a propósito: Prisma no modela `gin_trgm_ops`, igual que los de
-- cards y card_sets en la migración add_pg_trgm.
CREATE INDEX IF NOT EXISTS users_username_trgm_idx ON users USING GIN (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_display_name_trgm_idx ON users USING GIN ("displayName" gin_trgm_ops);
```

```sql
-- prisma/migrations/20260928160000_add_cards_artist_trgm/migration.sql
-- Son raw SQL a propósito: Prisma no modela `gin_trgm_ops`.
CREATE INDEX IF NOT EXISTS cards_artist_trgm_idx ON cards USING GIN (artist gin_trgm_ops);
```

**Si vuelve a pasar**, restaurá a mano:

```sql
CREATE INDEX IF NOT EXISTS cards_name_trgm_idx ON cards USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS card_sets_name_trgm_idx ON card_sets USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_username_trgm_idx ON users USING GIN (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_display_name_trgm_idx ON users USING GIN ("displayName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS cards_artist_trgm_idx ON cards USING GIN (artist gin_trgm_ops);
```

Y verificá:

```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE indexname LIKE '%_trgm_idx';
-- esperando 5 filas
```

**Regla**: después de cualquier `migrate dev`, chequeá que sigan los 5. Usá
`prisma migrate deploy` (que es lo que corre `pnpm run db:migrate` desde la raíz)
en vez de `migrate dev` para el caso normal.

**Al agregar un modo de búsqueda sobre un campo nuevo de `cards`**: el índice
trigram GIN de ese campo va en una migración a mano, nunca en `schema.prisma`.
`number` es la excepción que demuestra la regla: no lleva trigram porque su
matching es de igualdad y lo resuelve el `@@index([number])` del schema.

## 3. `JsonB` no es un tipo válido del schema de Prisma

**Qué pasó**: se escribió `rawJson JsonB?` por costumbre de SQL. Prisma no
reconoce `JsonB`: el error del `prisma validate` es poco descriptivo y el
schema entero deja de parsear.

**El tipo correcto en `schema.prisma` es `Json`**:

```prisma
model Card {
  rawJson  Json
  syncedAt DateTime @default(now())
}
```

`JSONB` es el tipo de **Postgres** y aparece en el `migration.sql` generado
(`"rawJson" JSONB NOT NULL`), no en el schema. No los confundas: el schema
habla Prisma, el SQL habla Postgres.

Relacionado: para pasar un `unknown` al `rawJson` desde un service hay que
 castearlo, porque Prisma pide `Prisma.InputJsonValue`:

```ts
rawJson: card.raw as Prisma.InputJsonValue,
```

## 4. Los imports ESM necesitan extensión `.js`

**Qué pasó**: `package.json` tiene `"type": "module"`, así que el output de
`tsc` es ESM. Un import relativo sin extensión **compila sin quejarse** y
revienta en runtime:

```ts
import { AppModule } from './app.module.js';   // ✅
import { AppModule } from './app.module';     // ❌ TypeScript OK, runtime: ERR_MODULE_NOT_FOUND
```

No hay warning de TypeScript. El error aparece cuando Nest levanta.

**Cómo quedó**: la convención es **todos** los imports relativos llevan `.js`,
incluidos los de DTOs, tipos y constantes:

```ts
import { PrismaService } from '../../prisma/index.js';
import { CARD_VARIANTS } from './dto/card-variant.js';
import type { PublicUser } from '../../common/types/auth-user.js';
```

`tsconfig.json` tiene `module`/`moduleResolution: nodenext`, que es lo que
permite la resolución con extensión.

**Si agregás un archivo**, el `tsc --noEmit` te va a avisar si te olvidás (por
`nodenext`), pero si lo corrés con otro tsconfig o con un bundler, no.

## 5. El `make` de macOS y `python3` no están sin Xcode

**Qué pasó**: el `package.json` de la raíz menciona `make <comando>` como
equivalente de los scripts de pnpm. En una Mac sin la licencia de Xcode
Command Line Tools instalada:

```
$ make check
make: make: No such file or directory
```

o, más confuso, `/usr/bin/make` existe pero **falla al arrancar** con:

```
xcode-select: error: tool 'make' requires Xcode, but active developer directory
'/Library/Developer/CommandLineTools' is a command line tools instance
```

Lo mismo pasa con `python3`, que es un shim que necesita las CLT.

**Cómo queda**: **no dependas de `make` ni de `python3`**. Todo pasa por
`pnpm run <script>` (33 scripts en la raíz, los importantes están en
[../README.md](../README.md)). Para scripts de un solo uso, `node -e '...'`:
Node 22 es una dependencia del proyecto y siempre está.

## 6. `wait -n` no existe en bash 3.2 (el de macOS)

**Qué pasó**: al querer levantar API y web en paralelo desde un script, se
escribió algo con `wait -n`, que espera al primer job que termine. En macOS:

```
scripts/dev.sh: line 42: wait: -n: invalid option
```

`wait -n` llegó en **bash 4.3**. macOS traiga **bash 3.2** y no lo va a
actualizar (está atado a la licencia de Darwin).

**Cómo quedó**: `scripts/dev.sh` corre los dos con `&` y espera con `wait` a
 secas. Si necesitás "esperar al primero que termine", tenés que hacerlo con
`kill -0` en loop o guardar los PIDs.

Regla general para los scripts del proyecto: **bash 3.2 features solamente**.
Ni `wait -n`, ni `mapfile`, ni `${var@Q}`, ni arrays asociativos.

## 7. `curl` puede fallar por falta de licencia: usá `node -e` con `fetch`

**Qué pasó**: los ejemplos de `curl` de la documentación y del `seed` fallan
en la Mac del proyecto con:

```
$ curl http://localhost:3001/api/health
curl: error: dyld[...]: Library not loaded: /usr/lib/libcurl.4.dylib
```

`/usr/bin/curl` es un binario del sistema que también depende de las CLT.

**Qué usar en su lugar**: `node -e` con `fetch`, que ya es global en Node 22 y
no depende de nada del sistema.

```bash
# ✅ funciona siempre
node -e "fetch('http://localhost:3001/api/cards/search?q=pikachu&pageSize=2').then(r=>r.json()).then(console.log)"

# ❌ puede fallar
curl -s 'http://localhost:3001/api/cards/search?q=pikachu'
```

Para los ejemplos de [api.md](api.md) escépticos preferimos `curl` porque se leen
mejor y se copian a Postman, pero **para probar de verdad** usá `node -e`.

## 8. `JwtModule.register` con `process.env` se evalúa al importar

**Qué pasó**: la primera versión de `auth.module.ts` era:

```ts
JwtModule.register({
  secret: process.env.JWT_SECRET,
  signOptions: { expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' },
})
```

Con `JWT_SECRET` sin definir, Nest arrancaba con `secret: undefined` y **todos
los tokens salían firmados con la clave literal `"undefined"`**, sin ningún
error. La insidiousia: en dev funcionaba (el `.env` estaba), y en un
`docker run` sin `--env-file` no.

La causa real es que los **metadatos de `@Module` se evalúan en tiempo de
import del archivo**, no cuando Nest construye el contenedor. Cuando se importa
`app.module.ts`, se importa `auth.module.ts`, y en ese momento
`ConfigModule.forRoot()` **todavía no corrió**: `process.env` no tiene lo que
carga el `.env`.

**Cómo quedó**: `registerAsync` con un factory que sí recibe el
`ConfigService`, y `getOrThrow` para que falle fuerte:

```ts
JwtModule.registerAsync({
  global: true,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    secret: configService.getOrThrow<string>('JWT_SECRET'),
    signOptions: {
      expiresIn: configService.get<string>('JWT_ACCESS_TTL', '15m') as JwtSignOptions['expiresIn'],
    },
  }),
})
```

`getOrThrow` es lo importante: si el secret falta, el arranque muere con un
mensaje claro en vez de firmar con `undefined`.

**Regla**: en un `@Module`, nunca leas `process.env` directo. Usá
`registerAsync`/`useFactory` con `ConfigService`.

> `RedisService.onModuleInit` **sí** lee `process.env` directo
> (`redis.service.ts:21`), pero con un fallback a `ConfigService` y un default
> tolerante, así que a propósito no rompe el arranque.

## 9. El decorador `@Public()` no lo lee ningún guard

No es un bug todavía, pero es la primera sorpresa de cualquiera que lea
`main.ts` esperando un guard global.

`JwtAuthGuard` está chequeando metadata (`IS_PUBLIC_KEY`) para saltearse, pero
**no hay ningún guard global de JWT**. En `app.module.ts` el único `APP_GUARD`
es el `ThrottlerGuard`:

```ts
providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
```

Los endpoints son públicos porque a esos controllers **no se les aplica
`@UseGuards(JwtAuthGuard)`**, no porque digan `@Public()`.

| Controller | Guard | Consecuencia |
|---|---|---|
| `UsersController` | `@UseGuards` de clase | todo requiere Bearer |
| `CollectionsController` | `@UseGuards` de clase | todo requiere Bearer |
| `ShareController` | `@UseGuards` de clase | todo requiere Bearer |
| `FriendsController` | `@UseGuards` de clase | todo requiere Bearer |
| `CurrencyController` | `@UseGuards` **de método**, solo en `PATCH preference` | `GET usd-ars` es público |
| `CardsController` | ninguno | todo público |
| `SetsController` | ninguno | todo público |
| `PublicShareController` | ninguno | todo público |
| `JobsController` | ninguno | auth por `x-admin-key` |

**El riesgo concreto**: si mañana se agrega `JwtAuthGuard` como `APP_GUARD`
porque "es lo correcto", **los 3 endpoints de `/jobs` quedan con doble
protección** y `GET /currency/usd-ars` y `GET /cards/*` requieren token
súbitamente. Y `@Public()` **no lo arregla**: sí lo arregla, porque el guard lo
chequea... salvo que el `@Public()` no esté puesto. Es la trampa: el mecanismo
existe y funciona, pero depende de que cada método público se acuerde de
decorarlo. Hoy no hay ninguno, porque no hace falta.

**Si querés unificar**: agregá `JwtAuthGuard` como `APP_GUARD`, poné `@Public()`
en `cards/*`, `sets`, `s/:slug`, `currency/usd-ars`, `auth/*` **y** `health`, y
**decidí explícitamente** qué pasa con `/jobs` (hoy usa `x-admin-key`, no JWT:
o queda `@Public()` con el header, o se le agrega un guard de admin). Es un
refactor con impacto de auth: no lo hagas de un saque.

## 10. El `constructor(baseUrl: string = BASE_URL)` rompía el DI

**Qué pasó**: `PokemonTcgIoProvider` se escribía con la base URL como
parámetro de constructor con default:

```ts
// ❌ así estaba
@Injectable()
export class PokemonTcgIoProvider implements CardDataProvider {
  constructor(private readonly baseUrl: string = BASE_URL) {}
}
```

Con el `type: 'module'` de Nest 12, el `emitDecoratorMetadata` de TypeScript
genera `design:paramtypes` para el constructor. Un parámetro tipado `string` se
registra como la clase `String`, así que Nest **intenta resolver un provider
de tipo `String`** para inyectarlo. Como no existe, el arranque falla con:

```
Nest can't resolve dependencies of the PokemonTcgIoProvider (String, ?)
```

Y el mensaje es engañoso: no dice "falta un provider de String", parece un
problema de tipos del constructor.

**Cómo quedó**: la base URL es un **campo privado con valor inicial**, no un
parámetro de constructor:

```ts
@Injectable()
export class PokemonTcgIoProvider implements CardDataProvider {
  private readonly baseUrl: string = BASE_URL;
}
```

`private readonly baseUrl: string = BASE_URL;` no aparece en `paramtypes`, así
que Nest no busca nada que inyectar.

**Regla**: en un `@Injectable`, todo lo que no se inyecta va como campo con
valor inicial, nunca como parámetro de constructor tipado. Si de verdad
necesitás inyectarlo, que sea con un token explícito
(`@Inject(CONFIG_TOKEN) private readonly baseUrl: string`) y un provider
registrado.

## 11. `@nestjs/throttler` 6.7.1: `ttl`/`limit` y el guard no se auto-registra

Dos cambios de la v5 a la v6 que rompen la config si venís de la doc vieja.

### a) `ttl` y `limit`, no `seconds` ni `max`

```ts
// ✅ v6
ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])
Throttle({ default: { limit: 5, ttl: 60_000 } })

// ❌ v5 y anterior
ThrottlerModule.forRoot({ throttlers: [{ ttlSeconds: 60, limit: 100 }] })
```

`ttl` está en **milisegundos**. Un `ttl: 60` sería 60 ms y el throttle
dispararía en cada request.

### b) El guard NO se auto-registra

Después de `forRoot`, los endpoints siguen **sin throttling** hasta que se
registra el guard a mano:

```ts
// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ...
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],   // ← sin esto, no hay throttle
})
export class AppModule {}
```

`forRoot` solo registra la configuración. Sin el `APP_GUARD` no hay nada
aplicando el límite, y no hay ningún error: simplemente no pasa.

**Cómo verificar que funciona** (con el server levantado):

```bash
for i in $(seq 1 12); do
  node -e "fetch('http://localhost:3001/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>console.log(r.status))"
done
# 6 hits a 400 (validación), del 6 en adelante 429 — el límite es 5/min
```

## 12. El refresh token no es un JWT (deuda técnica)

**Nota, no bug**: `auth.module.ts` importa `RefreshJwtModule`, que registra un
segundo `JwtModule` con `JWT_REFRESH_SECRET` y `expiresIn` en segundos, y lo
expone con un token `REFRESH_JWT`. El `.env` de ejemplo tiene
`JWT_REFRESH_SECRET=change-me-too-in-production`.

**Ese módulo no lo inyecta nadie.** Los refresh tokens son opacos:

```ts
// auth.service.ts:173
const refreshToken = randomBytes(48).toString('base64url');
await this.prisma.refreshToken.create({
  data: { userId: user.id, tokenHash: this.hashToken(refreshToken), expiresAt: this.refreshTokenExpiry() },
});
```

Y la expiración sale de `JWT_REFRESH_TTL_DAYS` leída por `ConfigService`
(`auth.service.ts:199`), no de un `expiresIn` de JWT.

**Consecuencias concretas**:

- `JWT_REFRESH_SECRET` es una variable muerta. Sacarla del `.env` no rompe
  nada.
- `refresh-jwt.module.ts` son 24 líneas que se ejecutan al arrancar y no
  aportan nada.
- `REFRESH_JWT` está exportado y nadie lo importa.

**No lo borres sin pensar**: si más adelante se quiere un refresh token *firmado*
(un JWT con `jti` para poder revocar por id sin tocar la tabla), el módulo ya
está. La fila está. La decisión de diseño — token opaco hasheado con SHA-256,
con `revokedAt` para la rotación y la detección de reuso — es correcta y está
testeada; lo que sobra es el módulo de JWT.

## 13. Tablas snake_case, columnas camelCase

`@@map()` renombra la **tabla**, no las columnas. Las columnas quedan con el
nombre del campo del schema: **camelCase**, y en SQL hay que entrecomillarlas.

```sql
SELECT "cardId", "fetchedAt", "isActive" FROM card_prices;   -- ✅
SELECT cardid,  fetchedat,  isactive  FROM card_prices;   -- ❌ no existen
SELECT * FROM CardPrices;                                 -- ❌ la tabla es card_prices
```

Esto importa en tres lugares: `$queryRaw` (los 5 `fetchLatestPrices` y el
`DISTINCT ON` de `identify`), en las agregaciones con `LEFT JOIN`, y en
cualquier `psql` manual para debuggear.

En Prisma no hay que entrecomillar: `where: { cardId }` funciona porque el
cliente escapa. El problema aparece **solo** en SQL crudo.

`psql` para verificar:
```sql
\d card_prices       -- muestra las columnas CamelCase entrecomilladas
```

Ver [database.md](database.md).

## 14. `pg_trgm` no soporta `\p{L}` en regex

**Qué pasó**: al matching de `identify` hacía falta contar cuántas palabras de
una ventana del OCR "parecen un nombre", y se escribió con clases Unicode:

```sql
-- ❌ ERROR: invalid regular expression
WHERE w.word ~ '^\p{L}[\p{L}\p{N}'-]{2,}$'
```

**Por qué**: los operadores regex de PostgreSQL compilan con la biblioteca
interna, que no soporta `\p{...}`. Las clases Unicode de POSIX (`\pL`,
`\p{L}`) **no** funcionan con el flavor de regex del server. Funcionan recién
en PostgreSQL 15+ con un flag, y en general en clientes (JS, Python) que sí
saben Unicode.

**Cómo quedó**: clases POSIX, que `pg_trgm` maneja sin problemas:

```ts
const NAME_LIKE_WORD = "^[[:alpha:]][[:alnum:]'-]{2,}$";
const NAME_LIKE_PHRASE = "^([[:alpha:]][[:alnum:]'-]{2,})( +([[:alpha:]][[:alnum:]'-]{2,}))+$";
```

**Regla**: en cualquier regex que se mande a Postgres desde este proyecto,
usá `[[:alpha:]]`, `[[:alnum:]]`, `[[:digit:]]` — no `\p{L}`, `\w` con
`\p`, ni `\d` esperando soporte Unicode. En el lado JS, en cambio, `\p{L}` sí
funciona: `const HAS_LETTER = /[\p{L}]/u;` en `identify.service.ts:60` es
correcto y está bien.

## 15. `set_config` del umbral de trigram es local a la transacción

`search` e `identify` bajan el umbral de similitud de `pg_trgm` de 0.3 (default)
a 0.2, así "Charizrd" matchea "Charizard":

```ts
await tx.$executeRaw(
  Prisma.sql`SELECT set_config('pg_trgm.similarity_threshold', ${TRIGRAM_THRESHOLD}, true)`,
);
```

El `true` del tercer argumento es **`is_local`**: la configuración vale **solo
para la transacción actual**. Por eso el `set_config` y el `$queryRaw` que lo
necesita tienen que ir **en la misma transacción y en la misma conexión**:

```ts
const { rows, total } = useTrigram
  ? await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT set_config(...)`);
      return run(tx);              // ← el mismo `tx`
    })
  : await run(this.prisma);
```

**Si sacás el `set_config` de la transacción**, o lo dejás con `false` (global
de sesión), pasa una de dos cosas: si es global, queda en la sesión del pool de
conexiones y contamina requests de otros usuarios; si lo perdés, el threshold
vuelve a 0.3 y los matches TEA disappear sin error.

## 16. `DISTINCT ON` no acepta `WHERE`

`DISTINCT ON` en PostgreSQL no se puede combinar con `WHERE` en la misma query:

```sql
-- ❌ ERROR: SELECT DISTINCT ON is not implemented for window functions / WHERE
SELECT DISTINCT ON (p."cardId", p.variant) p."cardId", p.market
FROM card_prices p
WHERE p."cardId" = ANY($1)
ORDER BY p."cardId", p.variant, p."fetchedAt" DESC
```

La forma correcta es un subselect:

```sql
SELECT * FROM (
  SELECT DISTINCT ON (p."cardId", p.variant)
    p."cardId", p.variant, p.market
  FROM card_prices p
  ORDER BY p."cardId", p.variant, p."fetchedAt" DESC
) latest
WHERE latest."cardId" = ANY($1);
```

En el código, el filtro por `cardIds` va en el `WHERE` de la consulta completa
(el `DISTINCT ON` elige el último por grupo y después se filtra por `cardId`), y
en las agregaciones se usa como `LEFT JOIN` de una subconsulta sin filtro. Las
dos formas están en [database.md](database.md).

**La otra mitad de la regla**: el `ORDER BY` tiene que **empezar** por las
columnas del `DISTINCT ON`. Si el `ORDER BY` empieza por `fetchedAt`, Postgres
agrupa por otra cosa y el resultado es incorrecto **sin error**.

## 17. `Decimal` sale como `Prisma.Decimal` de `$queryRaw`

`card_prices` usa `Decimal(12,2)`. Cuando se lee con `$queryRaw` (no con
`findMany`), el tipo que vuelve **no** es `number`:

```ts
interface LatestPriceRow {
  market: Prisma.Decimal | null;   // ← el tipo real, no number
  fetchedAt: Date;
}
```

`Prisma.Decimal` es un objeto con `toString()`, no un primitivo. Por eso todos
los services tienen un helper idêntico:

```ts
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const numeric = Number(value as { toString(): string });
  return Number.isFinite(numeric) ? numeric : null;
}
```

`toNumber` está en `cards.service.ts`, `identify.service.ts`,
`collections.service.ts`, `share.service.ts`, `friends.service.ts` y
`sync-prices.service.ts` — **seis copias**. No lo unifiques de paso si estabas
tocando otra cosa: es un refactor propio.

En el lado SQL de las agregaciones el problema desaparece porque se castea:
`COALESCE(SUM(i.quantity * lp.market), 0)::float8 AS "totalValueUsd"`. Ahí lo
que sale es un número de verdad.

## 18. pokemontcg.io responde 500/502 y tarda 8 s por request

**El comportamiento real medido** de la API v2 sin key:

- **~8 segundos por request** de cartas (página de 250). Es lentísimo.
- **500 y 502 con frecuencia**, incluso requests válidos. No es un error de uso.
- A veces 1 minuto de latencia antes de contestar 200.

**Las tres mitigaciones** están en el código:

1. **`fetchWithRetry` en el provider** (4 intentos, backoff `1s · 2^attempt` +
   jitter de 250 ms, respeta `Retry-After`, timeout de 30 s). Solo reintenta
   `[408, 425, 429, 500, 502, 503, 504]`; un 404 sale ya.
2. **`withPageRetry` en los jobs** (8 intentos por página, backoff `3s · 2^attempt`
   con tope de 30 s + jitter de 2 s). Devuelve `null` en vez de tirar, para que
   el sync **corte pero conserve el cursor**.
3. **Sync reanudable**: `sync:cards:lastPage` en Redis se escribe **después** de
   cada página commiteada. Una caída a la página 40 no tira las 39 anteriores.

**Consecuencia de diseño**: el catálogo se espeja una vez y no se re-consulta.
Si pokemontcg.io está caído, la app **sigue funcionando**: pierde cartas
nuevas, no las que ya están. Los precios ya no salen de ahí (van a tcgdex,
ver [pricing.md](pricing.md)), pero los `rawJson` guardados siguen siendo el
respaldo del historial de precios de 2023 y el material de diagnóstico.

**Nunca**_sumar un retry sin el jitter. Con varios clientes reintentando en
sincronía, el pico de tráfico es lo que tumba a la API.

## 19. Los límites de la API sin key: 30/min, 1.000/día

Es la restricción que **manda sobre la arquitectura**. Si la API pareciera más
rápida o tolerante, no hay que "optimizar" el código para gastar más:

| Límite | Valor |
|---|---|
| Requests por día | 1.000 |
| Requests por minuto | 30 |

De ahí salen, todas obligatorias:

- El catálogo espejado (20.670 cartas) y **nunca** re-pedido por request.
- Los precios **bajo demanda** con 2 capas de caché.
- `REQUEST_PAUSE_MS = 2100` entre páginas del sync.
- `MIN_GAP_MS = 2300` en `ProviderRateGate` (~26 req/min), la única puerta al
  proveedor de precios. Es cortesía hacia TCGdex, no parte de la cuota de
  pokemontcg.io. La comparten la cola y el lote del admin, y el reloj vive en
  Postgres (`provider_rate_limits`) para que sea global y no uno por proceso.
  `getPricesForCard` devuelve el precio disponible y encola los vencidos sin
  esperar el slot; un camino nuevo que llame al proveedor por afuera queda **sin
  throttle** y puede comerse el presupuesto entero con un pico.
- Los precios van a tcgdex, que no tiene límite publicado; el gap se mantiene
  como cortesía a esa infraestructura comunitaria. El sync del catálogo va a
  pokemontcg.io y respeta por separado sus límites publicados.
- Ningún controller llama a la API externa.
- `withPageRetry` + sync reanudable, para no gastar requests en reintentos
  inútiles.

**Si agregás un endpoint que consulta la fuente**, rompés el presupuesto entero.
Ver [pricing.md](pricing.md) para el cálculo.

## 20. `getUsdArsBoth` podía tirar un 500 si el tipo preferido fallaba — **arreglado**

**Arreglado el 2026-09-29.** La sección queda como registro de qué pasaba y por
qué, porque el motivo del arreglo no es obvio desde el código.

En `currency.service.ts:187` había:

```ts
const blueView     = blue.status     === 'fulfilled' ? blue.value     : null;
const oficialView  = oficial.status  === 'fulfilled' ? oficial.value  : null;

if (!blueView && !oficialView) {
  throw new ServiceUnavailableException('No hay cotización ...');
}

const preferredView = preferred === 'oficial' ? oficialView : blueView;
const payload: BothRatesView = {
  rate: preferredView!.rate,        // ← el `!` no está garantizado
  rateType: preferred,
  ...
};
```

El comentario del método decía explícitamente: "Un tipo puede faltar sin tumbar
al otro: `blue` o `oficial` en `null`". Pero si el cliente pidió `?type=blue`,
DolarApi estaba caído **solo para blue** y había un valor cacheado de `oficial`,
entonces `blueView` era `null`, se pasaba el `if` porque `oficialView` existía, y
`preferredView!.rate` explotaba con un `TypeError` → **500**.

**Cómo se reproducía**: con Redis precargado solo `currency:usd:oficial` y
`globalThis.fetch` tirando para blue.

### El arreglo

`pickPrimary(preferred, blue, oficial)` elige la preferida y, si falta, la otra.
Tres cosas importan y por eso no es un `??` cualquiera:

- **Devuelve el `rateType` real**, no el pedido. Servir el número del `oficial`
  etiquetado como `blue` sería mentirle al cliente sobre qué tipo de cambio está
  mirando, y el `Money` formatea distinto según el tipo.
- **503 solo si fallan las dos.** La guarda está dentro de `pickPrimary` como
  red de seguridad, no como camino alcanzable: los callers ya tiran antes.
- **Loguea el fallback.** Un `blue` caído que se sirve como `oficial` es una
  degradación que alguien tiene que notar.

`reorder()` (el camino de la caché) tenía el mismo problema en silencio: si la
preferida no estaba en la caché, devolvía la vista con el `rateType` de la
cacheada, sin avisar. Ahora pasa por el mismo `pickPrimary`.

Hay 5 tests que cubren las combinaciones: las dos vivas, cada una cayendo, el
`reorder` por caché, y las dos caídas.

## 21. `cardsMissingPrice` no cuenta los `market: null`

**Bug menor, mismo origen que la "Causa 3" de [pricing.md](pricing.md).** El
`totalValueUsd` se calcula sobre `lp.market`:

```sql
COALESCE(SUM(i.quantity * lp.market), 0)::float8 AS "totalValueUsd"
```

`SUM` ignora los `NULL`, así que una carta cuya fila de precio tiene
`market: null` aporta **$0** al total. Pero el conteo de "cartas sin precio"
mira **solo si la fila existe**:

```sql
COUNT(DISTINCT i."cardId") FILTER (
  WHERE NOT EXISTS (
    SELECT 1 FROM card_prices cp WHERE cp."cardId" = i."cardId"
  )
)::int AS "cardsMissingPrice"
```

(`collections.service.ts:566`, y el mismo patrón en `share` y `friends`)

O sea: hay cartas que **no suman al total** y **no aparecen en
`cardsMissingPrice`**. El número que la UI usa para avisar "faltan N precios"
es un piso, no el total real.

**Cómo se arregla** (cuando toque): cambiar el `NOT EXISTS` por algo que también
exija `market`:

```sql
WHERE NOT EXISTS (
  SELECT 1 FROM card_prices cp
  WHERE cp."cardId" = i."cardId" AND cp.market IS NOT NULL
)
```

**Workaround mientras tanto**: si `totalValueUsd` no cuadra con lo que el
cliente calcula multiplicando, cruzá `GET /cards/:id/prices` de las cartas
dudosas y fijate si el `variant` del item tiene fila con `market: null`.

## 22. `sort=price` ya está implementado (antes caía al orden por nombre)

`SearchCardsDto` acepta `sort` con cuatro valores:

```ts
export const CARD_SORT_FIELDS = ['name', 'rarity', 'number', 'price'] as const;
```

Antes `buildOrderBy` (`cards.service.ts`) tenía `case 'price'` cayendo al
`default`, o sea **ordenaba por nombre** sin ningún error: el DTO validaba, la
respuesta llegaba, el orden simplemente no era el pedido.

**Cómo quedó**: `sort=price` ordena por el **mejor precio de mercado disponible**
de la carta, con un `LEFT JOIN` que colapsa las variantes a un solo precio:

```sql
LEFT JOIN (
  SELECT best."cardId" AS "cardId", MAX(best.market) AS "price"
  FROM (
    SELECT DISTINCT ON (p."cardId", p.variant)
      p."cardId" AS "cardId", p.variant AS "variant", p.market AS "market"
    FROM card_prices p
    ORDER BY p."cardId", p.variant, p."fetchedAt" DESC
  ) best
  WHERE best.market IS NOT NULL
  GROUP BY best."cardId"
) cp ON cp."cardId" = c.id
```

Tres decisiones que costaron pensar, y por qué:

1. **`MAX(market)` y no "la holofoil"**. La holofoil es la más cara casi siempre,
   pero hay cartas que solo tienen `reverseHolofoil` o `firstEdition`: con una
   variante fija quedarían en `NULL` y se ordenarían como "sin precio" teniendo
   precio. `MAX` además es determinista (no depende del orden físico de las
   filas) y esto **pagina**: dos requests seguidos tienen que devolver el mismo
   `ORDER BY`.
2. **El `WHERE market IS NOT NULL` va en el subselect externo**, no adentro del
   `DISTINCT ON`. Es el gotcha 16: Postgres no combina `DISTINCT ON` con `WHERE`.
3. **`NULLS LAST` explícito en las dos direcciones**. Sin precio son ~20.600 de
   20.670 cartas, y con `direction=desc` el default de Postgres es
   `NULLS FIRST`: "más caras primero" arrancaba por las cartas que no tienen
   precio. Siempre al final, en las dos direcciones.

El `LEFT JOIN` (y no un `INNER`) es lo que permite que las cartas sin precio
sigan apareciendo en la lista, solo que ordenadas al final. La variante
`market` es la que usa `latestPriceJoin` en `collections.service.ts`: si mañana
cambia la fuente de precios, cambia en los dos lugares.

## 23. `rarity` y `supertype` son igualdad case-insensitive, no substring

`buildFilters` (`cards.service.ts:376`):

```ts
if (dto.rarity)    conditions.push(Prisma.sql`c.rarity ILIKE ${dto.rarity}`);
if (dto.supertype) conditions.push(Prisma.sql`c.supertype ILIKE ${dto.supertype}`);
if (dto.setId)     conditions.push(Prisma.sql`c."setId" = ${dto.setId}`);
if (dto.type)      conditions.push(Prisma.sql`c.types @> ARRAY[${dto.type}]::text[]`);
```

El `ILIKE` **sin comodines** es igualdad case-insensitive. No hay
`%${dto.rarity}%`.

Consecuencias:

| Query | Matchea | **No** matchea |
|---|---|---|
| `?rarity=Rare` | `Rare` | `Rare Holo`, `Reverse Holo` |
| `?rarity=rare` | `Rare` (por el `ILIKE`) | — |
| `?rarity=Rare%` | nada (el `%` es literal) | — |

Los DTO no limpian ni rechazan `%` o `_` en estos campos, así que
`?rarity=Rare%25` (URL-encoded) no filtra nada en vez de filtrar todos los
rare — a diferencia de `q`, que sí escapa con `escapeLike`.

**No es un bug de seguridad** (los valores van parametrizados, no concatenados),
pero sí de UX: un filtro de rareza que parece parcial es exacto.

**Cómo se arregla** (cuando toque): usar el mismo `escapeLike` que usa el campo
`q`, o cambiar el enum por una lista cerrada de rarities.

## 24. `searchBy=number` matchea por igualdad, no por substring

`GET /api/cards/search` tiene tres modos de búsqueda (`searchBy`): `name`
(default), `number` y `artist`. Los tres **no** se comportan igual, y esa
asimetría es intencional.

`cards.number` es un **token corto y repetido**, no un texto:

| Formato | Ejemplos | Cantidad en el catálogo |
|---|---|---|
| numérico | `"4"`, `"25"`, `"102"` | 19.046 cartas |
| con sufijo | `"4a"`, `"92a"` | 71 cartas |
| alfanumérico | `"TG02"`, `"H31"` | el resto |

`"4"` aparece en **163 sets distintos**. Con el substring de los modos textuales
(`ILIKE '%4%'`) el usuario que escribe `4` recebería el 4, el 40, el 104, el 4a y
el 140, mezclados y sin forma de distinguirlos: exactamente lo que **no** pidió.
El trigram tampoco ayuda —`similarity('4','40')` es altísimo— y además
`cards.number` no tiene índice trigram.

Por eso el modo `number` es de **igualdad**:

```ts
// cards.service.ts
const token = query.trim().replace(/^#/, '').trim();
return Prisma.sql`c.number ILIKE ${token}`;
```

Cuatro detalles que importan:

1. **Sin comodines**, así que el `ILIKE` es igualdad case-insensitive: `"tg02"`
   encuentra `"TG02"`, `"4A"` encuentra `"4a"`. Con el `ILIKE` pelado (sin `%`),
   como pasa con `rarity` en el gotcha 23, pero acá **sí** es lo que queremos.
2. **Normaliza el input**: trim y `#` inicial, que la gente escribe
   (`?q=%234` → `4`). Un `#` sin normalizar no matchea nada y parece un bug.
3. **No hay score**: todas las filas empatan, así que `buildScore` devuelve
   `1::float8` y el `ORDER BY` delega en `set.name`, número e `id`. Buscar `4`
   muestra Base 4, Jungle 4, Fossil 4… y no las cartas ordenadas alfabéticamente.
4. **El `total` significa algo**: "cuántas cartas se llaman 4" (163), que es lo
   que el usuario quiere contar. Con substring sería un número sin sentido.

**No hace falta índice trigram** para `number`: el `@@index([number])` del
`schema.prisma` resuelve el `ILIKE` con un Bitmap Index Scan (~2 ms sobre 20.670
cartas, medido). El GIN trigram es solo para `artist`
(`cards_artist_trgm_idx`, migración a mano: 72 ms → 12 ms).

## 25. `direction` se ignora cuando hay `q`

`direction` (`asc`/`desc`) solo se aplica al `sort`, y **el `sort` solo se aplica
sin `q`**: con texto la consulta ordena por score de relevancia. Darle la vuelta
al score no es "ver los últimos": pone lo **menos parecido primero**, que es
peor que no ordenar por score.

O sea: `?q=pikachu&sort=price&direction=desc` es un request **válido** que
devuelve 200 y ordena por score descendente, ignorando los dos parámetros. Sin
error ni warning, como el `sort=price` de antes.

**Por qué no es un 400**: `sort` tampoco falla cuando hay `q` (está documentado
desde siempre), y hacer que `direction` sí fuera strictamente distinto
obligaría al cliente a saber la regla antes de mandar el request. Lo que sí
importa es que **el frontend no lo prometa**: si el control de dirección se
habilita con texto de búsqueda, el usuario va a clickear "más caras primero" y
no va a pasar nada. Si querés el comportamiento inverso, hay que cambiar el
contrato (agregar `sort=price` con `q` y ordenar por precio **dentro** de los
matches), no invertir el score.

## 26. El `DISTINCT ON` de precios sin filtro leía **toda** la tabla — **arreglado**

> **Estado: corregido.** El join vive ahora en
> `src/common/sql/latest-price.ts` (`latestMarketPriceJoin`) y es un
> `LEFT JOIN LATERAL` anclado en el item. Abajo queda el problema, por qué la
> forma que se había elegido no era la buena, y las tres alternativas que se
> midieron. La versión corta de la lección: **en `card_prices`, siempre
> `LATERAL` + `LIMIT 1`; nunca un `DISTINCT ON` sin scope.**

`latestPriceJoin()` (en `collections.service.ts`, y el mismo patrón inline en
`share` y `friends`) colapsaba el último precio por variante así:

```sql
LEFT JOIN (
  SELECT DISTINCT ON (p."cardId", p.variant) ... FROM card_prices p
  ORDER BY p."cardId", p.variant, p."fetchedAt" DESC
) lp ON ...
```

No lleva `WHERE`, así que materializa **una fila por (carta, variante) de toda la
tabla** y la hashea contra los items. Con `card_prices` de 79 filas es gratis.
Medido con 138.119 filas (3.023 cartas, histórico de un año) sobre un usuario de
5 colecciones y 200 items:

```
HashAggregate (actual time=187.056..187.060 rows=5)
  -> Hash Right Join
       -> Unique (actual time=1.533..181.404 rows=3083)
            -> Incremental Sort (actual time=1.532..170.797 rows=138162)
                 -> Index Scan using card_prices_cardId_variant_fetchedAt_idx
                      (actual time=0.153..64.079 rows=138162)
Buffers: shared hit=136823
Execution Time: 187.345 ms
```

**Un solo `GET /api/collections` tarda 190 ms y lee 137.000 páginas** por una
razón que no tiene que ver con las colecciones: `card_prices` es append-only y
**no tiene job de poda** (`jobs.md`), así que el costo de este endpoint crece
con la historia global de precios, no con los items del usuario. El día que
`card_prices` tenga un año de datos de 20.670 cartas, la pantalla de colecciones
se cae.

### Las tres formas, medidas

Escenario: 142.379 filas en `card_prices`, un usuario con 5 colecciones y 200
items. `Buffers` es el máximo de los tres nodos (los shared hits de verdad; el
`Planning: Buffers: shared hit=277` que también aparece en el plan es del
planner y va aparte).

| Forma | Buffers | Execution |
|---|---|---|
| **A) `DISTINCT ON` global** (la que había) | 9.755 | 14 ms |
| **B) `LATERAL` por item** ✅ | **774** | **1,9 ms** |
| **C) `DISTINCT ON` + `EXISTS` de scope** | 30.278 | 24 ms |

```
B) ->  Limit  (actual time=0.008..0.008 rows=1 loops=200)
       ->  Index Scan Backward using card_prices_cardId_variant_fetchedAt_idx
              Index Cond: (("cardId" = i."cardId") AND (variant = i.variant))
```

**Por qué la C es la peor de las tres**, que es lo contraintuitivo: para poder
filtrar el `DISTINCT ON` por las cartas de cada colección hay que referenciar
`col.id` desde adentro, y Postgres no lo deja sin `LATERAL`; con `LATERAL` la
tabla derivada se **reejecuta una vez por colección** (5 veces acá), y cada
ejecución vuelve a recorrer el índice entero del `card_prices` porque el
`EXISTS` no es un index condition. Termina leyendo 3× más que A. El filtro de
scope no es gratis: la forma correcta del scope es el **anclaje por fila**, no un
`WHERE` dentro de la subquery.

**Nota sobre el plan de A:** con estos datos el planner no elige el `Hash Right
Join` del ejemplo de arriba sino un `Merge Left Join` que corta en ~12.500 filas
en vez de 142.000. Sigue siendo la peor de las tres, y sigue siendo un plan
**dependiente de la historia global**: el número de filas que se leen sale del
`card_prices` entero, no de los items del usuario. Por eso el arreglo tiene que
ser estructural (que el planner *no pueda* leer de más) y no "confiar en que
elija bien".

### Lo que queda

`share.service.ts` y `friends.service.ts` ya filtraban por
`p."cardId" = ANY($1)` en su `fetchLatestPrices` (traen las cartas de los items
que ya trajeron del `findMany`), así que nunca tuvieron el problema. El que sí lo
tenía y quedó arreglado es `friends.service.ts` → `summariesFor`, que agrega los
items de **varios** amigos en una sola query por `userId`. Ahora los tres
consumidores comparten el mismo fragmento, así que la regla "última fila de
`card_prices` de esa variante" tiene una sola implementación y el `totalValueUsd`
de un amigo no puede separarse del de su colección.

## 27. `LATERAL` con `LIMIT` gana a `row_number()` cuando se quiere el top-N por grupo

Para "las 4 primeras filas de cada grupo" hay dos formas y miden distinto. Con un
usuario de 5 colecciones y 200 items (142.379 filas de `card_prices`, que no
tocan esta query):

| Forma | Buffers | Execution |
|---|---|---|
| `CROSS JOIN LATERAL (... ORDER BY ... LIMIT 4)` | **310** | **1,0 ms** |
| `row_number() OVER (PARTITION BY ...) WHERE rn <= 4` (plano, sin lateral) | 604 | 4,6 ms |

La diferencia no es el `row_number()` en sí: es que la ventana necesita **todas**
las filas del grupo para poder numerarlas, y después tira 197 de cada 200. El
lateral se apoya en `collection_items_collectionId_idx`, corta en 4 por colección
y nunca mira el resto.

Lo que separa a las dos formas es la **asintótica**, no la constante. Con un
segundo usuario de 5 colecciones y 2.000 items:

| Forma | Buffers | Execution |
|---|---|---|
| `CROSS JOIN LATERAL (... LIMIT 4)` | **117** (3,7 ms) | |
| `row_number() ... PARTITION BY` | 6.033 | 15,9 ms |

El lateral queda **plano** (117 → 117) porque su costo es `5 × LIMIT 4`, y la
ventana se va **10×** con los items. Cuando el número de items por usuario
crezca, la diferencia no se estabiliza.

Corolario práctico: el `JOIN` a `cards` va **por fuera** del `LATERAL`. La tupla
de `cards` trae el `rawJson` (decenas de KB), y proyectar `imageSmall` antes de
descartar los items sobrantes hace 200 accesos al heap de `cards` en vez de 20
(627 → 84 buffers en el mismo escenario).

### Y el corolario del corolario: no pongas la ventana adentro del lateral

La primera versión de `loadCovers` (B9) metía un `row_number() OVER (ORDER BY
...)` **adentro** del `LATERAL`, con el `LIMIT 4` por encima, y usaba ese `rn`
para el `ORDER BY` de afuera. Era redundante por partida doble: el `LIMIT` ya
elige las 4 filas y el `ORDER BY` del lateral ya las ordena. La ventana se pagaba
sobre **todos** los items de la colección para descartar casi todos, que es
justo el antipatrón que hizo descartar la forma con `row_number()` entero.

Midiendo las dos, 5 colecciones / 200 items: 310 buffers y 1,0 ms con la ventana,
299 y 0,95 ms sin ella. Con 2.000 items: 117 y 3,7 ms contra 114 y 2,0 ms. La
diferencia es chica, pero la versión sin ventana es estrictamente menos código y
no tiene el antipatrón.

Lo que **sí** quedó del `rn` es el `ORDER BY` de afuera, con el mismo criterio
(`quantity DESC, addedAt ASC, id ASC`). Como `id` es la PK del item, ese orden
es **total**: dos requests seguidos devuelven el mismo mosaico, que es la
razón de ser del desempate.

## 28. El `DISTINCT ON` de `card_prices` es lo que hace que el delta de 30 días sea barato

`card_prices` es append-only, así que una carta refrescada N veces tiene N filas
por variante. Para el precio de hace 30 días alcanza con:

```sql
SELECT DISTINCT ON (p.variant) ... FROM card_prices p
WHERE p."cardId" = $1 AND p."fetchedAt" < $2
ORDER BY p.variant, p."fetchedAt" DESC
```

El `AND "fetchedAt" < $2` es lo que salva el costo: el planner lo usa como
**index condition** de `card_prices(cardId, variant, fetchedAt)`:

```
Unique  (actual time=3.742..3.972 rows=8 loops=1)
  ->  Sort  (actual time=3.741..3.831 rows=2696 loops=1)
        ->  Bitmap Heap Scan on card_prices p  (actual time=0.842..1.722 rows=2696 loops=1)
              ->  Bitmap Index Scan on "card_prices_cardId_variant_fetchedAt_idx"
                    Index Cond: (("cardId" = 'base1-1') AND ("fetchedAt" < now() - '30 days'))
Buffers: shared hit=96
Execution Time: 4.153 ms
```

Medido sobre 142.379 filas: **120 buffers y 3,4 ms** en el peor caso razonable
(8 variantes × 365 días = 2.920 filas de una carta, 2.696 anteriores a la
ventana). **No hace falta un índice nuevo**, y el `Sort` de 2.696 filas en
memoria no se justifica (index-only no serviría igual: `market` y `mid` no están
en el índice, así que el acceso al heap es necesario de todos modos).

Lo que **no** hay que hacer es escribir el `DISTINCT ON` sin el filtro de fecha
("traeme el último de cada variante y listo"): eso es el gotcha 26. Con una sola
carta la diferencia es chica (113 buffers sin el filtro contra 120 con él,
3,9 ms contra 3,4 ms) porque el índice ya acota por `cardId`; la diferencia
aparece cuando el `card_prices` completo entra en el plan, que es el caso del
gotcha 26.


## 29. El `orderBy` de Prisma no llega a `card_prices`, y un filtro escrito dos veces diverge

`GET /collections/:id/items` gana `sort=price` y `sort=number`
(`itemsForPage`, en `collections.service.ts`). Los dos muestran por qué el
`orderBy` de Prisma no alcanza:

- **`price`**: el precio vive en `card_prices`, y el `orderBy` de Prisma solo
  ordena por columnas o por relaciones **del modelo**. No hay forma de decir
  "ordená por el último `market` de esta variante" sin salir a SQL.
- **`number`**: necesita `CAST(NULLIF(regexp_replace(c.number, '\D', '', 'g'), ''))`,
  y no hay `orderBy` que caste una columna de texto a número.

La forma que quedó es **una query de ids ya ordenados + un `findMany` por esos
ids**, con el precio del `latestMarketPriceJoin` de siempre (que es `LEFT JOIN
LATERAL` anclado en el item, no un `DISTINCT ON` global: gotcha 26). Son 3
queries fijas — ids, `count`, `findMany` — más el `fetchLatestPrices` de siempre.
No es N+1, y no pide un solo request al proveedor de precios.

### La trampa de verdad: el filtro está escrito dos veces

`itemWhere` (objeto de Prisma) y `itemFilterSql` (SQL) tienen que decir **lo
mismo**, porque los dos alimentan la misma respuesta: los ids ordenados salen del
SQL y el `total` sale del `count` de Prisma. Si uno acepta un filtro que el otro
no, la página mostrada y `total` dejan de ser el mismo conjunto — y no hay
error, hay un `totalPages` que no cuadra con la última página.

Por eso el `total` sale **siempre** del `count` de Prisma y no de un
`COUNT(*) OVER ()` de la query de ids: un window function cuenta bien, pero en
una página más allá del final no hay filas y el `total` devolvería 0, que es
justo donde el usuario mira si hay más.

**Regla**: cuando agregues un filtro a `ListItemsDto`, agregalo en los dos
lugares. Si algún día duele, el arreglo es una query de items completa en SQL (con
`toItemDto` hecho a mano), no dejar que los dos filtros se separen.

## 31. [Un lock se suelta con compare-and-delete, nunca con `DEL`](#31-un-lock-se-suelta-con-compare-and-delete-nunca-con-del)

`card_sets` tiene dos totales y pokemontcg.io los llena distinto: `printedTotal`
es el número regular y `total` suma las variants raras y secretas. Difieren en
**106 de 176 sets**:

| Set | `printedTotal` | `total` |
|---|---|---|
| `me5` (Pitch Black) | 84 | 120 |
| `me3` (Perfect Order) | 88 | 124 |
| `me1` (Mega Evolution) | 132 | 188 |
| `me55` (30th Celebration) | 128 | 161 |

El `identify` usaba igualdad exacta contra `printedTotal` para el "N/M" del OCR,
que es el bonus más fuerte del ranking (0,25, el único que identifica set *y*
carta). Con la fuente dividiendo el set en dos números, esa señal se perdía
para más de la mitad del catálogo sin que nadie lo notara: no tira error, la
carta simplemente deja de tener esa evidencia y el ranking se apoya en el
nombre.

Ahora matchea contra los dos (`printedTotal` OR `total`).

**Y ojo al caso que los dos no cubren**: hay sets donde la carta imprime un
número que la fuente no tiene en ningún campo. `me55` (30th Celebration) imprime
`092/120`, y sus 128 y 161 no son 120; TCGdex dice que el set tiene 158 cartas.
Ahí el denominador no matchea nada y no hay forma de arreglarlo con datos: la
señal del set tiene que venir de otro lado, y por ahora viene del código
impreso (`ptcgoCode`, ver `api.md` → "El código de set").

**Regla**: un dato de la fuente que se usa para matchear contra algo que el
usuario tiene en la mano físico hay que contrastarlo contra la realidad antes de
confiar en él. Acá se detectó con una foto, no con un test.

## 31. Un lock se suelta con compare-and-delete, nunca con `DEL`

**Agregado el 2026-09-29**, con el lock de `POST /api/jobs/sync-catalog`.

Un lock distribuido son tres operaciones, y la tercera es la que everybody
olvida:

```ts
// ❌ Mal: si el TTL de A venció y B tomó el lock, esto le borra el lock a B.
await redis.del(key);

// ✅ Con token único, y la comparación + el delete en una sola operación.
await redis.eval(
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
  1, key, token,
);
```

La ventana del `DEL` a secas no es teórica: entre el `GET` y el `DEL` de una
implementación ingenua, el TTL puede vencer y otro sync tomar el lock. Con el
`EVAL` la comparación y el borrado son atómicos, así que la sola forma de borrar
el lock de otro es tener su token.

Lo mismo aplica a la renovación (`extendLock`), que también compara antes de
expirar.

**La segunda lección es dónde va el `acquire`.** El lock se toma **antes** de
crear el `ScanJob`:

```ts
// ❌ Mal: la ventana entre el create y el acquire alcanza para que entren dos.
const job = await this.prisma.scanJob.create({ … });
if (!(await this.redis.acquireLock(…))) throw new ConflictException(…);
```

Un `create` que se usa para "avisarle al otro que ya hay uno corriendo" tiene una
ventana entre el `create` y el `acquire`, y en esa ventana el segundo proceso ve
una base sin jobs, pasa el chequeo y entra igual. El registro es una consecuencia
del lock, no la condición para tomarlo.

**Y el TTL es una red, no un mecanismo.** Si el TTL fuera más corto que el sync
(que tarda 15-20 min), el lock se vencería solo y un segundo sync empezaría a
trabajar sobre el mismo cursor. Por eso `runSync` renueva el TTL a mitad de vida
con un `setInterval` (`unref`, para no impedir que el proceso baje), y el TTL
solo expira cuando el proceso **realmente** murió.

**Regla**: un lock sin token es un boolean con TTL, y un boolean con TTL no es un
lock. Es dos locks que se pisan.

## 32. Un `LEFT JOIN` de precios sin filtro de proveedor compila y miente

**Qué pasó**: `card_prices` pasó a tener `provider` y a convivir con 180 filas
`NULL` (anteriores a la columna), pero las agregaciones seguían uniteando por
`("cardId", variant, fetchedAt)`. Con una sola fuente escribiéndose, eso es
correcto. El día que entra la segunda, `totalValueUsd` de una colección suma
una valuación de tcgdex con una de pokemontcg.io y el resultado no es el precio
de nada: es la suma de dos métricas distintas.

**Por qué no lo agarró ningún test**: mientras las pruebas corrían con fixtures
de un solo proveedor, las dos versiones del join dan el mismo número. El fallo
solo aparece con filas de dos proveedores en la misma carta, que es exactamente
el estado en el que nadie escribe tests hoy.

**Cómo queda el código**: `latestMarketPriceJoin(policy)` **exige** la política
como parámetro y no tiene default. El filtro es `provider = <activo> AND source
= <mercado> AND currency = <moneda>`, y los cuatro call sites
(`collections`, `friends`, `share`, `stats`) la reciben por inyección de
`PRICE_PROVIDER`. Un argumento opcional habría sido la forma de mantener el bug
en la deuda: el default es exactamente el valor que se forgets.

**El otro lado, que es el que se mira**: la ficha de una carta **sí** puede
mostrar una fila de otro proveedor como último conocido, con `isStale: true`.
Mostrar una cifra vieja marcada como vieja es honesto; valorarla en un total no
lo es. Por eso el fallback existe en `getPricesForCard` y no existe en el
`LATERAL`.

**Consecuencia que hay que conocer**: recién migrada la columna, con las 180
filas legacy y ninguna del proveedor activo, `sort=price` y los totales devuelven
cero. Es el estado correcto de una base cuyo proveedor activo todavía no escribió
nada, y la forma de arreglarlo es que escriba, no abrir el filtro.

## 33. Un rate limit en memoria es un rate limit por proceso

**Qué pasó**: el ritmo hacia TCGdex eran dos números en `SyncPricesService` —un
`queue: string[]` y un `lastProviderCallAt = 0`—. Con una sola instancia
funcionaba: los requests salían espaciados 2,3 s y la cola drenaba sola.

El día que la cola pasó a ser una tabla, la primera pregunta legítima era si
sigue valiendo. Y no: `lastProviderCallAt` era **un reloj por proceso**, así que
con dos instancias del backend cada una contaba su propio gap y el ritmo agregado
hacia el proveedor era el doble. Todo lo demás de la app es shared —el catálogo
espejado, las colecciones, los locks por token—, así que la cola era lo único
que delataba que el resto del diseño ya era multi-instancia y esta parte no.

**Por qué no lo agarró ningún test**: los tests usan un solo
`SyncPricesService`, y con un solo proceso la implementación en memoria y la
persistida dan exactamente el mismo resultado. La diferencia solo aparece con dos
consumidores concurrentes, que es el estado en el que nadie escribe tests porque
"no pasa en desarrollo".

**Cómo queda el código**: el ritmo es `ProviderRateGate` sobre la tabla
`provider_rate_limits`, una fila por proveedor. Tomar el hueco es un `UPDATE`
condicional (`WHERE "lastCalledAt" <= now() - gap`), y si no matchea el que
espera lee cuándo se liberó y duerme esa diferencia exacta. `MIN_GAP_MS` no
vive en ningún servicio.

**Y la regla que se generaliza**: si un valor tiene que ser **único** —un lock, un
cursor, un reloj compartido, una secuencia— no puede vivir en la memoria de un
proceso. El síntoma de que está en el lugar equivocado es que "funciona en
desarrollo" y falla con dos réplicas. Redis alcanza mientras haya una sola
instancia y es un lugar de basura para lo que Postgres ya resuelve con una fila.

Lo mismo se aplicó al cursor del sync (`sync:cards:lastPage` era una clave Redis
de granularidad global, y un `flushall` reiniciaba el sync desde la página 1):
ahora es una fila de `sync_state` con id `cards:<providerId>`.

## 34. Un `null` de Redis puede ser "todavía no conectó", y en un script de migración es un no-op silencioso

**Qué pasó**: `scripts/migrate-sync-state.ts` tiene que pasar el cursor del sync
de Redis a `sync_state`. Su primera versión leía las claves y, si no había nada,
decía "no hay cursor que migrar" y salía con código 0.

Corrida de prueba: `redis-cli GET sync:cards:lastPage` devolvía `8`, y el script
dijo que no había nada. La clave existía.

**Por qué**: `RedisService.onModuleInit()` no espera la conexión —es a propósito,
para que la app arranque igual sin Redis— y `get()` devuelve `null` cuando
`isAvailable()` es falso. El script leía `null` por una conexión que todavía no
estaba lista, no por una clave ausente. Los dos `null` son indistinguibles para
la API.

**Por qué importa tanto acá**: en la app, un `null` de Redis es inocuo —es un
cache miss— y el diseño degradado lo asume. En un script de migración, un `null`
indeterminado hace que el script reporte un éxito que no ocurrió, que es la peor
forma de fallar: el operador cree que migró y el cursor se perdió igual. La
migración de todas formas habría sido un no-op en este caso, porque el destino
estaba vacío; el daño real es **creer** que se corrió.

**Cómo queda el código**: el script espera a que Redis esté listo y **aborta con
error** si no lo está, distinguiendo "Redis no disponible" de "no hay cursor". Y
`onModuleInit` sigue sin esperar, porque en el camino de un request esperar la
conexión sería peor que la cache miss.

**Lo mismo aplica a cualquier `map-tcgdex-sets.ts`**, que también usa Redis con
`onModuleInit` y no espera: hoy le funciona por suerte. No se cambió porque está
fuera de esta etapa, pero es la misma trampa.

## Cross-references

- [api.md](api.md) — los endpoints y sus formas
- [database.md](database.md) — el schema y los patrones de query
- [pricing.md](pricing.md) — el sistema de precios y la regla de las 2 capas
- [jobs.md](jobs.md) — el sync reanudable
- [testing.md](testing.md) — por qué los specs corren en serie
