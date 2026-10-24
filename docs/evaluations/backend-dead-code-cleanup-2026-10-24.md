# Retiro del circuito backend obsoleto — 24/10/2026

## Alcance

Continuación de la [limpieza inicial](dead-code-cleanup-2026-10-24.md), tras la
aclaración del usuario de revisar también backend y scripts. Encontrar imports
no acreditaba uso vigente: el circuito TCGdex se referenciaba a sí mismo y era
instanciado por pruebas del flujo retirado. Se siguieron sus consumidores hasta
las entradas reales de Nest, los comandos, CI y los arneses operativos.

## Retirado

- Proveedor TCGdex y mapper de sets, incluidos el token vacío de inyección.
- Cola y worker por carta, gate de ritmo de ese circuito, backfill y ciclo diario
  TCGdex; sus registros en `JobsModule` y dependencias del scheduler/recovery.
- Fetch remoto, fallback, caché Redis y TTL negativa por carta en
  `SyncPricesService`. Permanecen la lectura local, la solicitud a la cola de
  grupos y el contrato admin de encolado, sin atribuir precios nuevos.
- INSERTs a `price_refresh_jobs` desde colecciones y el parámetro de reintento
  que la rama TCGCSV nunca usó. Permanecen ownership, variante y selección por
  frescura, con la misma cola de grupos TCGCSV.
- Escrituras/lecturas activas de `portfolio_snapshots`: el portafolio conserva
  sus observaciones atribuidas a TCGCSV mediante `CollectionComparisonService`.
- Parser de precios congelados de pokemontcg.io y consulta remota individual
  de catálogo sin consumidores vigentes; se conservan las páginas del sync.
- Métodos de registro de sets duplicados por la CLI y sin consumidores de la
  aplicación; permanece el alta por colección y las reconciliaciones vigentes.
- Wrapper `TcgcsvService.daily` sin consumidores. Los crons diarios, resumidor,
  publicación y corte de comparación conservan sus entradas actuales.
- Scripts `map-tcgdex-sets.ts`, `catalog-price-order-smoke.mjs`, `api-smoke.ts`
  y `scanner-visual-smoke.mjs`; este último escribía un recibo fijo de octubre
  con un manifiesto de evaluación antiguo. Se eliminó `db:map-tcgdex`.
- Consultas TCGdex descartadas después por `prices:status`, estimación de tiempo
  por carta y helper exportado sin consumidores. La señal de `prices:sets` se
  limita a TCGCSV habilitado.

Se retiraron ocho suites exclusivas del circuito desaparecido y se reemplazaron
las pruebas que mezclaban consumidores actuales con ese circuito. La reducción
del contador refleja ese retiro; no se agregaron skips ni se borraron pruebas
del worker TCGCSV para obtener un gate verde.

## Conservado y protegido

No hay migraciones nuevas ni DROP de tablas, columnas, índices o datos. Se
conservan observaciones históricas, mappings y modelos anteriores para lectura
histórica, restore y auditoría. El contrato HTTP de la app mantiene sus formas.
Los identificadores históricos de `PROVIDER_IDS` también permanecen: el DTO de
historial los consume mediante `Object.values`. Eliminarlos hubiera restringido
la validación pública aunque ningún adaptador los usara. El ensayo HTTP detectó
esa regresión; se corrigió y se agregó cobertura para las cinco fuentes
aceptadas y el rechazo de una fuente desconocida.

La ingesta TCGCSV conserva validación de identidad/build, publicación atómica,
leases, cooldown por archivo, backoff, prioridad y pausas 429. El nuevo código
de colecciones delega al mismo `enqueueCards`, sin otro worker o descarga desde
handlers. Los totales y sus huecos siguen dependiendo de variante y fuente.

Los scripts no se clasificaron sólo por aparecer en `package.json`:

- Retención y seeds compilan de `.ts` a `.js`; las referencias al archivo
  compilado son consumidores reales.
