# Card Scanner Pokémon: Plan de identificación visual

Evolución de la app que ya existe. **No es un proyecto nuevo**: es agregar
identificación por apariencia (embeddings) al endpoint `POST /api/cards/identify`
que hoy rankea solo con OCR, y Improve la experiencia de escaneo.

> Este es el punto de entrada. Leé este archivo y `01-CONTRACTS.md` antes de
> tocar código. Lo que ya está implementado y sus trampas están en los docs de
> cada proyecto: `backend/docs/` y `frontend/docs/`.

## 1. Por qué este plan existe

La app actual identifica **solo con OCR**. Medido sobre 5 fotos reales de un
usuario (colección 30th Celebration, cartas en funda sobre una frazada, a
resolución de celular), con OCR real de punta a punta:

| | Resultado |
|---|---|
| Shining Celebi, Pikachu, Umbreon, Chandelure | ✔ top-1 |
| **Hisuian Zorua** (full-art, nombre en contorno blanco) | ✘ ni llega a candidatos |

Dos fallas que el OCR no resuelve:

1. **Cartas cuyo nombre no se puede leer.** Zorua sale del OCR como
   "pie Zeus" / "HisiiZnZEORUR". Ningún pre-procesado ni ajuste de ranking lo
   arregla: es falta de información en los píxeles.
2. **Basura que matchea una carta real.** "Pokémon Park" (Aquapolis 131) ganó
   con 0.87 emparejando el token "Pokémon" que aparece en el cuerpo de la carta,
   porque el OCR de la banda del nombre volvió vacío y solo quedaba texto
   secondary.

Las dos son exactamente la clase de problema que resuelve **identificar por
apariencia**: un embedding no lee, mira. Y es robust a brillo, holo y ruido.

**La dirección no cambia lo que ya funciona.** Los precios (tcgdex), las
colecciones con control de duplicados, los links públicos y los amigos quedan
intactos. El OCR se queda en el cliente (AGENTS.md §3.6) y el backend sigue
siendo NestJS con Postgres.

## 2. Lo que este plan NO hace

- No hay monorepo, ni Fastify, ni React+Vite. Se trabaja sobre `frontend/`
  (Next.js 16) y `backend/` (NestJS 12), que son dos proyectos independientes.
- No hay `POST /api/scan` ni `multipart`. Se extiende `POST /api/cards/identify`.
- No hay HNSW ni `data/cards/*.jpg`. Con 20.670 cartas el brute force en memoria
  es de 4-8 ms.
- No se toca `detectCardRect` salvo que el eval demuestre que hace falta.
- No se guarda ninguna imagen sin consentimiento explícito.

## 3. Arquitectura

```
CLIENTE (frontend/, Next.js)                BACKEND (backend/, NestJS)
┌──────────────────────────────┐            ┌─────────────────────────────────┐
│ cámara / archivo             │            │  Embedder (onnxruntime-node)    │
│  → detectCardRect + rotación │            │    └ 1 inferencia por escaneo   │
│  → OCR 9 pasadas (ya existe) │            │  card_embeddings (Postgres)     │
│    banda × 3 preproc × 2 PSM│            │    └ 20.670 × 384 f32 = 32 MB   │
│  → calidad: too_dark,        │            │  EmbedderService.buscar()       │
│    glare, nitidez, partial   │  ───────▶ │    └ producto punto, ~5 ms      │
└──────────────────────────────┘  imagen   │         top-200 por coseno      │
                                  + líneas │                    │            │
                                         │  identify() rankea SOLO │            │
                                         │  esos 200 (SQL actual, │            │
                                         │  sin cambios)          │            │
                                         └────────────┬────────────┘
                                                      ▼
                                            { status, candidates[], timings, hints }
```

**La decisión de diseño central: el embedding pre-filtra, no fusiona.** En vez de
sumar un score visual con pesos al score de texto:

1. Se embebe la foto y se toman los **200** candidatos por coseno.
2. `identify()` rankea **solo esos 200** con el SQL de siempre (trigram +
   HP + número impreso + artista + rareza + set).
3. `status` sale de `top1.score`, del margen contra `top2` y de la calidad de la
   foto.

Motivos: reutiliza todo el ranking que ya está medido y testeado (239 tests:
138 de backend y 101 de frontend), el
SQL sigue siendo chico, y el prior visual es fuerte. La fusión ponderada de
verdad queda para más adelante, cuando el eval tenga datos para calibrar pesos.
Ver `01-CONTRACTS.md §4` para el detalle y sus límites.

## 4. Documentos

| Archivo | Para quién | Contenido |
|---|---|---|
| `00-README.md` | Todos | Este documento: dirección, arquitectura, olas, criterios |
| `01-CONTRACTS.md` | Todos | Extensión compatible de `identify`: `status`, `hints`, `timings`, `visualScores` (**fuente de verdad**) |
| `02-EMBEDDINGS-spike.md` | Todos | El experimento de la puerta: distribución de cosenos y criterios de entrada/salida |
| `08-VERSION-DISAMBIGUATION.md` | Todos | Desambiguar reimpresiones de la misma ilustración (símbolo de set + regulation mark). Su §8.1 tiene la medición de 8.0 ya hecha |
| `07-INTEGRACION-Y-RIESGOS.md` | coordinador | Orden, riesgos reales, licensing, límites conocidos |

