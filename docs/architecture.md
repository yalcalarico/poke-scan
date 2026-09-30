# Arquitectura

> Qué hace el sistema, cómo se arma y por qué está partido como está.

## Vista general

```
┌──────────────────────────────────────────────────────────────┐
│  PWA — Next.js 16 (App Router) · mobile-first                │
│                                                              │
│  El ESCÁNER corre entero en el CLIENTE:                      │
│    cámara → recorte → OCR (Tesseract) → parseo → /identify  │
│  La app funciona sin internet para escanear (Tesseract       │
│  auto-hospedado en /public/tesseract, ~12 MB)                │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTPS · JSON · JWT Bearer
┌───────────────────────────▼──────────────────────────────────┐
│  API — NestJS 12                                             │
│                                                              │
│ (auth)      register/login/refresh · rotación + anti-reuso   │
│  (cards)    búsqueda difusa · detalle · identify · precios   │
│  (collec.)  colecciones · items · duplicados · stats         │
│  (share)    links públicos de solo lectura                    │
│  (friends)  solicitudes entre usuarios                        │
│  (currency) cotización USD→ARS (DolarApi)                    │
│  (jobs)      sync de catálogo · refresco de precios          │
│  (providers) capa de abstracción de la fuente (intercambiable) │
└──────┬─────────────────────────────────┬─────────────────────┘
       │                                 │
┌──────▼──────────────┐          ┌───────▼─────────────────────┐
│ PostgreSQL 16       │          │  Redis 7                     │
│ 20 670 cartas       │          │  precios (1 h)               │
│ 176 sets            │          │  cotización (1 h)            │
│ usuarios, colecciones│         │  cursor del sync             │
│ precios (histórico) │          │  share público (5 min)       │
└─────────────────────┘          └─────────────────────────────┘

           ▲ solo los jobs hablan con pokemontcg.io
           │ (nunca un handler público — ver data-sources.md)
┌──────────┴───────────────────────────────────────────────────┐
│  pokemontcg.io v2   (deprecada, sin key: 1000/día · 30/min) │
│  DolarApi.com       (cotización ARS, gratis)                 │
└──────────────────────────────────────────────────────────────┘
```

## El flujo de datos, paso a paso

### 1. Escanear una carta (todo local hasta el último paso)

```
Cámara (getUserMedia)
   │  el video se muestra con object-cover; el marco guía se calcula en JS
   ▼
captureFrame()  ── recorta al rectángulo del marco
   │            ── mapea con la matemática de object-cover
   ▼
preprocess: 3 variantes en paralelo lógico
   │  original · grayscale+autoContrast · adaptiveThreshold (Sauvola)
   ▼
Tesseract (3 pasadas, una por variante)
   │  el worker es singleton; ~2,6 s por pasada
   ▼
pickBestAttempt: gana la de mayor confianza de OCR
   │
   ▼
parseOcrText → líneas crudas + nameGuess/numberGuess/setHint
   │
   ▼  POST /api/cards/identify  { lines, name, number, setHint }
   ▼
IdentifyService: fuzzy-match de las líneas sucias contra 20 670 nombres
   │  pg_trgm + penalizaciones (ver identify.service.ts)
   ▼
top 8 candidatos con score → el usuario confirma
   │
   ▼  POST /collections/:id/items
   ▼
addItem → encola el refresco de precio (no bloquea)
   │
   ▼
cola con 2,3 s entre requests → 26 req/min → bajo el límite de 30
```

**Por qué el OCR va en el cliente:** mandar la imagen a un servidor propio
exigiría upload + storage y multiplicaría la complejidad, mientras que
Tesseract pesa ~12 MB y se puede auto-hospedar. El único dato que cruza al
servidor son **las líneas de texto**, que pesan bytes.

**Por qué el cliente no matchea contra el catálogo:** no tiene las 20 670 cartas.
Mandar las líneas sucias y que las matchee quien sí tiene el catálogo es más
robusto que cualquier heurística de parsing: el catálogo valida por nosotros.

### 2. Consultar el precio de una carta

```
Usuario abre /carta/[id]
   │
   ├─ SSR: carta y set desde el catálogo local (cache de Next: 1 h)
   │
   ├─ HTML de la ficha se entrega sin esperar el precio
   │
   └─ el cliente pide /cards/:id/prices y el backend decide:
      Redis (1 h) → Postgres (24 h) → cola/fuente
      el hero muestra su skeleton mientras tanto
```

Las dos capas autoritativas de caché viven **solo en el backend** a propósito:
si el cliente tuviera su propia caché, la regla de 24 h podría quedar desalineada
entre dispositivos. La carga de precio en cliente evita que una respuesta lenta
de la fuente retenga todo el SSR de la ficha.

### 3. Compartir

