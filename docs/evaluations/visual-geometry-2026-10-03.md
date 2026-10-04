> Nota de vigencia (2026-10-03): este documento conserva evidencia histórica. La lectura de texto y el comparador fueron retirados; el flujo actual usa únicamente DINOv2. Consultá [scanner.md](../../frontend/docs/scanner.md).

# Mejora visual: DINOv2 + correspondencias del dibujo

Se conserva el modelo, preprocesado y los **20.670 embeddings**. DINOv2 recupera
64 candidatos; una etapa ORB + homografía RANSAC compara detalles del dibujo con
sus imágenes locales. No usa OCR, nombres, números o IDs esperados para ordenar.
El coseno original no se reemplaza por un porcentaje de certeza.

## Diseño

OpenCV.js corre exclusivamente dentro del worker aislado del backend. Fotos y
referencias se reducen a 384 × 536, sin alpha y en gris. Se detectan hasta 600
puntos dentro del área central (se excluyen bandas de título y pie). Matching
Hamming con ratio 0,75, distancia menor a 64 y destinos únicos. RANSAC exige al
menos 8 inliers, proporción 0,45 y cobertura espacial 8 % de la imagen. Estos
umbrales son experimentales; no están calibrados como aceptación automática.

Se priorizan candidatos con geometría consistente, luego cantidad de inliers y
coseno original. Si no hay evidencia suficiente conserva el orden DINOv2. Un
error del verificador también conserva ese ranking y avisa al frontend. Imágenes
ausentes no se descargan: dan evidencia geométrica nula. Las rutas se derivan
del hash de `id + imageUrl` dentro del caché local de cada colección, sin abrir rutas
arbitrarias del JSONL. Caché en memoria acotado a 128 descriptores, invalidado al
cambiar versión del índice; Mats temporales se liberan en `finally`.

El cliente muestra posición DINOv2 original, coseno, puntos compatibles, cobertura
y tiempo separado de verificación. Cuando el orden es geométrico se omite el
viejo margen coseno top-1/top-2, que podía volverse negativo. Una misma ilustración
reimpresa puede coincidir geométricamente: no confirma edición ni acabado.

## Evaluación sobre cinco fotos existentes

Índice completo, mismos recortes diagnósticos, sin reindexar. Antes: 3/5 top-1.
Después: **5/5 top-1** en esta muestra, no una garantía de catálogo completo.

| Foto | Esperada | Posición DINOv2 | Posición final | Inliers / matches |
|---|---|---:|---:|---:|
| IMG_4985 | me55c-106 | 1 | 1 | 53 / 69 |
| IMG_4986 | me55-23 | 2 | 1 | 19 / 23 |
| IMG_4987 | me55-92 | 29 | 1 | 40 / 44 |
| IMG_4988 | me55-137 | 1 | 1 | 68 / 74 |
| IMG_4989 | me55-145 | 1 | 1 | 36 / 38 |

Umbreon: coseno 0,629 se mantiene; Luxray 0,700 no aportó geometría suficiente.
Verificación de 64 candidatos con referencias todavía sin descriptores: 2,8–4,1 s.
Segunda lectura de Umbreon: **466 ms** de verificación. La preparación, índice,
inferencia, ranking y HTTP se suman a ese tiempo; no es latencia total.

Comparaciones descartadas: corregir proporciones ayudó a Vaporeon pero empeoró
Umbreon; normalizar exposición lo subió de 29.º a 6.º sin volverlo primero;
correlación de parches simple perjudicó Celebi y Chandelure. No se incorporaron.
Reducir la resolución ORB a 256 × 356 perdió la corroboración de Vaporeon.

## Límites y pruebas

Si la carta correcta no entra en los 64 candidatos, esta etapa no puede
recuperarla. Se necesitan más fotos reales, negativos, fundas y reimpresiones.
Se conserva confirmación manual; no se altera el resultado OCR ni se guarda nada.

Pruebas sintéticas verifican rotación y PNG con alpha, un dibujo ajeno con coseno
mayor, recarga de caché, foto uniforme y referencia ausente. El frontend verifica
que se muestren métricas separadas y que el orden geométrico no se presente como
margen coseno. No se descargan referencias desde la API.

`pnpm run stop` seguido de `pnpm run check`: aprobado tras la corrección del
formato de la clave del caché (ID + URL). Backend 338 tests; API 6; frontend 419
(2 omitidos, 1 pendiente); lector/verificador 6. Lint, tipos y ambos builds verdes.
La prueba del lector comprueba que usa la clave del indexador e ignora la ruta
arbitraria de `imagePath` del JSONL. Evidencia local:
`visual-geometry-local-2026-10-03.json`.

Biblioteca: [OpenCV.js para Node](https://github.com/TechStark/opencv-js),
`@techstark/opencv-js@5.0.0-release.1` fijado en dependencias runtime.

## Verificación con la app levantada

La API real acertó las cinco fotos. Umbreon quedó primero con 40/44 puntos
compatibles; última repetición: 586 ms HTTP, 460 ms de verificación. Tras recorrer
las cinco fotos, la primera repetición volvió a calcular referencias desplazadas
por el límite de caché (128); la siguiente aprovechó el caché. No se garantiza
esa latencia al cambiar entre muchas cartas.

En el navegador, la foto original recortada por el frontend también priorizó
Umbreon ex (`me55-92`): pasó del puesto DINOv2 5 al primero, con 73/78 puntos
compatibles y cobertura 27,3 %. Tiempo visual HTTP: 2214 ms; verificación del
dibujo: 1920 ms. OCR coincidió por separado. Captura:
`visual-geometry-umbreon-browser-2026-10-03.png`. Resultados API:
`visual-geometry-api-2026-10-03.json`.

Chequeo adicional `pnpm run verify:app`: 11/12 comprobaciones correctas. La única
falla fue el precio vigente de Charizard marcado viejo; no corresponde al flujo
visual. Salud, catálogo, búsqueda, colecciones y pantallas respondieron bien.