Docs de lo implementado (no se tocan, son la referencia real):
`frontend/docs/scanner.md` (pipeline OCR, detección, capturas), `frontend/docs/gotchas.md`,
`backend/docs/api.md`, `backend/docs/modules.md`, `backend/docs/gotchas.md`,
`backend/docs/pricing.md`.

## 5. Olas

```
OLA 0 — ARnés de eval (sola, sin dependencias)
  Dataset de fotos reales + línea base del OCR + `eval:diff`
  Sale: número contra el que comparar todo lo demás
             │
             ▼
OLA 1 — Spike de embeddings (la puerta de decisión)
  Descargar referencias, embeber, medir separación de cosenos
  NO toca producción. Sale: la tabla §3 de 02-EMBEDDINGS-spike.md
             │
        ┌────┴────┐
     PASA      NO PASA
        │         │
        ▼         ▼
OLA 2 — Integración    Ola 2' — OCR solamente
  card_embeddings       Se improves el OCR y los hints
  identify() con        con lo que ya sabemos
  prefiltrado visual    (banda, PSM, tamaño)
  status + hints
             │
             ▼
OLA 3 — Hardening: feedback con consentimiento, telemetry, ROI por era
```

**Ola 0 va sola y primero.** Es lo que convierte todas las decisiones siguientes
en medibles. La regla del repo ya lo dice de otra forma: "ningún cambio se
considera terminado sin esto en verde".

## 6. Criterios de la puerta (fijados ANTES de ver resultados)

Para que no se pueda justificar cualquier resultado después, el spike se
aprueba o se rechaza con esto, sin reinterpretar:

**El spike PASA si se cumple las dos cosas:**

1. Para al menos 4 de las 5 fotos, la imagen de referencia correcta está en el
   **top-10** por coseno.
2. La separación entre "misma carta" y "carta distinta" es usable: el coseno de
   la referencia correcta supera la mediana de los distractores por **≥ 0.10**
   (o ≥ 0.05 si el modelo se cuantiza a int8, que pierde precisión a propósito).

**Y si además se cumple esto, se elige el resto del stack:**

3. La latencia de una inferencia en la máquina de desarrollo entra en el
   presupuesto de §3 de `02-EMBEDDINGS-spike.md`.

**Cómo se lee cada resultado, sin ambigüedad:**

| Situación | Qué significa | Qué hacer |
|---|---|---|
| Las 2 condiciones | El enfoque funciona | Ola 2 |
| Solo la 1 | Hay señal pero no discrimina | Ola 2' y **no** seguir embeddings |
| Ninguna | El enfoque no sirve para este dominio | Ola 2' y el tema queda cerrado |
| Pasa el spike y después top-1 no mejora | El problema no era el ranking | Volver al eval antes de tocar más código |

**Sobre el tamaño de muestra.** 5 fotos alcanzan para un test **pareado** (misma
foto, una variable, comparar) — así se decidió lo del cap a 1400px, que fue
4/5 con cap contra 2/5 sin cap, y además cambiaron qué fotos fallaban. Para
comparar **modelos** (DINOv2 vs CLIP) 5 no alcanzan: hace falta 50-100 fotos
del dataset de Ola 0. No confundir los dos usos.

## 7. Roles y propiedad de carpetas

El plan viejo era de 5 agentes en paralelo con PRs de contrato como único
mecanismo de sincronía. Eso era sobreingeniería para dos repos. Ahora:

| Rol | Escribe en | Puede tocar |
|---|---|---|
| **QA/eval** | `eval/`, `frontend/scripts/*.e2e.ts` | Nada de producción. Escribe `HANDOFF` |
| **Embeddings** | `backend/src/modules/embeddings/`, `backend/prisma/` | `identify.service.ts` (solo el prefiltrado) |
| **Escaneo/UX** | `frontend/lib/scanner/`, `frontend/app/(app)/escanear/` | `01-CONTRACTS.md` por PR |

Reglas que ya rigen (AGENTS.md): pnpm y solo pnpm, imports relativos con `.js`
en el backend (ESM), Postgres en `localhost:55432`, `pg_trgm` Created a mano,
sin `any`, errores en español.

## 8. Metas

| Métrica | Hoy (OCR solo, 5 fotos) | Meta v1 (dataset de Ola 0) |
|---|---|---|
| Top-1 | 4/5 (80 %) | ≥ 90 % |
| Top-3 | 4/5 | ≥ 97 % |
| Cartas sin identificar | 1/5 (Zorua) | 0 en el set, `not_in_catalog` honesto |
| Costo de un escaneo (1 foto, resolución completa) | 8.6 s: 9 pasadas de OCR | < 10 s con la inferencia adentro |

La latencia **sube** y está bien: se compra exactitud. El presupuesto de la
inferencia está en `02-EMBEDDINGS-spike.md §3`.

## 9. Lo primero: la puerta

Antes de escribir código de embeddings, correr `02-EMBEDDINGS-spike.md`. Es un
experimento de un día con respuesta binaria, y decide si el resto de este plan
existe.
