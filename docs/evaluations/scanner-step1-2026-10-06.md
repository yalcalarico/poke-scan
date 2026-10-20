# Validación integrada del escáner — 6 de octubre de 2026

Base revisada: `master` / `5a2fe2f`. Alcance autorizado: paso 1 del plan,
validar integración y actualizar estados; sin rediseño ni cambio de modelo.

## Verificación automatizada

`pnpm run stop` seguido de `pnpm run check`, exit 0.
Lint (incluye guards de colores/URLs), tipos, 306 tests backend, 4 de scripts, 6 e2e,
347 frontend y builds Nest/Next aprobados. Log local de esta corrida:
`/tmp/scanner-step1-2026-10-06-check.log` (no es artefacto versionado).

Las regresiones de componentes cubren corrección sin duplicar/reconocer otra
vez, reapertura, agrupación, guardado parcial y viewport/scroll. Esas pruebas
usan dobles para cámara/modelo/HTTP donde corresponde y no miden precisión.

## Flujo real observado

Stack restaurado con `pnpm run dev`; health `ok`, `degraded=false`.
En navegador in-app local, `/escanear` sin sesión pide login antes de elegir
foto; el usuario de desarrollo vuelve a `/escanear` tras entrar.

Se cargó `/tmp/cards-full/IMG_4987.png` por el selector real de la galería:

- Primera predicción: Luxray, SWSH Black Star Promos, SWSH023.
- Segundo candidato: Umbreon ex, 30th Celebration, 92 (`me55-92`, etiqueta).
- Revisión muestra recorte y referencia; seleccionar Umbreon y confirmar
  conserva **una sola lectura**. Organizar muestra Umbreon, 92/128, cantidad 1.
- La sesión temporal se descartó; no se guardó en una colección existente.

Separadamente, contra la API HTTP autenticada, una colección temporal creada
para esta verificación recibió `me55-92` con cantidad 2. Repetir con cantidad 1
conservó el ID del ítem y lo elevó a 3; lectura posterior corroboró un solo ítem
con cantidad 3. La colección temporal fue eliminada en `finally`.
No se crearon cuentas ni enlaces públicos de prueba.

La observación galería/corrección y el guardado API son comprobaciones distintas:
no se certifica el guardado de punta a punta desde el botón del navegador en
esta corrida. La integración de ese botón está cubierta por regresiones.

## Conclusión y pendientes

La integración y la corrección manual funcionan en este caso. La predicción
incorrecta de Luxray confirma que el reconocimiento **sigue experimental**.
No se extrapola este caso ni el corpus de cinco fotos a precisión general.

ORB/RANSAC y recuperación adaptativa fueron retirados. No se mantienen como
capacidades vigentes ni se usa su 5/5 histórico para cerrar DINOv2 solo.
Los dos fallos reales de cámara del 5/10 siguen abiertos.

Faltan corpus 50–100 fotos, etiqueta exacta de Darmanitan, negativos/reimpresiones,
calibración, latencia amplia, SIGINT/estabilidad y pruebas físicas cámara/PWA.
No se realizó una nueva prueba de cámara física, offline, render público ni
verificación numérica global del orden por precio.

Sólo se editaron documentación y estados del roadmap; se preservaron los
artefactos locales no versionados existentes. API/web quedaron levantadas.
