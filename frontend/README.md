# Frontend — PokéScan

PWA mobile-first para escanear cartas Pokémon con la cámara, consultar su valor de
mercado, gestionar colecciones personales y compartirlas por link público.

Es el **único** proyecto Next.js del repo y **no comparte código** con el backend:
los tipos del contrato están duplicados a mano (`types/api.ts` ↔ DTOs de NestJS). Si
tocás un DTO, actualizá el otro lado en el mismo commit.

## Stack (versiones exactas)

| | Versión | Nota |
|---|---|---|
| Next | 16.3.6 | App Router, Turbopack, `output: "standalone"` |
| React | 19.2.8 | StrictMode monta efectos **dos veces** en dev |
| TypeScript | 5.x | `strict: true`, alias `@/*` → raíz del frontend |
| Tailwind | 4.x | Config por CSS (`app/globals.css`), sin `tailwind.config.js` |
| tesseract.js | 7.0.0 | **Solo cliente**, nunca en el grafo del server |
| Vitest | 5.x | `node` por default; los tests de componentes usan `jsdom` por archivo |
| pnpm | 10.17.1 | Único gestor de paquetes. Nunca npm ni yarn |

## Arrancar

```bash
# desde la raíz del repo (sube API + web + chequea infra)
pnpm run dev

# solo el frontend (puerto 3000)
pnpm run dev:web
cd frontend && pnpm run dev
```

| | |
|---|---|
| Web | `http://localhost:3000` |
| API (backend) | `http://localhost:3001/api` |

La URL del backend sale de `NEXT_PUBLIC_API_URL` (ver `.env.local`). **Está embebida
en el bundle en build**: cambiarla en runtime no tiene efecto, hay que rebuildar.

Scripts propios del frontend:

```bash
pnpm run dev          # next dev
pnpm run build        # next build
pnpm run start        # next start
pnpm run lint         # eslint
pnpm run test         # vitest run
pnpm run test:watch   # vitest
pnpm run icons        # regenera public/icons/*.png
```

## Estructura

```
frontend/
├── app/                    # App Router
│   ├── layout.tsx          # root: metadata, viewport, providers, service worker
│   ├── (marketing)/        # landing pública (/) + FAQ (/faq)
│   ├── not-found.tsx       # 404 global
│   ├── providers.tsx       # AuthProvider > CurrencyProvider
│   ├── pwa-sw-register.tsx # registra /sw.js solo en producción
│   ├── globals.css         # Tailwind 4 + tokens y reglas PWA
│   ├── robots.ts           # reglas de rastreo
│   ├── sitemap.ts          # landing, catálogo y FAQ
│   ├── (app)/              # app PWA: inicio (/inicio), catálogo y colecciones
│   ├── (auth)/             # route group: login/registro, layout centrado
│   └── share/[slug]/       # público, FUERA de (app) a propósito
├── components/             # design system, app y sitio público
│   ├── layout/ marketing/ auth/ cards/ collections/ prices/ scanner/ search/ share/ ui/
├── hooks/
│   ├── use-auth.tsx        # AuthContext (user, isLoading, login, logout…)
│   └── use-currency.tsx    # CurrencyContext (USD/ARS, blue/oficial, formatMoney)
├── lib/
│   ├── api/                # cliente HTTP + un módulo por dominio
│   ├── scanner/            # pipeline de OCR (camera/preprocess/ocr/parser/pipeline)
│   └── format.ts           # formato de moneda, fechas y tiempo relativo
├── types/api.ts            # espejo manual de los DTOs del backend
├── public/
│   ├── tesseract/          # ~14 MB de wasm/traineddata auto-hospedados
│   ├── icons/  manifest.json  sw.js
└── docs/                   # la documentación de este frontend
```

## Documentación

| Tema | Doc |
|---|---|
| Rutas, route groups, qué pide sesión | [`docs/routes.md`](docs/routes.md) |
| Inventario de componentes | [`docs/components.md`](docs/components.md) |
| **Pipeline de OCR** (el doc más técnico) | [`docs/scanner.md`](docs/scanner.md) |
| Cliente HTTP, tokens, refresh single-flight | [`docs/api-client.md`](docs/api-client.md) |
| Colores, tipografía, grillas, safe-area | [`docs/design-system.md`](docs/design-system.md) |
| Tests, helpers, tests opt-in | [`docs/testing.md`](docs/testing.md) |
| **Trampas reales que costaron tiempo** | [`docs/gotchas.md`](docs/gotchas.md) |

## Antes de dar algo por terminado

Ningún cambio se considera terminado sin esto en verde:

```bash
pnpm run check    # lint + typecheck + tests + build, de los dos proyectos
```

Si tocaste algo con impacto de datos o cámara, probá el flujo real contra el stack
levantado, no solo los tests.
