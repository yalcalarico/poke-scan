> Nota de vigencia (2026-10-03): este documento conserva evidencia histórica. La lectura de texto y el comparador fueron retirados; el flujo actual usa únicamente DINOv2. Consultá [scanner.md](../../frontend/docs/scanner.md).

# Prueba DINOv2 en pantalla — 2 de octubre de 2026

Experimento optativo en `/escanear`, sin aceptación ni guardado automáticos.
Requiere sesión. El OCR conserva su recorrido. La foto se transmite a nuestra
API para procesarla en memoria; no se persiste. No hay descarga, indexación ni
consulta de proveedores externos en el handler.

## Habilitación

Ambos flags están apagados por defecto. Desde la raíz:

```sh
SCANNER_VISUAL_ENABLED=1 NEXT_PUBLIC_SCANNER_VISUAL=1 pnpm run dev
```

Para dejarlo habilitado en desarrollo, agregar `SCANNER_VISUAL_ENABLED=1` a
`backend/.env` y `NEXT_PUBLIC_SCANNER_VISUAL=1` a `frontend/.env.local` y reiniciar.
El flag público se incorpora al build. No activar en producción sin evaluar
capacidad, corpus y calibración. Endpoint autenticado:
`POST /api/cards/identify-visual`, JSON `{ "image": "data:image/jpeg;base64,..." }`.

Modelo: `backend/.scanner-models/dinov2-small-int8.onnx` (`SCANNER_MODEL`). Índice:
`backend/.scanner-index/30th-anniversary` (`SCANNER_VISUAL_INDEX_DIR`). Las rutas
se resuelven desde backend, igual que el CLI. Se comprueban revisión, precisión,
dimensiones, hash del modelo/preprocesado, 191 IDs únicos me55/me55c y vectores
normalizados. La API rechaza índices parciales/legados y no los modifica.

JPEG, PNG o WebP, máximo 6 MiB y 24 MP; se rechazan imágenes animadas y proporciones
extremas. Sharp es dependencia de runtime. Se comparte el preprocesado con el
CLI mediante `scanner-visual-engine.mjs`; no se recalcularon vectores.

ONNX corre en un proceso hijo persistente, con dos hilos CPU. Una inferencia por
proceso API: otra simultánea devuelve 503, sin cola ilimitada. Timeout de 30 s;
la desconexión del cliente cancela y mata el hijo. Se reinicia en la siguiente
prueba. Un fallo nativo queda aislado de Nest. Apagar la API mata el hijo.
La cancelación del navegador aborta HTTP y descarta respuestas viejas.

## Primera medición: fotos originales contra 191 referencias

Worker real con el mismo modelo, índice y preprocesado de la pantalla:

| Foto | ID esperado | Top-1 | Posición esperada | Tiempo worker |
|---|---|---|---:|---:|
| IMG_4985 | me55c-106 | me55c-106 | 1 | 393 ms (frío) |
| IMG_4986 | me55-23 | me55-23 | 1 | 230 ms |
| IMG_4987 | me55-92 | me55-30 | 7 | 222 ms |
| IMG_4988 | me55-137 | me55-137 | 1 | 245 ms |
| IMG_4989 | me55-145 | me55-145 | 1 | 229 ms |

Inicio del modelo: 150 ms; inferencia/preprocesado: 217–238 ms. Estos tiempos no
incluyen arranque del proceso, IPC, HTTP ni consulta de catálogo. La pantalla
muestra el tiempo total del handler además del modelo y la inferencia.
Los originales PNG superan 6 MiB: para el flujo HTTP se convierten a JPEG,
sin reducir dimensiones. Esa entrada se mide por separado abajo.

Resultado: 4/5 top-1 y 5/5 dentro de los ocho candidatos. No demuestra precisión
general. Umbreon tenía similitud 0,591 y la referencia incorrecta 0,638.
Chandelure sí quedó primero (0,870), mientras OCR en galería había favorecido
Lampent. No combinar scores ni elevar confianza con estos cinco casos.

