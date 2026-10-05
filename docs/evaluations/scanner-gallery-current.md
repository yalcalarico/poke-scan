# Contraste del original directo con la galería vigente

Tras la autorización explícita del usuario, se ingresó con la cuenta local de pruebas y se subió `/tmp/cards-full/IMG_4987.png` mediante «Subir una foto» en `/escanear`. No se modificó el reconocimiento, el índice ni los umbrales.

## Resultado observado

La galería reconoció **Umbreon ex, 30th Celebration, 92/128 (`me55-92`)**. Esto coincide con la captura aportada por el usuario. El diagnóstico visible informó:

- 20.670 referencias, 175 colecciones, prefijo de versión del índice `9d89a62b919f`.
- Posición DINOv2 original **2**, similitud **0,683**.
- Posición final **1**, geometría corroborada: **87/95** puntos, cobertura **31,3 %**.
- Índice 16 ms, modelo 0 ms, inferencia 85 ms, verificación 1069 ms, API 1246 ms. Consulta caliente; no es tiempo desde elegir el archivo hasta terminar de mostrar el precio.
- Ausencia de precio representada por guion; la identidad se conservó.

[Captura](scanner-umbreon-gallery-current.jpg) y [snapshot del diagnóstico visible](scanner-umbreon-gallery-current.txt).

La medición anterior del runner envió el archivo original directamente al motor: **418.º en DINOv2 y #1 final `pop5-10`**. No ejecutó `prepareVisualPhoto`, que en la app reduce la foto, detecta/recorta/orienta y codifica el recorte. Los resultados comparan entradas distintas. Por lo tanto, **4/5 sobre originales directos no describe la precisión de la galería actual** ni demuestra un fallo de este caso en la app. No reemplaza el anterior 5/5 sobre recortes preparados ni certifica precisión general. No se capturaron ni guardaron los bytes del recorte enviado; el contraste se apoya en código del flujo y diagnóstico UI.

## Otras verificaciones reales

- Recargar la misma pestaña restauró la sesión con una entrada Umbreon ex.
- Abrir y cerrar Organizar conservó la entrada sin guardarla.
- Se creó la colección local **«Prueba escáner · 4 octubre»**, ID `5280a2ac-ce9e-4aa9-aaf8-6d4cc90f1e72`, para separar la prueba de las colecciones existentes.
- Organizar permitió elegir esa colección y cantidad 2. El guardado explícito retiró la entrada de sesión. La colección mostró **2 cartas, 1 única, 1 duplicada**, Umbreon ex con 2 copias. No se borró la colección de prueba.
- En esta hoja no se observó selector de variante: `OrganizeSheet` envía `cardId` y `quantity`; no se da por verificada selección de acabado. El texto anterior de scanner.md indicaba una opción que la hoja actual no ofrece.
- Se cerró sesión y se abrió el enlace público **ya existente** `/share/tb7cpl5fql`, sin crear otro enlace. Renderizó en modo sólo lectura: 5 cartas, 4 únicas, 1 duplicada, 2 sets; Chandelure con 2 copias. No mostró email ni controles de edición. Esto verifica render sin sesión de esa colección, no una prueba exhaustiva de privacidad.

La prueba sólo cambió datos de la cuenta de desarrollo: creó la colección de prueba y sus dos copias; el enlace existente puede incrementar su contador de vistas. No se publicó nada fuera del stack local ni se tocaron las colecciones existentes. La pestaña de prueba terminó cerrada y la sesión deslogueada.

No se cambió código de aplicación en este bloque. El check completo verde anterior sigue siendo evidencia del mismo código. Cámara física, PWA/offline, corpus amplio, calibración, SIGINT y estabilidad prolongada siguen pendientes.
