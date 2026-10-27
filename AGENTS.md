# PokéScan — instrucciones del proyecto

PWA para escanear cartas Pokémon, consultar precios locales, gestionar colecciones
y compartirlas. Leé sólo la guía del área que vas a tocar: [índice](docs/README.md).
Para continuidad: [estado](docs/estado-actual.md) y [trabajo ODD](odd/README.md).
El pedido humano actual determina el alcance; un pendiente histórico no autoriza ejecutarlo.

## Estructura y entorno

- `frontend/`: Next.js 16.3.6, React 19.2.8, TypeScript, Tailwind 4.
- `backend/`: NestJS 12.1.0, Prisma 6.19.3, PostgreSQL 16; Redis para coordinación.
- Son proyectos independientes, sin workspaces ni código compartido. Los tipos de
  contrato se duplican: `frontend/types/api.ts` y DTOs backend; actualizá ambos
  lados en el mismo commit cuando cambie el contrato.
- Node 22.20.0, **pnpm 10.17.1 exclusivamente**. No actualizar dependencias sin motivo
  y autorización aplicable. No subir Prisma a 7: cambia el datasource.
- Web/API: 3000/3001. PostgreSQL host: **55432**, contenedor: 5432. Redis: 6379.
- Imports relativos ESM con `.js`. SQL crudo: tablas snake_case y columnas camelCase
  entre comillas (`SELECT "cardId" FROM card_prices`); `@@map` sólo renombra tablas.

## Invariantes de datos y seguridad

- Catálogo: pokemontcg.io v2 sin API key, **1.000 requests/día y 30/minuto**;
  PostgreSQL sirve las consultas, sync manual/semanal. Esos topes no son de precios.
- **TCGCSV es la única fuente activa de precios**: observaciones TCGplayer USD
  persistidas. No volver a introducir TCGdex, fallback ni mezcla de fuentes.
  Sus observaciones anteriores son historia, excluida de precios/totales activos.
- Ningún handler público descarga catálogo o precios. Las lecturas sólo señalan
  grupos locales. La tanda común abre a las 21:00 UTC (18 ARG), recorre todo el
  alcance y continúa después de medianoche hasta terminar o fallar cada grupo,
  manteniendo fecha/publicación. API y `ENABLE_TCGCSV_INGESTION=true` requeridos;
  reanudación cada 15 min, reservas de 24 h, consumidor serial entre procesos.
- Validar identidad/build y `last-updated.txt`; una descarga por archivo cada 24 h,
  429/Retry-After y publicación segura. No reinstalar topes globales de 40 sets o
  500 requests. Una PC suspendida no ejecuta jobs. [Política](backend/docs/pricing.md).
- DINOv2 es el único reconocimiento: cámara/recorte cliente y API autenticada con
  modelo/índice local. Sin OCR, endpoint público alternativo ni fotos persistidas.
- `pg_trgm` y sus índices GIN viven en una migración manual. Prisma puede intentar
  dropearlos con `migrate dev`: revisar y restaurar antes de continuar si ocurre.
- Input validado por DTO `class-validator` y `ValidationPipe` global con whitelist.
  Sin `any`: usar guards. Ownership en el `where` (`id, userId`), devolviendo 404
  para IDs ajenos. Nunca exponer email/passwordHash en respuestas públicas.
- Sin N+1: agregaciones SQL/`DISTINCT ON`, no consultas dentro de loops.
- No usar inventario real como fixture, fabricar precios, días históricos,
  participantes, pruebas, permisos ni evidencia. No abrir secretos o `.env`
  salvo autorización específica necesaria para una tarea.

## Frontend: una sola aplicación

- No hay V1/V2 paralelas ni selector de apariencia. `/buscar-v2` es compatible y
  `visual` antiguo se ignora. No restaurar código/selector retirado.
- Providers Theme/Auth/Currency/Toast en el layout raíz, nunca duplicados por rama.
  `(marketing)` monta landing/FAQ sin BottomNav; `(app)` AppShell con BottomNav;
  `(auth)` y `share` usan PlainShell. La PWA abre `/inicio`, no `/`.
- Usar tokens y primitivas de `components/ui/`; el guard de colores crudos cubre
  `app`, `components`, `lib` y `hooks`. Tailwind 4 se configura por CSS, sin generar
  `tailwind.config.js` ni instalar otro sistema de componentes por una skill genérica.
- Módulos sin JSX/estado pueden compartirse entre las capas frontend, no con backend.
  React StrictMode monta efectos dos veces en desarrollo.
- Respetar `frontend/AGENTS.md`, generado por Next; no editar su bloque administrado.
  Si TypeScript cambia de resultado sin causa, revisar dev/types/tsbuildinfo antes
  de modificar código. Guías: [construcción](frontend/docs/build-guide.md),
  [diseño](frontend/docs/design-system.md), [trampas](frontend/docs/gotchas.md).

## Verificación y servicios

- `pnpm run help`: comandos; `setup`: preparación; `dev`/`dev:lan`: stack;
  `doctor`: diagnóstico; `verify:app`: smoke con stack activo.
- **Antes de tests, `pnpm run stop`**: el worker de desarrollo consume la misma
  cola que los specs. Serializar suites, DB/Redis, builds y runtime compartidos.
- Cambios de producto, incluido frontend: **`pnpm run check` verde** al cerrar el
  lote (lint, tipos, tests y builds). Si afectan datos, flujo real aislado con el
  stack levantado, además de los tests. Ver [testing backend](backend/docs/testing.md).
- Sólo documentación: diff, enlaces y referencias; **no detener la instancia ni
  repetir suites/builds verdes intactos**. No crear capturas/traces/videos salvo pedido.
- Los recibos con PIDs/HTTP 200 son históricos: comprobar ownership actual antes
  de intervenir. Ejecutar comandos con las herramientas del entorno activo;
  **HerdR no es requisito**. Retirarlo de la orquestación no autoriza matar procesos.
- Automatización Codex histórica: conservar **PAUSED**, cadencia de dos horas;
  no reactivar ni duplicar. Cuentas, publicación y servicios externos tienen permisos propios.

## Convenciones y contexto bajo demanda

- Identificadores en inglés; comentarios, mensajes y documentación en español
  rioplatense. Comentarios explican por qué, no lo que el código ya expresa.
- ODD, delegación y revisión pertenecen al harness Gentle Shell; no copiar sus
  prompts ni fijar roles/modelos en este archivo. [Flujo del proyecto](docs/agent-workflow.md).
- Una implementación de producto activa y propietario por archivo; root mantiene
  registros centrales. El modelo disponible se comprueba en el runtime, no en un informe.
- Consultar decisiones en `docs/decisions.md`, contratos en `backend/docs/api.md`,
  datos en `backend/docs/database.md`, jobs en `backend/docs/jobs.md` y escáner en
  `frontend/docs/scanner.md`. Recuperar secciones, no cargar todas las guías.
- Engram complementa documentos versionados con decisiones y descubrimientos
  verificados y su procedencia. Nunca guarda secretos ni convierte autorizaciones,
  sesiones o estado de procesos históricos en permisos o hechos actuales.
- Evidencia/archivo y la vista Obsidian se consultan sólo por necesidad. No seguir
  symlinks en búsquedas recursivas: existen alias autorreferenciales bajo `docs/`.