## Próximo paso

Priorizar evaluación/corrección del encuadre de captura y del ranking OCR de
Chandelure, y reunir 50–100 fotos con negativos y reimpresiones para calibrar.
El fallo Umbreon contra 191 distractores exige probar recortes y perspectiva
antes de ampliar al catálogo completo. Comparar variantes con el mismo corpus;
no activar aceptación automática ni rechazo por similitud. Acabados y edición
siguen sin confirmar. Etapas 5 y 6 de producción permanecen abiertas.

## HTTP real: JPEG orientado, sin reducción de dimensiones

`cd backend && node scripts/scanner-visual-smoke.mjs` usa el usuario de desarrollo
existente (o `SCANNER_SMOKE_EMAIL/PASSWORD`), convierte con Sharp `rotate()` +
JPEG 92 y registra `visual-screen-2026-10-02.json`. No guarda cartas ni fotos.

| ID esperado | Top-1 | Posición esperada |
|---|---|---:|
| me55c-106 | me55c-106m | 2 |
| me55-23 | me55c-69 | 4 |
| me55-92 | me55c-19 | 7 |
| me55-137 | me55-137 | 1 |
| me55-145 | me55-145 | 1 |

2/5 top-1 y 5/5 top-8. Handler frío 469 ms (HTTP 520 ms), caliente 88–93 ms
(HTTP 124–140 ms). Modelo/sesión se recargó después de los errores de entrada.
Los cinco PNG originales tienen orientación EXIF 6 y dimensiones 4032×3024.
La conversión aplica esa orientación y elimina metadata. El preprocesado heredado
del CLI calcula el tamaño a partir de metadata antes de que Sharp materialice
`rotate()`: la relación de aspecto efectiva cambia respecto del JPEG ya orientado.
No se modificó ese algoritmo ni sus hashes. Es un pendiente real para evaluar y
versionar el preprocesado de query/referencia de manera coherente; los resultados
PNG y JPEG no se pueden tratar como la misma entrada.

Validación real: SVG, bytes que no son imagen e imagen vacía devolvieron 400;
sin sesión, 401. En navegador, carga por el botón experimental y resultado
Chandelure top-1 (similitud 0,630), con inicio frío 408 ms. Captura:
`visual-screen-dark.jpg`. Las coincidencias quedan como links de consulta.

Check completo verde: lint, tipos, 329 backend, 4 API, 401 frontend y ambos builds
(2 skip y 1 todo frontend). Hubo una primera corrida sin acceso sandbox a DB,
un timeout aislado en backfill y una corrida bloqueada por puerto 3001 ocupado;
la corrida final con stack detenido completó todas las etapas.

Verificación adicional: dos requests simultáneos devolvieron 200 y 503;
la cancelación HTTP produjo AbortError y la siguiente prueba devolvió 200 con
`cold: true`, comprobando reinicio del hijo. Worker real con índice ausente y
metadata incompatible devolvió los errores españoles esperados. En navegador,
el botón OCR «Subir una foto» procesó el JPEG de Chandelure y mostró `me55-137`
primero, leyendo 137/128. Esa entrada no reproduce la aproximación a galería
que favorecía Lampent: el pendiente de ranking no se declara resuelto.
La sesión temporal del OCR se descartó; no se guardaron ítems en colecciones.

Tema claro y oscuro verificados en navegador (`visual-screen-light.jpg` y
`visual-screen-dark.jpg`); se restaura la preferencia Sistema tras la prueba.
El componente no agrega animaciones. Cámara física, dispositivos móviles y
medición con `prefers-reduced-motion` forzado siguen sin evaluación específica.

Al cierre se dejó un único stack local con los dos flags habilitados. Se
limpiaron watchers viejos del proyecto que volvían a iniciar la API después de
`pnpm run stop`. `pnpm run verify:app` pasó sus 12 comprobaciones de humo.
