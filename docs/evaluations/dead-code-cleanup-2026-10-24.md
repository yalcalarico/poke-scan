# Limpieza de código sin uso y retiro de Clásica — 24/10/2026

Este recibo corresponde al lote inicial de frontend. El retiro posterior del
circuito backend y sus scripts está en el [recibo de backend](backend-dead-code-cleanup-2026-10-24.md).

## Decisión y alcance

El usuario retiró la apariencia anterior. La app usa una sola apariencia y los
enlaces internos vuelven a sus rutas normales. `visual=classic` y `visual=v2`
ya no seleccionan estilos; `/buscar-v2` conserva los enlaces existentes y
reutiliza la página de `/buscar`, con su metadata de compatibilidad.

El árbol original de v1 ya había sido retirado en septiembre. Este lote elimina
la selección Clásica agregada después y los módulos huérfanos encontrados.

Se revisaron el estado vigente, las guías de frontend y las referencias de ambos
proyectos. El árbol de trabajo estaba limpio en `master` antes de comenzar.

## Código retirado

- Selector Clásica/Actual, sus estilos y los helpers `visualVersionHref`,
  `isVisualVersionEnabled`, `previewHref` y `PreviewLink`. La navegación usa
  `next/link` y los destinos normales; filtros y enlaces de regreso siguen
  perteneciendo a cada pantalla.
- Dependencia de la URL y frontera `Suspense` del proveedor de apariencia.
  `AppVisualsProvider` delimita los efectos de la app; no elige una versión.
- Ramas Clásica del escáner y del detalle de un ítem de colección.
- `SetFilterSheet`, `SwipeScanRow` y `VisualDiagnostics`, sin consumidores en
  la app. Se retiraron el test exclusivo de la fila y un mock obsoleto.
- Presentación duplicada de `/buscar-v2`, reemplazada por la página compartida.

Las guías de rutas, componentes, escáner y diseño, junto con `AGENTS.md` y el
estado vigente, reflejan la decisión. Los documentos fechados anteriores
conservan sus resultados históricos.

El README también deja de anunciar el ciclo TCGdex como activo. Las guías de
backend ya distinguen la política TCGCSV vigente de las secciones históricas.

## Criterio de revisión

Se recorrieron imports, reexports e imports dinámicos con el parser de
TypeScript, desde las rutas de Next, el arranque de Nest y los scripts. Los
candidatos se contrastaron con búsquedas de símbolos y referencias en tests,
documentación y ejecución por subprocesos. La ausencia de un import estático
por sí sola no justifica borrar un archivo.

Se conservaron:

- `CardTilt` y las ramas fuera de `AppShell`: los tiles compartidos se renderizan
  en páginas públicas. Ese contexto no representa una versión anterior de la
  app. Los efectos, la memoria de grilla y las superficies de los diálogos
  también tienen consumidores actuales.
- `suppression-custody-worker.ts`: se lanza mediante `spawn` y `new URL`, aunque
  no aparece como dependencia en un import convencional.
- Las piezas legadas de precios que aún tienen consumidores: el mapper TCGdex
  está referenciado por `SyncPricesService`, el token de `JobsModule` y el
  script `db:map-tcgdex`; el ciclo diario está referenciado por el scheduler y
  sus tests. `PriceQueueWorker` está fuera del arranque y sigue usado por los
  arneses de cola y aceptación. Retirarlas requiere refactorizar esos
  consumidores y su contrato; no son archivos huérfanos eliminables en bloque.
- Migraciones, observaciones históricas, fixtures y primitivas públicas del
  design system. No se modificaron el schema, las migraciones ni los datos
  históricos; tampoco se reactivó TCGdex.

El análisis identifica módulos sin consumidores y ramas del selector retirado;
no certifica que cada export o asset del repositorio tenga uso en ejecución.

## Validación

`pnpm run stop` antes de tests y `pnpm run check` final con salida 0:

| Control | Resultado |
|---|---|
| Lint y guards de colores/URLs | Pasan; continúan advertencias previas de las herramientas. |
| Typecheck | Pasa. |
| Backend Vitest | 619 pruebas, 63 archivos. |
| Backend E2E | 6 pruebas, 2 archivos. |
| Frontend Vitest | 619 pruebas, 78 archivos. |
| Scripts backend y operativos/QA | 104 pruebas. |
| Total | 1.348 pruebas, cero fallos y cero skips. |
| Builds Nest y Next/Turbopack | Pasan; `/buscar` y `/buscar-v2` compilan. |
| Referencias locales de docs modificadas y `git diff --check` | Sin enlaces rotos ni errores de whitespace. |

El segundo recorrido de imports no encontró módulos frontend sin entrada desde
la app o sus scripts, ni referencias a los símbolos retirados.

Revisión manual en Safari con API y web reales, levantadas con `pnpm run dev`
en el panel Herdr inferior izquierdo `w2:p7`:

- `/buscar?visual=classic`: catálogo de 20.670 cartas en la apariencia actual,
  sin selector, navegación desktop y navegación móvil con cinco destinos.
- Viewports de 390 × 844 y 1280 × 800, además de la ventana desktop habitual;
  temas oscuro y claro. Sin solapamiento del selector retirado con el contenido.
- `/buscar-v2?q=pikachu`: 235 resultados, apertura de `/carta/base1-58` y regreso
  al catálogo conservando consulta y resultados.
- Ficha con imagen, precio TCGCSV e historial visibles en desktop claro.
- Se restauró el tema oscuro original y se salió del modo responsivo de Safari.
  Web `http://localhost:3000` y salud de API `http://localhost:3001/api/health`
  respondieron 200; el stack queda visible y activo en Herdr.

La revisión no acredita dispositivo físico, PWA instalada ni una captura nueva
de cámara. Los flujos de cámara/galería, cancelación y revisión de coincidencias
pasaron en sus pruebas; las reglas existentes de movimiento reducido y safe
area se conservaron. No se ejecutó una auditoría completa de teclado o lectores
de pantalla.

Durante el gate se corrigió una carrera del fixture de
`price-queue.service.spec.ts`: el worker puede recrear la fila del proveedor
entre tests, por lo que la preparación de la pausa usa `upsert`. Se conservan
las aserciones de pausa, intentos y reanudación; los 20 casos focales pasaron.
Los arneses de cámara y galería incorporan el formateador de moneda que requiere
el resultado visual, ahora siempre presente. Las pruebas focales de esos flujos
y de enlaces antiguos pasaron (11 casos).
