# Historial de precios y valor

Desde **20/10/2026**, TCGCSV es la única fuente de precios de la app. La ficha,
colecciones y totales usan referencias TCGplayer USD de esa fuente. Se retiró el
panel de comparación entre proveedores; las URLs `/comparison` siguen por
compatibilidad y devuelven una sola serie TCGCSV.

`lib/api/comparison.ts` valida identidad, variante, fecha, importe y cobertura.
Cuando `activeProvider` es TCGCSV exige exactamente una serie TCGCSV y rechaza
respuestas mezcladas. Los contratos conservan tipos de proveedores históricos
para interpretar fixtures y registros anteriores, sin mostrarlos en la app activa.

La ficha fija la variante y ofrece períodos 7, 30, 90 y 365 días. El historial
compacto recibe proveedor y variante del precio visible. La gráfica usa días
UTC, muestra todos los puntos, corta precios nulos y días ausentes, mantiene
cero conocido y explica escala ajustada. El eje X abarca todo el período elegido,
anclado al día UTC de evaluación de la respuesta; no estira los pocos días de
historial para llenar ventanas de 7, 30, 90 o 365 días. El portafolio usa la misma
regla. El eje Y sigue el rango de importes observados. Las observaciones diarias se pueden
consultar como texto. El período ocupa una fila completa y las etiquetas entran
en el detalle de escritorio y a 390 px.

El historial deja recepción (`fetchedAt`) y publicación del archivo
(`feedPublishedAt`) dentro de detalles cerrados por defecto. Su recencia se etiqueta como publicación del
feed; no equivale a la fecha upstream de la cotización, desconocida. La metadata
de consulta en ficha/valuación describe recepción local y lo dice explícitamente.

Colecciones y portafolio conservan valor, cobertura por copias y cambios de
composición. El portafolio usa historia atribuida a TCGCSV, sin mezclar snapshots
anteriores sin proveedor ni reconstruir días faltantes. USD se mantiene en el
historial aunque elijas ARS para la app. No representa ganancia.

El alta y edición usan las variantes conocidas de la misma ficha. Una sola se
muestra fija; la edición conserva la guardada. Sin evidencia se conserva la
elección manual. Las cargas y errores del historial son independientes del
contenido principal; reintentar usa la API local y no descarga el feed.
