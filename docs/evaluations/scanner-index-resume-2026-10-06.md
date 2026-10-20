# SIGINT y reanudación del indexador — 6 de octubre de 2026

## Resultado

La implementación existente pasó la prueba con señales reales; no se modificó
el indexador directo ni el coordinador por expansión. Se agregó una herramienta
reproducible de comprobación y se actualizaron los estados del plan.

[Reporte](scanner-index-resume-2026-10-06.json).

| Caso | Tras SIGINT | Reanudación | Resultado |
|---|---|---|---|
| CLI directo, tres IDs | Exit 130, una referencia guardada | Dos nuevas | Tres IDs únicos |
| CLI por expansión, mcd19 | Exit 130, una de doce guardada | Once nuevas | Doce IDs únicos |
| Competidor del lote | Exit 1, EEXIST | No modifica bloqueo activo | Escritor inicial conserva ambos locks |
| Competidor directo | Exit 1, EEXIST | No modifica bloqueo activo | Lock de indexación conservado |
| Repetir lote completo | Exit 0 | Omite set completo | Sin reindexar |

Ambos caminos liberaron `index.lock`; el coordinador también liberó
`sets-index.lock`. El resumen registra interrupción. Los vectores guardados antes
del corte conservaron exactamente su contenido después de reanudar. JSONL con
líneas completas, vectores finitos de 384 dimensiones normalizados y cero
IDs duplicados. Todas las ejecuciones reportaron **cero descargas**.

## Reproducir

Desde backend, con PostgreSQL/modelo local disponibles:

```sh
node --env-file-if-exists=.env scripts/scanner-index-resume-smoke.mjs /tmp/scanner-index-resume-report.json
```

Lee la expansión pequeña `mcd19` del catálogo. Crea una carpeta única temporal,
metadata compatible e imágenes sintéticas cacheadas; luego invoca los CLIs
reales, envía SIGINT tras el primer vector y repite sus comandos para reanudar.
En el lote prueba también escritores concurrentes y la omisión del set completo.
Modelo/embeddings reales, sin descargas ni escritura en catálogo/precios o en el
índice completo. El reporte no se sobrescribe. Se conservan las fixtures
locales para inspección; **no copiarlas al índice real**.

Las imágenes de color plano son fixtures del ciclo de vida: no son referencias
reales y no se usan para medir precisión. La prueba no certifica interrupción
durante una descarga, daño por SIGKILL/crash nativo, corte eléctrico ni fsync.
SIGINT es un cierre cooperativo que espera el intento y pausa actuales. La
recuperación de locks huérfanos tras un cierre forzado sigue siendo manual.

El primer armado de fixture por set tenía imágenes sin metadata y fue rechazado
por el guard de carpeta incompatible, antes de indexar. Se corrigió la fixture
para usar metadata del modelo vigente; no se relajó el guard de producción.

## Pendientes

Estabilidad prolongada del runtime/backend, fallos de red durante indexación y
validación física de dispositivos siguen abiertos. Corpus amplio/calibración
pendientes de nuevas fotos. Este hito cierra sólo SIGINT y reanudación cooperativa
con caché en los dos CLIs.

## Verificación de entrega

`pnpm run check` exit 0: lint, tipos, 315 backend, 7 scripts, 6 e2e y
347 frontend (**675 pruebas**) y ambos builds. Log local:
`/tmp/scanner-index-resume-2026-10-06-check.log`.
API/web se restauran en un único stack después de los tests. Sólo se agregaron
la herramienta de prueba, evidencia y documentación para este bloque;
cambios locales sin commit/push.
