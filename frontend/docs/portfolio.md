# Portafolio y colecciones

`/colecciones` muestra el resumen de todas las colecciones del usuario, las cinco cartas más valiosas (por precio unitario), búsqueda por nombre, orden por nombre/valor/principal y portadas con hasta cuatro cartas. Las acciones para crear y sumar cartas usan los flujos existentes. El detalle de colección sigue en `/colecciones/[id]`.

## Datos reales

`GET /api/portfolio` requiere sesión. Usa el mismo precio local por proveedor, fuente, moneda y variante que el valor de las colecciones. No consulta proveedores externos ni refresca precios al dibujar la gráfica. Una variante aparece una sola vez en el ranking aunque esté en varias colecciones o condiciones; la cantidad y el valor de la posición se suman.

El total con cartas sin precio es parcial. Si ninguna tiene precio, se muestra un guion; un portafolio vacío sí vale cero.

## Historial

Una observación por usuario y día UTC se guarda en PostgreSQL al consultar el resumen. Consultas posteriores ese día actualizan ese punto. No hay muestreo automático en días sin consulta ni reconstrucción de compras pasadas a partir de las cantidades actuales. El historial devuelve hasta 365 observaciones; los controles muestran 7 días, 30 días o un año calendario. Una sola valoración no dibuja una tendencia. Las valoraciones sin precio quedan registradas con valor nulo y no dibujan un punto.

La variación expresa cambios de valor del portafolio: incluye incorporaciones, retiradas y cambios de precios. No es retorno de inversión ni ganancia. El gráfico usa las observaciones disponibles y ofrece su listado con fechas y valores, también accesible con teclado. Los montos históricos en ARS usan la conversión vigente del usuario, no un histórico de cotizaciones cambiarias.

## Detalle de colección

El valor queda en la cabecera; las acciones permiten sumar cartas, editar el nombre,
exportar CSV y crear un enlace público preseleccionando la colección actual.
La grilla muestra nombre, set, número, variante, condición, cantidad y total por ítem.
Tocar una carta conserva la hoja de edición existente. La búsqueda por nombre se
resuelve en el servidor y compone con los filtros y el orden; un resultado vacío
permite limpiar la búsqueda y los filtros. La selección múltiple conserva su flujo.

La exportación descarga todas las páginas, sin los filtros de la vista, y declara
los precios en USD. Los precios desconocidos quedan vacíos. El CSV incluye BOM,
comillas escapadas y protección de fórmulas en texto. No se sube a servicios externos.
