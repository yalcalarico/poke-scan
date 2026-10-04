> Nota de vigencia (2026-10-03): este documento conserva evidencia histórica. La lectura de texto y el comparador fueron retirados; el flujo actual usa únicamente DINOv2. Consultá [scanner.md](../../frontend/docs/scanner.md).

# Dataset de evaluación del escáner

`manifest.json` contiene las cinco fotos disponibles en `/tmp/cards-full` y su
ID exacto esperado. Los cinco IDs están corroborados en el catálogo local y
documentados en `scanner-stage2-2026-10-01.md`; no se infieren del resultado del
OCR. El orden del manifiesto corresponde a `IMG_4985`–`IMG_4989`.

El diagnóstico Node guarda por foto el top-1 exacto, presencia del ID esperado
en top-8 y top-10 (top-10 se informa sólo si la API devolvió al menos diez
candidatos), número leído/correcto, cobertura de código de colección, estado de
aceptación y latencia total más timings de API. `confident` se registra como
aceptación del backend; `ambiguous` y `low` no se cuentan como aceptados. La
latencia es Node total, con dimensiones de entrada y marca explícita para la
primera foto que calienta el worker. El plan no fija un objetivo numérico de
latencia; se guardan los tiempos observados para poder comparar p50/p95 después,
sin inventar un umbral.

El archivo `scanner-stage3-diagnostic-2026-10-01.json` registra una corrida con
**3/5 números correctos y
3/5 con algún número recuperado**, **0/5 códigos detectados**, y **4/5 IDs
exactos en top-1**. Las tres lecturas correctas fueron 23, 92 y 145; no se cuenta
como correcta la lectura 108 para la impresión 106/105. Son resultados de una
ejecución de diagnóstico con OCR real en Node, no una estimación estadística ni
una medida de cámara en Safari. La corrida distinta documentada en
`scanner-stage2-2026-10-01.md` reportó 4/5 números correctos, incluido
Chandelure. Esas mediciones no se mezclan: los resultados varían entre corridas
y cada JSON conserva la salida de su ejecución. Los estados de aceptación
dependen de cada ejecución y se guardan por separado.

## Ampliación a 50–100 imágenes

La ampliación queda preparada como siguiente tarea; no hay más imágenes
etiquetadas disponibles en este checkout y no se agregan ejemplos sintéticos.
Cada nueva fila del manifiesto debe apuntar a una foto real y a un ID cotejado
contra el catálogo local. Registrar además condiciones como brillo, reflejo,
ángulo, desenfoque, idioma y cartas negativas en una columna o manifiesto
versionado cuando se recolecten. Mantener grupos separados por captura/origen
para evitar contar fotos casi idénticas como casos independientes.