```
Colección → POST /share → slug aleatorio de 10 chars
                    ↓
            GET /s/:slug  (público, sin sesión)
                    ↓
      items + stats, cacheados 5 min en Redis
      viewCount incrementado fire-and-forget
      NUNCA expone email, username ni id del usuario
```

## La estructura del frontend

El `app/` tiene **cuatro ramas y un layout raíz**, y la razón de que sean carpetas
hermanas y no route groups anidados está en
[`frontend/docs/gotchas.md`](../frontend/docs/gotchas.md) §17.

```
app/
  layout.tsx      raíz: <html>, metadata, script anti-flash, skip link, <Providers>
  providers.tsx   ThemeProvider · AuthProvider · CurrencyProvider · ToastProvider
  (marketing)/    <MarketingShell> — SIN BottomNav: / · /faq
  (app)/          <AppShell> — CON BottomNav: /inicio · /buscar · /carta/[id] ·
                  /escanear · /colecciones* · /ajustes
  (auth)/         <PlainShell> — SIN nav: /login · /registro
  share/          <PlainShell> — SIN nav: /share/[slug]
```

Tres cosas que explican el resto del árbol:

- **Los providers están arriba, en el layout raíz.** Son de la app entera, no de un
  tipo de pantalla. Montarlos por rama los duplicaría y el estado de la moneda y
  del tema se perdería al navegar.
- **La landing pública y la app instalada son rutas distintas.** `/` explica y
  promociona el producto; `/inicio` es el `start_url` de la PWA y monta el shell.
- **La `BottomNav` es navegación de *tu* cuenta.** Por eso no aparece en la vista
  pública de una colección compartida ni en el login: mandar a alguien a buscar,
  escanear, colecciones y ajustes arriba de la colección de otra persona es un
  invito a dejar de mirarla.
- **El servidor no pide nada de la cuenta.** El token vive en `sessionStorage`, así
  que ninguna ruta bloquea el acceso en el server: la ruta renderiza siempre y el
  componente cliente decide. `RequireAuth` es la única con guard dedicado, y hace
  `router.replace('/login')`.

El detalle completo está en [`frontend/docs/routes.md`](../frontend/docs/routes.md).

## Por qué dos proyectos y no un monorepo

Decisión consciente, no accidentada. El contexto: el proyecto empezó con la
necesidad de que **dos agentes trabajen en paralelo sin pisarse**, y cada
agente contexto su propio proyecto.

| A favor | En contra (y por qué se ignoró) |
|---|---|
| Un agente lee el backend y **jamás** ve JSX | Tipos compartidos obliga a sincronizar a mano |
| Los agentes no se pisan en `package.json` | Tipos duplicados (`types/api.ts` ↔ DTOs) |
| Un `pnpm run dev` en la raíz los levanta igual | No hay type-checking cruzado |
| Deploy de cada uno por separado | `pnpm install` se corre 3 veces |

El costo asumido es la duplicación de los tipos del contrato. Se mitiga con una
regla estricta: **si tocás un DTO, actualizá el otro lado en el mismo commit**.

## Decisiones de seguridad

| Decisión | Por qué |
|---|---|
| Ownership en el `where`, no como check previo | `findFirst({ where: { id, userId } })` da 404 en vez de 403. Un 403 confirma que el recurso existe. |
| Refresh tokens **opacos** (`randomBytes(48)`), no JWT | Se pueden revocar en BD. Un JWT no se puede revocar sin lista negra. |
| Detección de reuso de refresh token | Si un token ya rotado se vuelve a usar, se revocan **todas** las sesiones del usuario: señal clásica de robo. |
| Contraseñas con argon2id | Incluido en el runtime de Node, sin dependencia nativa extra. |
| El endpoint público nunca toca la API externa | Si lo hiciera, un visitante anónimo podría agotar el rate limit en minutos. |
| `totalValueArs` siempre `null` en el server | El cliente convierte con el rate cacheado: agrega cero latencia a las listas. |

## Puntos donde el sistema es frágil

Documentados en detalle en `docs/data-sources.md` y los `gotchas.md` de cada
proyecto. El resumen para el que arrive nuevo:

1. **pokemontcg.io se deprecó.** Las keys nuevas ya no se dan; las existentes
   mueren el 1 de marzo de 2027. La capa `CardDataProvider` existe para poder
   cambiar a Scrydex sin reescribir.
2. **El rate limit manda sobre el diseño.** Nada puede llamar a la API externa
   desde un handler público. Si agregás una funcionalidad que necesite precios
   frescos, tiene que pasar por el servicio de precios.
3. **Los precios llegan por detrás.** Una carta recién agregada tarda ~2 s en
   tener precio. La UI lo maneja con skeleton.
4. **El OCR es probabilístico.** Acierta ~7/8 cartas. Por eso la UI siempre
   pide confirmación y ofrece búsqueda manual.