- `seed-ci-catalog.mjs` y `security-smoke.mjs` están invocados en CI. El smoke
  de seguridad usa el flag vigente para apagar la ingesta en su base aislada.
- Los arneses de carga, fallos y reanudación del escáner son herramientas
  manuales parametrizables; se documentaron en la [guía de tests](../../backend/docs/testing.md).
- La prueba INF-03 usa imágenes históricas por digest: conserva sus flags
  antiguos porque esos binarios todavía los leen, y agrega el flag TCGCSV.
  Quitar esa compatibilidad habría podido activar un worker en la imagen vieja.
- `suppression-custody-worker.ts` se inicia por `spawn` y `new URL`; no es un
  módulo huérfano aunque falte un import estático.

Las guías de jobs, precios, proveedores, tests, API, base y arquitectura se
actualizaron. Los informes históricos previos siguen describiendo su contexto.

## Verificación

`pnpm run stop` antes de tests y `pnpm run check` final con salida 0:

| Control | Resultado |
|---|---|
| Lint y guards frontend | Pasan; permanecen advertencias previas de herramientas. |
| Typecheck | Pasa. |
| Backend Vitest | 537 pruebas, 56 archivos. |
| Backend E2E | 6 pruebas, 2 archivos. |
| Frontend Vitest | 619 pruebas, 78 archivos. |
| Scripts backend y operativos/QA | 105 pruebas. |
| Total | 1.267 pruebas, cero fallos y cero skips. |
| Builds Nest y Next/Turbopack | Pasan. |
| Compilación de scripts TypeScript sin emitir | Pasa (`tsconfig.seed.json`). |
| Enlaces locales de docs modificadas y `git diff --check` | Sin errores. |

El grafo estático de backend sólo deja fuera el worker de custodia que se
lanza por subproceso. No quedan imports de los módulos retirados ni INSERTs a
la cola por carta desde los servicios actuales.

Las pruebas focales ya verificaron lectura local, cero conocido, exclusión de
otras fuentes/monedas, variantes, ownership, total/portafolio, encolado por grupo,
pausas, reservas, leases, dos instancias y señales coalescidas. La compilación de
los scripts TypeScript (`tsconfig.seed.json`, sin emitir) también pasó.
Las seis regresiones focales del DTO histórico también pasaron con su bootstrap
de `reflect-metadata`, el mismo soporte usado por la aplicación Nest.

El flujo HTTP real pasó en web 3100/API 3101, con `pokemon_cards_test`, ingesta y
crons de mantenimiento apagados. Usó una referencia TCGCSV ya persistida, sin
descargar ni inventar cotizaciones. Se verificó:

- Salud, carta/precio de fuente única, consulta histórica explícita TCGdex y
  búsqueda ordenada por precio.
- Registro temporal, alta de colección con dos copias, stats, portafolio,
  filtro de intercambio y solicitud de actualización de colección.
- Un total consistente de USD 144,84 en colección, stats, portafolio y enlace
  público; render de la página compartida.
- Admin: respuesta de encolado sin acreditar refrescos, input inválido 400 y
  clave incorrecta 403.
- Igualdad exacta de las observaciones de la carta antes y después; sin nuevos
  `portfolio_snapshots` del circuito anterior.
- HTTP 200 de inicio, catálogo, `/buscar-v2` y ficha.

Se eliminaron el usuario/colección/enlace temporales. La instancia aislada fue
detenida antes de volver a los tests. Este ensayo no ejecutó descargas del
proveedor; esas rutas conservan sus regresiones de publicación, pausas, leases
y cuotas en la suite TCGCSV.

Al cerrar se restauró `pnpm run dev` en `w2:p7`, con la configuración normal.
`http://localhost:3001/api/health` y `http://localhost:3000/buscar` respondieron
200. Los puertos aislados 3100/3101 quedaron detenidos. Los cambios permanecen
locales, sin commit ni push.
