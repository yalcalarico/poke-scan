# A3 — Fallos de descargas y cierre forzado del indexador

Completado el 6 de octubre de 2026. Se corrigieron dos fallos reproducidos
y se reforzó la lectura del índice ante una escritura incompleta.

## Cambios

1. Un HTTP 200 inválido antes se guardaba en caché antes de decodificar. Cada
   reintento reutilizaba esos bytes y fallaba nuevamente. Ahora la descarga
   se valida completamente antes del rename; una caché dañada se vuelve
   a descargar, conservando las referencias válidas.
2. En el CLI, la señal de timeout se emitía pero la lectura del cuerpo quedaba
   pendiente en el caso controlado de conexión abierta. El helper cancela
   explícitamente el lector y verifica la señal entre lecturas: el intento
   ahora termina a los 30 s, registra fallo y libera el lock.
3. El CLI rechaza un JSONL cuyo contenido no termina en salto de línea, igual
   que el runtime. No concatena otra entrada sobre una línea parcial ni
   intenta recuperar datos de forma silenciosa.

El helper limita la descarga durante lectura a 10 MiB y la decodificación a
16 megapíxeles. Publicación por temporal/rename, limpieza del temporal al
fallar o reanudar y conservación de bytes de las imágenes válidas.
No cambia catálogo, vectores existentes, modelo ni reconocimiento por API.

## Verificación reproducible

Desde backend con PostgreSQL, modelo y dependencias locales disponibles:

```sh
node --env-file-if-exists=.env scripts/scanner-index-failures-smoke.mjs /tmp/scanner-index-failures-report.json
# Sólo timeout de red, con traza del lector:
node --env-file-if-exists=.env scripts/scanner-index-failures-smoke.mjs /tmp/scanner-index-timeout-report.json hold
```

El harness usa CLIs, Prisma y ONNX reales, pero intercepta las URLs del catálogo
sólo dentro de los procesos de prueba y las sirve desde HTTP loopback. No cambia
la allowlist de producción, no modifica URLs de PostgreSQL y bloquea otros
destinos fetch. Todas las imágenes/vectores son sintéticos en carpetas temporales:
**no deben copiarse al índice de reconocimiento**. No hubo descargas al CDN real.

## Resultados

[Reporte JSON](scanner-index-failures-2026-10-06.json): estado passed, 11 casos.

| Caso | Resultado observado |
|---|---|
| HTTP 503 / 429 | Exit 1, intento pendiente; reanudación correcta al restaurar servidor |
| HTTP 200 sin imagen | No publica caché ni vector; reanudación correcta |
| Conexión cortada a mitad | No publica caché ni vector; reanudación correcta |
| Tamaño declarado excesivo | Corta stream sin publicar; reanudación correcta |
| Conexión abierta sin terminar | Falla en 30,25 s incluyendo arranque; reintento correcto |
| SIGKILL durante descarga | Caché/vector no publicados; lock impide reanudar hasta recuperación manual |
| SIGKILL entre temporal y rename | Temporal queda aislado; después de liberar lock muerto se descarta y descarga de nuevo |
| SIGKILL después de un vector completo | Conserva la primera entrada exacta, descarga sólo la segunda; total 2 |
| SIGKILL a mitad de append JSONL | CLI/runtime rechazan línea incompleta; conserva original y copia de respaldo |
| SIGKILL del padre de lote | Hijo permanece activo; se verifica y termina antes de liberar ambos locks; reanudación completa de 12 IDs |

Las reanudaciones de fallos de red terminan con un vector válido de 384
dimensiones, normalizado y sin IDs repetidos. Otra ejecución sobre el mismo
resultado omite trabajo: cero descargas repetidas. Metadatos y contenido de
caché final se verifican contra el fixture. El índice activo no se escribió.

Se agregaron seis regresiones del helper: HTTP fallido, imagen inválida/truncada,
caché corrupta/reutilización, exceso de tamaño, stream roto y abort con lector
pendiente aunque el transporte ignore la señal.

`pnpm run stop` → `pnpm run check`: verde, **700 pruebas** (315 backend,
13 scripts, 6 e2e y 366 frontend), lint, tipos y ambos builds. Oxlint de los
scripts modificados, comprobación de sintaxis y diff-check sin errores;
regresiones del helper repetidas tras formatear los archivos nuevos.
Stack de desarrollo restaurado al terminar.

## Recuperación y límites

SIGKILL no ejecuta finally: los locks no desaparecen automáticamente. La prueba
sólo los elimina en su propio temporal, después de comprobar que el PID
corresponde al proceso creado y ya terminó. En lotes deben revisarse padre
e hijo; un padre muerto no implica ausencia de escritores activos.

Un JSONL parcial exige conservar respaldo y reconstruir antes de continuar.
No se promete reanudación automática tras cualquier crash ni ausencia universal
de pérdida: se verificaron puntos específicos con faults controlados.
El CLI no interpreta Retry-After ni hace backoff automático; el operador debe
respetar la espera del CDN ante 429. No se evaluó rendimiento prolongado,
precisión, disco lleno ni pérdida de energía. A4 y la evaluación amplia siguen abiertos.
