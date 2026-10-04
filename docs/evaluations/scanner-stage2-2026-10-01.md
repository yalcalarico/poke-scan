> Nota de vigencia (2026-10-03): este documento conserva evidencia histórica. La lectura de texto y el comparador fueron retirados; el flujo actual usa únicamente DINOv2. Consultá [scanner.md](../../frontend/docs/scanner.md).

# Etapa 2 — recorte y selección del nombre

## Cambios activos

- El recorte recupera el alto esperado de una carta vertical cuyo borde inferior
  quedó corto, manteniendo el borde superior de la banda del nombre. Se usa el
  ancho detectado antes del margen horizontal y la proporción 63/88; se limita
  la recuperación al 20% del alto y al tamaño de la foto. No alarga una carta
  completa, una carta apaisada ni un rectángulo demasiado deformado.
- Entre las pasadas de la banda se prioriza un nombre repetido (ignorando
  capitalización), y se usa la confianza del parser para desempatar. Las líneas
  originales siguen disponibles para el matching. El consenso es una regla,
  no una garantía de reconocimiento.

## Comparación con OCR real

Mismas cinco fotos de `/tmp/cards-full`, misma API local y nueve pasadas del
escáner por defecto. Ver los JSON `scanner-stage2-before-2026-10-01.json` y
`scanner-stage2-after-2026-10-01.json` en esta carpeta.

| Foto | Nombre del primer candidato antes/después | Tiempo antes | Tiempo después |
|---|---|---:|---:|
| IMG_4985 | Shining Celebi / Shining Celebi | 8,52 s | 8,35 s |
| IMG_4986 | Pikachu / Pikachu | 2,49 s | 2,50 s |
| IMG_4987 | Umbreon ex / Umbreon ex | 3,43 s | 3,41 s |
| IMG_4988 | Chandelure / Chandelure | 3,58 s | 2,77 s |
| IMG_4989 | Piers / Zorua (ambos incorrectos para Hisuian Zorua) | 2,56 s | 2,41 s |

Son mediciones de una ejecución del diagnóstico Node con OCR real, no una
comparación estadística ni un benchmark del navegador. La primera foto incluye
el inicio del worker. Se mantienen 4/5 nombres acertados; esto no mide edición.

Los IDs corroborados contra el catálogo local son, en orden, `me55c-106`,
`me55-23`, `me55-92`, `me55-137` y `me55-145`. Al etiquetar ambos informes
con esos IDs, el top-1 exacto fue 2/5 antes y 2/5 después. Pikachu y Chandelure
siguen sugiriendo otra impresión; la mejora del recorte no resuelve por sí sola
la identificación de edición.

En IMG_4987 el nameGuess final pasó de «Sal preon ex» a «Umbreon ex». El primer
candidato sigue siendo `me55-92`, con estado ambiguous porque otras impresiones
comparten el nombre y no se recuperó evidencia fiable del número/código.

La inspección visual de las cinco capturas normalizadas confirmó el pie dentro
del recorte: 106/105, 023/128, 092/128, 137/128 y 145/128 respectivamente. No
significa que el OCR los haya leído. En Umbreon el recorte anterior terminaba antes
de 30C EN / 092/128; el nuevo los contiene completos.

## Experimento del pie y límites

Se midió también la ruta progresiva experimental sobre IMG_4987, primero con
el pie de la imagen reducida y después con el pie de los píxeles originales.
La segunda ruta evita perder detalle por reducción, pero no recuperó código ni
número con los filtros actuales. Los informes `scanner-stage2-footer-*` y
`scanner-stage2-rawfooter-*` registran 7,92 y 9,03 segundos respectivamente, con
worker inicial y más pasadas. La ruta progresiva sigue apagada por defecto.

No se introducen señales inventadas ni se fuerza una aceptación automática.
La lectura fiable del pie y Hisuian Zorua quedan pendientes para otro bloque.
No se integran reconocimiento visual, WebGPU ni mobile en esta etapa.

## Verificación

`pnpm run check` pasó: lint, tipos, 323 tests backend + 4 de API + 390 frontend
(717 pasaron; 2 omitidos y 1 todo preexistentes), y builds de ambos proyectos.
Se agregaron cuatro regresiones para recuperación acotada del pie y consenso
entre pasadas. No se modificó el catálogo ni se crearon datos de colecciones.
La API y /escanear respondieron 200 al finalizar, con un único stack levantado.

## Verificación de la etapa 3 (OCR actual)

La lectura de colección ya estaba implementada: cuatro pasadas de número, dos
regiones para bloques de código y extracción restringida a códigos existentes en
el catálogo. El frontend también carga esa configuración. La pasada extra de
código que ensayé en esta revisión no reconoció nada con confianza y fue retirada
para no sumar tiempo sin resultado.

Con esa implementación actual, en una ejecución real de las cinco fotos:

- número OCR recuperado en 3/5 (23, 92, 145; Celebi y Chandelure quedaron sin
  token validado —el 106/108 leído de Celebi contradice el impreso 106/105);
- top-1 exacto 4/5: `me55c-106`, `me55-23`, `me55-92`, `me55-145`; Chandelure
  quedó como `bw4-101` en lugar de `me55-137`;
- `setCode` OCR fue null en 5/5. El texto del código no pasó la validación de
  confianza/código conocido;
- Umbreon leyó `Umbreon ex`, número 92, candidato `me55-92`, estado `confident`.

Éste es diagnóstico Node con OCR real, no latencia de cámara en el navegador.
El código estaba implementado; el resultado de la comprobación muestra que su
reconocimiento aún requiere mejora. La etapa de número queda mayormente validada,
la de código queda abierta.

## Presentación del número en coincidencias

La hoja ya mostraba `extracted.number` cuando la API lo devolvía; el diagnóstico
Node había validado `092/128`, pero no se conservaba ese formato en estado de
pantalla, y la foto del usuario mostraba sólo nombre/colección. El pipeline ahora
conserva `printedNumberGuess` validado, y la hoja presenta «Número detectado:
092/128», usando el dato local como respaldo del API (que sólo recibe 92).
El flujo de página se cubre con OCR simulado y el número impreso del pie.

Verificación final: `pnpm run check` pasó lint, tipos, 323 tests backend,
4 pruebas API, 397 frontend y ambos builds; 2 pruebas skip y 1 todo.
