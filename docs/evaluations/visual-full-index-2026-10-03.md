> Nota de vigencia (2026-10-03): este documento conserva evidencia histórica. La lectura de texto y el comparador fueron retirados; el flujo actual usa únicamente DINOv2. Consultá [scanner.md](../../frontend/docs/scanner.md).

# DINOv2 contra todos los índices locales — 2026-10-03

Lectura consistente y sólo local: **20.670 IDs únicos, 175 carpetas**. Metadata
y vectores compatibles con DINOv2-small int8, 384 dimensiones. No se descargaron
ni modificaron referencias. Los IDs `ex10-!` y `ex10-?` son válidos del catálogo.

Evaluación del worker real con los cinco recortes diagnósticos previamente
etiquetados; no es una medición del navegador, la cámara o aceptación automática.

| Foto | ID esperado | Visual top-1 | Posición esperada | Worker |
|---|---|---|---|---:|
| IMG_4985 | me55c-106 | me55c-106 | 1 | 2676 ms, frío |
| IMG_4986 | me55-23 | mcd19-11 | 2 | 106 ms |
| IMG_4987 | me55-92 | swshp-SWSH023 | fuera del top-8 | 92 ms |
| IMG_4988 | me55-137 | me55-137 | 1 | 99 ms |
| IMG_4989 | me55-145 | me55-145 | 1 | 95 ms |

Resultado: 3/5 top-1 y 4/5 top-8. El acierto previo de Umbreon contra 191
referencias no se sostiene contra el catálogo completo. No se ajustó el ranking
para favorecer la muestra. Hace falta ampliar evaluación y corroborar con OCR;
una similitud alta no confirma edición, nombre o acabado.

Inicio del modelo 174 ms; carga/validación completa del índice 2386 ms. En
caliente, comprobar los archivos tomó 13–16 ms; inferencia 61–70 ms. El total
incluye ranking de los 20.670 vectores. Evidencia cruda:
`visual-full-index-2026-10-03.json`.

## Recarga

El worker compara inventario y estadísticas de archivos en cada consulta.
Al detectar cambios valida un nuevo snapshot y reemplaza el anterior sólo si
la segunda lectura del inventario coincide. Bloqueos individuales o del lote,
metadata incompatible, vectores inválidos, duplicados contradictorios o líneas
incompletas conservan el snapshot anterior (`indexStale=true`); sin snapshot
previo dan error. No cambia los archivos ni reinicia el modelo ONNX.

Se soporta una carpeta individual o todas las subcarpetas con metadata de la
raíz. Variables por prioridad: `SCANNER_VISUAL_INDEX_DIR`, `SCANNER_INDEX_DIR`,
default `.scanner-index`. Si hay subcarpetas, se ignora el spike legado de la
raíz. Se deduplican IDs con vectores idénticos. La detección usa size, mtime y
ctime; no es un sistema de publicación transaccional entre múltiples procesos.
El indexador debe seguir respetando sus archivos de bloqueo.

## Integración del remoto

El pull directo no pudo avanzar porque ambas ramas tenían commits propios.
Se integró `origin/master` con merge y se restauró el trabajo local desde un
stash que se conserva como respaldo. Se resolvieron conflictos manteniendo el
header de sesión, cookies `credentials: include` y la URL interna para LAN.
No se hizo push.

Verificación: 417 tests frontend, lint de ambos proyectos y 3 pruebas aisladas
del lector del índice. La API activa respondió 404 (flag visual apagado).
El chequeo completo y la activación requieren coordinar la detención temporal
de la app; se solicitó autorización por la restricción anterior.
