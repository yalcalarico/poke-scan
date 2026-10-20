# A2 — Señales orientativas de calidad de captura

Implementado el 6 de octubre de 2026. Métricas frontend y avisos de revisión;
sin cambio de contrato API, modelo, índice o reglas de aceptación.

## Métricas y alcance

`analyzeCaptureQuality` promedia el recorte a un máximo de 256 px, excluye un
margen del 5% del lado menor y calcula:

- Varianza del Laplaciano de luminancia: señal orientativa de poco detalle.
- Fracción de píxeles casi blancos y fracción de la región conectada mayor:
  señal orientativa de zona clara amplia.

Heurísticas v1: varianza menor de 80; píxeles con todos los canales >=240 y
luminancia >=245; fracción clara >=2,5% y región mayor >=1,2% para aviso de luz.
Son valores iniciales sin calibración en corpus amplio. Diseño blanco/liso,
ruido, enfoque, iluminación y reducción de resolución pueden confundirlos.
No se diagnostica con certeza una foto desenfocada ni un reflejo físico.

Galería analiza el recorte preparado. Cámara decodifica para analizar y conserva
la data URL original enviada: un fallo de esa decodificación opcional no bloquea
reconocimiento. La métrica ocurre después de capturar, no en cada frame de cámara.

La revisión conserva métricas en memoria; el diagnóstico descargado incorpora
`quality` con schemaVersion=1, tamaño de análisis, métricas y avisos.
No se persisten en sessionStorage ni se transmiten como parte del DTO a la API.
No cambian los bytes de consulta ni descargan nada automáticamente.

## UI y especialista

Se aplicó la skill `frontend-ios-elegante` y un agente especialista implementó
el aviso usando Alert/tokens existentes, tono warning, tamaño sm y lectura
polite. Consejos condicionales de enfoque/luz; título experimental y copy que
explica la posibilidad de confusión con el diseño. Sin botones extra, semáforo
de calidad correcta, animaciones ni bloqueo de selección/confirmación.

El aviso aparece en la comparación y, para galería, al terminar la consulta.
La primera revisión de cámara sin candidato también puede mostrarlo junto
a las acciones de diagnóstico. No se agregó un filtro de captura automática.

## Verificación

Pruebas focalizadas: 21 verdes antes de acortar el copy. Cubren detalle/fondo
uniforme, región clara grande, puntos blancos dispersos, amarillo saturado,
exclusión de borde, tamaño/métricas finitas, conservación de píxeles, exportación
del diagnóstico, avisos condicionales/accesibilidad y reconocimiento no bloqueado.
El test integrado verifica que las métricas no llegan a la sesión persistida.

Check final verde con el copy definitivo: **694 pruebas**, 315 backend,
7 scripts, 6 e2e y 366 frontend; lint, tipos y ambos builds.
`git diff --check` sin errores. Stack de desarrollo restaurado al terminar.

Se cargó un fixture sintético PNG en el escáner real autenticado con usuario
de desarrollo. Activó blur/glare y permitió reconocimiento y revisión: no es
una carta válida ni evidencia de precisión. El comportamiento vigente de
DINOv2 igual propone candidatos; A2 no calibra rechazo de negativos.
La revisión mantuvo Confirmar habilitado y el cierre por teclado devolvió foco
a Revisar última foto. No se guardó ningún ítem en colecciones.

[Métricas del fixture](scanner-quality-fixture-2026-10-06.json).
Revisión visual desktop 1280×720 en ambos temas:
[claro](scanner-quality-light-2026-10-06.jpg),
[oscuro](scanner-quality-dark-2026-10-06.jpg).
Tema inicial oscuro y sesión inicial sin login restaurados; pestañas temporales
cerradas. Las dos lecturas sintéticas sólo pertenecían a esa pestaña de prueba.

## Límites pendientes

El override 390×844 mantuvo ancho efectivo 1280 px; se restauró. No se certifica
mobile, safe areas, cámara física o PWA instalada. El evento de descarga del
navegador no retornó archivo al pulsar diagnóstico; no se certifica la descarga
física. La construcción del JSON y conservación de bytes están cubiertas por tests.

Pendiente B1/B2: corpus real etiquetado, calibración y falsos avisos por condición.
Pendiente C1/C3: captura y legibilidad en iPhone/Android. La ausencia de avisos
no equivale a una captura correcta ni una predicción confiable.
