# Evaluación del escáner — protocolo vigente, 6 de octubre de 2026

DINOv2 solo, coseno top-8, sin ORB/OCR ni rechazo calibrado. La UI suma el
primer candidato a sesión; el guardado en colección requiere acción explícita.
La revisión permite elegir otro candidato y reemplaza la lectura existente.

## Corpus y etiquetas

Objetivo: **50–100 fotos reales**, diferentes cartas, dispositivos y condiciones.
No ampliar el conteo mediante imágenes sintéticas, repeticiones o variantes de
una misma foto. Registrar cuántos IDs distintos y bytes distintos se evaluaron.

- Positivo: ID exacto confirmado por set y número; acabado normal/holo/reverse
  se anota aparte. La predicción del modelo no sirve como etiqueta.
- Negativo: confirmado que ningún ID del índice debe aceptarse (dorso, fondo,
  otra clase de carta, carta ausente del catálogo).
- Sin etiqueta: `labelStatus: "unlabelled"` y `cardId: null`. Se ejecuta como
  diagnóstico pero no entra en precisión ni falsas aceptaciones.
- Origen: `original`, `gallery-crop` o `camera-crop`. No mezclar su precisión:
  el runner no implementa la preparación del frontend.
- Partición: `development` para casos usados al investigar; `holdout` para
  cartas reservadas y no utilizadas al elegir mejoras. Todas las tomas de la
  misma carta/reimpresiones relacionadas deben permanecer en una partición.

Distribución orientativa de 60 fotos: 40 positivas de al menos 20 IDs (claras y
con condiciones difíciles), 10 reimpresiones/full-art y 10 negativos confirmados.
Las categorías pueden solaparse: no son tamaños de muestra independientes.
Reservar aproximadamente un tercio de las identidades como holdout antes de
ajustar el método. Si el corpus real no permite esta distribución, registrar el
alcance y no inventar muestras para cumplir cuotas.

Etiquetas de condición sugeridas: `funda`, `reflejo`, `desenfoque`, `perspectiva`,
`full-art`, `reimpresion`, `dorso`, `sin-carta`. Registrar dispositivo, navegador,
pestaña/PWA y luz en la ficha de captura. Las condiciones del manifiesto pueden
incluir esas etiquetas; el reporte presenta grupos solapados por condición.

## Estado del material disponible

| Material | Etiqueta | Uso |
|---|---|---|
| IMG_4985–IMG_4989, originales en `/tmp/cards-full` | Cinco IDs confirmados | Regresión development; no mide preparación cliente |
| Exportado de Carkol del 4/10 | `me2pt5-119` confirmado | Cámara, fallo conocido; faltan bytes accesibles en esta sesión |
| Exportado de N’s Darmanitan del 4/10 | Edición pendiente | Diagnóstico sin etiqueta; no es negativo; faltan bytes accesibles |
| Foto IMG_4987 por galería del 6/10 | `me55-92` | Observación real: Luxray primero, Umbreon segundo, corregible |
| Fotos nuevas/negativos/holdout | Pendientes de aportar | No hay evaluación amplia terminada |

Los informes previos de los pares de cámara conservan hashes y resultados;
no se convierten en nuevas ejecuciones si los JPG originales no están presentes.
Los originales temporales tampoco están incluidos en Git. El manifiesto del
baseline conserva las rutas de las cinco fotos existentes.

## Runner reproducible

Desde la raíz (no usa DB ni precio; puede ejecutarse con stack arriba):

```sh
pnpm --dir backend run scanner:evaluate:current ../docs/evaluations/manifest-dinov2-development.json /tmp/dinov2-baseline.json 2
```

Formato de manifiesto; rutas relativas se resuelven desde ese archivo:

```json
[
  { "path": "capturas/carta.jpg", "cardId": "me55-92", "labelStatus": "positive", "origin": "gallery-crop", "split": "development", "conditions": ["funda"] },
  { "path": "capturas/dorso.jpg", "cardId": null, "labelStatus": "negative", "origin": "camera-crop", "split": "holdout", "conditions": ["dorso"] },
  { "path": "capturas/edicion-pendiente.jpg", "cardId": null, "labelStatus": "unlabelled", "origin": "camera-crop", "conditions": [] }
]
```

Son ejemplos de estructura, no archivos ni etiquetas del corpus evaluado.
Para compatibilidad, el manifiesto antiguo interpreta ID como positivo y null
como negativo; los casos pendientes deben declarar `unlabelled` explícitamente.
Una ruta repetida se rechaza. Bytes duplicados se informan para auditar el corpus.

El runner reutiliza el embedding y lector de índice vigentes en un proceso hijo.
No descarga, reindexa, modifica modelo ni guarda fotos. Crea un reporte nuevo
sin sobrescribir, con hashes, versión del índice/modelo y candidatos top-8.

Métricas por primera pasada: top-1/top-8, falsas predicciones, referencia ausente,
fallos top-8, negativos con candidato y falsas sumas a sesión **estimadas según
la política UI**, sin simular ni observar escrituras en una colección.
Sin positivos/negativos, su tasa correspondiente es `null`, no cero.
Se presentan por origen, partición y condición, con sus denominadores.
Las repeticiones sólo amplían los tiempos y no multiplican la muestra.

Carga/modelo/inferencia/ranking/total/coordinador: n/p50/p95/p99 separados en
frío y caliente. Sólo la primera consulta arranca el modelo; para estudiar
arranques distintos, repetir el proceso con un reporte nuevo y rotar el orden.
Con muestras pequeñas, p95/p99 se aproximan al máximo y no certifican producción.
No sumar percentiles de fases para inventar un percentil total.

## Medición del flujo real

Pasar una foto por galería/cámara, abrir Revisar y descargar voluntariamente
recorte exacto y diagnóstico. Guardarlos localmente para evaluación con permiso
del usuario; no agregar persistencia automática de consulta al producto.
El JSON descargado deja la etiqueta vacía: confirmarla después.

Cada ficha debe separar: ID esperado, primera predicción, presencia en top-8,
selección corregida, versión del índice/modelo, preparación cliente, HTTP y
backend; tiempo de captura/selección hasta resultado visible, precio aparte,
error/cancelación y dispositivo. El runner local no mide HTTP ni extremo a extremo.
La revisión mantiene fotos sólo en memoria mientras está montada; recargar las
pierde. La sesión restaurable conserva cartas, no fotos.

## Prueba física y funcional pendiente

| Prueba | Criterio |
|---|---|
| iPhone/Safari y Android/Chrome | Permiso, cámara trasera, foco, guía y captura; anotar entorno disponible |
| Escena quieta/cambio de carta | No duplicar al quedarse quieta; permitir nueva captura al cambiar |
| Corrección | Reemplazar una lectura sin duplicarla; revisar captura/referencia |
| Organización | Agrupar cantidades, guardar explícitamente y retirar sólo éxitos |
| Precio ausente/lento | Identidad conservada; no pedir precios de todas las alternativas |
| Cancelación/consulta nueva | Respuesta anterior no reemplaza la captura nueva |
| PWA/segundo plano/offline | Sesión conservada, error recuperable, nuevo intento al reconectar |
| Compartir/orden precio | Render sin sesión; orden numérico global con casos sin precio |

Usar [HTTPS/LAN](../local-network.md) para teléfono; no regenerar una CA vigente.
Cámara verde indica encuadre estable, no certeza de identidad o acabado.

Antes de pruebas DB: `pnpm run stop`; después `pnpm run check` y restaurar
`pnpm run dev`. Para este paso no se cambia reconocimiento, aceptación ni UI.
El siguiente GO autoriza analizar mejoras con los datos; faltan nuevas fotos
para cerrar evaluación amplia y calibración.
