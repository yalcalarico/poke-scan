> Nota de vigencia (2026-10-03): este documento conserva evidencia histórica. La lectura de texto y el comparador fueron retirados; el flujo actual usa únicamente DINOv2. Consultá [scanner.md](../../frontend/docs/scanner.md).

# Etapa 1: escanear, elegir y organizar — 1 de octubre de 2026

## Alcance

Esta entrega cierra el flujo de selección explícita, guardado desde Organizar,
duplicados y memoria optativa de correcciones. No integra embeddings ni WebGPU,
ni inicia el trabajo mobile.

## Errores corregidos

- Cantidad y destino no se aplicaban antes de inicializar el borrador de una fila.
- Las respuestas de un guardado por lote se invalidaban entre sí por un contador
  compartido. Ahora cada fila tiene su bloqueo y se conserva el resultado parcial.
- Guardar una sola fila no la retiraba de la sesión; ahora se retira al confirmarse.
- Un 409 se contaba como guardado aunque no confirmaba escritura. Permanece como
  error recuperable. El backend suma duplicados con una respuesta 201 y cantidad
  acumulada.
- La hoja cerrada pedía colecciones privadas durante el escaneo como invitado.
- El parser descartaba ex/GX/V como ruido incluso junto al nombre. Ahora conserva
  sufijos y reconoce las lecturas estilizadas «€X» y «&X» junto a una palabra.
- El ranking empataba Umbreon y Umbreon ex aunque el nombre leído incluía ex.
  Se penalizan las cartas que no cubren el sufijo explícito; esto no confirma edición.

## Foto IMG_4987

Fuente: `/Users/ysmaelalcalarico/Downloads/IMG_4987.HEIC`.
En la foto se ve Umbreon ex, 270 HP, código 30C EN y número 092/128.
La entrada correspondiente del catálogo local es `me55-92`, 30th Celebration.
La lectura previa devolvía Umbreon, con líneas como «Umbreon €X», y no recuperaba
el código ni el número. Por eso podía sugerir Umbreon normal o una impresión
alternativa sin tener evidencia para decidir. El nombre del set por sí solo no
identifica una ilustración o número concreto.

## Cómo se verifica

- Pruebas de Organizar: cantidad, destino, duplicado, conflicto, reintento,
  respuestas paralelas en distinto orden, éxito parcial y doble click.
- Integración de componentes reales ScanPage, ScanResults y OrganizeSheet con
  OCR/transporte HTTP simulados: elegir → guardar 2 → repetir → acumular 3;
  corrección optativa → volver a sugerir → borrar → dejar de sugerir.
- Parser, memoria y flujo: 39 pruebas pasaron y una quedó como todo preexistente.

Las pruebas de componentes no equivalen a una prueba de cámara física ni a una
medición de reconocimiento visual. La memoria reconoce texto normalizado repetido,
no la imagen de la carta; continúa requiriendo confirmación de la elección.

## Resultados contra el stack

`pnpm run check` pasó: lint, tipos, 323 tests backend, 4 tests de API,
386 tests frontend y ambos builds. Quedaron 2 pruebas frontend omitidas y un todo.
La primera corrida encontró una carrera preexistente en el test del worker de
precios: la invocación del proveedor se observó antes de persistir completed.
La repetición completa pasó sin modificar ese test.

En una colección temporal del usuario fixture se agregó `me55-92` con cantidad 2
 y luego con cantidad 1: ambas respuestas fueron 201, el ID del ítem fue el mismo
 y el listado tuvo un solo ítem con cantidad 3. La colección de QA fue eliminada
y la sesión creada para la prueba fue cerrada. No se alteraron colecciones existentes.

## Diagnóstico real y siguiente corrección acotada

La última ejecución real de IMG_4987 dio `me55-92` primero, en 7,73 segundos
incluyendo OCR y matching (no es una medición del navegador). Sigue siendo
`ambiguous`: hay otras impresiones Umbreon ex empatadas. El resultado está en
`scanner-stage1-umbreon-2026-10-01.json`.

Al comparar `01-foto-original.png` con `02-carta-detectada-rot0.png` de las
capturas de diagnóstico, se confirmó que el recorte termina antes de la línea
30C EN / 092/128. El dato existe en la foto pero no llega al OCR. `expandRect`
en `frontend/lib/scanner/preprocess.ts` amplía horizontalmente y no recupera
un borde inferior mal detectado. No alcanza con mejorar Tesseract para este caso.
La siguiente etapa queda dedicada a corregir y medir ese recorte.

La banda del nombre también conserva un fragmento corrupto como nameGuess
(`Sal preon ex`) por la selección de la pasada con mayor confianza; el parser
del texto unido sí prioriza Umbreon ex, y el matching aprovecha las otras líneas.
Queda pendiente revisar esa fusión junto con la lectura de la edición, sin
interpretar el top-1 acertado como reconocimiento exacto confiable.

Al cerrar esta etapa quedó un solo stack de desarrollo con API y /escanear en 200.
