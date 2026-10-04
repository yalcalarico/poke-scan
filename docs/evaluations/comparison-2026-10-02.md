> Nota de vigencia (2026-10-03): este documento conserva evidencia histórica. La lectura de texto y el comparador fueron retirados; el flujo actual usa únicamente DINOv2. Consultá [scanner.md](../../frontend/docs/scanner.md).

# Comparación DINOv2 y OCR — 2026-10-02

El botón experimental de `/escanear` ejecuta ambos métodos en paralelo. La foto
se decodifica con su orientación, se detecta la carta una sola vez y se muestra
el recorte. Ese PNG sin metadatos va a la API visual y esos mismos píxeles se
usan en OCR; el pie OCR puede aprovechar la resolución original. Modelo,
embeddings e índice de 191 referencias no cambiaron. OCR consulta el catálogo
local completo: los universos de candidatos son diferentes.

## Evidencia real en navegador

Fotos etiquetadas existentes, convertidas a JPEG con orientación aplicada.
Tiempos de una ejecución local, no un benchmark ni una garantía de dispositivo.

| Foto | Visual top-1 | OCR top-1 | Visual HTTP | OCR total |
|---|---|---|---:|---:|
| IMG_4987, Umbreon | `me55-92`, coseno 0.662 | `me55-92`, ranking 1.310 | 195 ms | 3787 ms |
| IMG_4985, Shining Celebi | `me55c-106`, coseno 0.742 | `dp2-7`, ranking 1.000, ambiguo | 194 ms | 2867 ms |

Umbreon: preparación compartida 176 ms; modelo visual caliente, inferencia y
preprocesado 93 ms, API 122 ms; OCR frío, inicio 135 ms, lectura 2381 ms,
matching HTTP 1265 ms. Leyó `Umbreon eX` y `092/128`, con 13 pasadas. Margen
visual 0.030; margen OCR 0.310. La foto entera lo ubicaba séptimo en la prueba
anterior. El recorte resuelve esta foto; no prueba que resuelva cualquier Umbreon.

Celebi: OCR reutilizado, lectura 2575 ms y matching HTTP 206 ms. Sólo leyó el
nombre, sin número ni código. Shining Celebi aparece segundo empatado, margen
0.000. La pantalla avisa que las predicciones difieren y conserva ambas listas.

Una comprobación aislada del motor visual con los cinco recortes diagnósticos
existentes dio top-1 correcto en los cinco (`me55c-106`, `me55-23`, `me55-92`,
`me55-137`, `me55-145`). No equivale a una evaluación amplia ni a cinco pruebas
del comparador en navegador.

## Interpretación y privacidad

Scores coseno y OCR no son probabilidades ni tienen la misma escala. Mostramos
score, ranking, márgenes y señales separadas; coincidencia de top-1 no confirma
la edición. No se guarda ninguna carta, memoria o imagen diagnóstica. La API
visual necesita sesión y flags optativos; el OCR corre en el dispositivo y manda
sólo texto al catálogo. Ninguna consulta descarga referencias externas.

Cancelación y errores son independientes; un resultado completo queda visible
si el otro falla. Tope conjunto: 120 s; HTTP visual: 35 s. WASM en curso puede
terminar antes de observar el aborto. La preparación compartida se informa aparte
y hay que sumarla si se compara tiempo desde la selección de archivo.

Pruebas de regresión cubren recorte idéntico, diagnóstico sin persistencia,
comportamiento diagnóstico original, evidencia, errores y cancelación.
Captura: `comparison-umbreon-2026-10-02.jpg`; texto visible:
`comparison-umbreon-2026-10-02.json`.

`pnpm run stop` seguido de `pnpm run check`: verde. Backend: 329 tests y
4 de API; frontend: 408 aprobados, 2 omitidos y 1 pendiente. Lint, tipos y
builds de ambos proyectos aprobados.
