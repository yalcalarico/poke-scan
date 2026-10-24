# Portafolio y colecciones

`/colecciones` muestra el resumen de todas las colecciones del usuario, las cinco cartas más valiosas (por precio unitario), búsqueda por nombre, orden por nombre/valor/principal y portadas con hasta cuatro cartas. Las acciones para crear y sumar cartas usan los flujos existentes. El detalle de colección sigue en `/colecciones/[id]`.

Los agregados privados toman `valuation.amount` como cifra canónica y explican cobertura por copias y antigüedad al momento de `evaluatedAt`. Un monto cero es conocido, un `null` en una colección no vacía significa que no hay referencias, y el valor de un conjunto parcial solo suma copias con `market`. Respuestas anteriores sin `valuation` muestran sus metadatos como no disponibles; los campos numéricos legacy no reconstruyen cobertura ni ausencia.

## Datos reales

`GET /api/portfolio` requiere sesión. Usa el mismo precio local por proveedor, fuente, moneda y variante que el valor de las colecciones. No consulta proveedores externos ni refresca precios al dibujar la gráfica. Una variante aparece una sola vez en el ranking aunque esté en varias colecciones o condiciones; la cantidad y el valor de la posición se suman.

El total con cartas sin precio es parcial. Si ninguna tiene precio, se explica que no hay referencia; un portafolio vacío sí vale cero. ARS es una referencia internacional convertida al cambio actual, no un precio realizable local.

## Historial

El portafolio usa cortes por colección atribuidos a TCGCSV, con un mismo corte
y alcance completo por usuario. Las lecturas actualizan hoy y el corte diario
conserva el inventario real; no se unen snapshots antiguos sin proveedor a la
serie nueva. Se devuelven hasta 365 días observados. Una sola valoración no
dibuja tendencia; una valoración sin precio permanece nula. No se reconstruyen
compras ni precios pasados desde el inventario actual.

La variación expresa cambios de valor del portafolio: incluye incorporaciones, retiradas y cambios de precios. No es retorno de inversión ni ganancia. El gráfico usa `history[].valuation.amount` y ofrece su listado con fechas, valores y cobertura del snapshot, también accesible con teclado. La antigüedad de los precios en los snapshots no está registrada. Los montos históricos en ARS usan la conversión vigente del usuario, no un histórico de cotizaciones cambiarias.

## Detalle de colección

El valor queda en la cabecera; las acciones permiten sumar cartas, editar el nombre,
exportar CSV y crear un enlace público preseleccionando la colección actual.
La grilla muestra nombre, set, número, variante, condición, cantidad y total por ítem.
Tocar una carta conserva la hoja de edición existente. El unitario y el subtotal usan la variante guardada; al cambiarla, la referencia anterior se retira hasta guardar. La condición registrada no ajusta el valor. La búsqueda por nombre se
resuelve en el servidor y compone con los filtros y el orden; un resultado vacío
permite limpiar la búsqueda y los filtros. La selección múltiple conserva su flujo.

La exportación descarga todas las páginas, sin los filtros de la vista, y declara
los precios en USD. Los precios desconocidos quedan vacíos. El CSV incluye BOM,
comillas escapadas y protección de fórmulas en texto. No se sube a servicios externos.

Los instantes de consulta y evaluación conservan hora y zona UTC. Las fechas de observaciones son días UTC; no dependen de la zona del visitante. La metadata del ranking acompaña cada referencia, conserva el orden recibido y muestra hasta cinco cartas.

## Actualización de referencias y eliminación — 16/10/2026

Al abrir colecciones o el portafolio, la API solicita por cola las variantes sin
referencia del proveedor TCGCSV o con consulta vencida (24 horas). La UI consulta
los resultados cada 10 segundos, durante hasta dos minutos, sin tráfico directo
al proveedor. Al llegar una cotización se renuevan ítems, totales, ranking y
observación del día. «Actualizar precios» permite volver a solicitar y consultar;
no fuerza llamadas externas dentro de la vigencia. El estado pendiente no implica
éxito ni disponibilidad garantizada. Se conserva la evidencia de fechas y cobertura.

La gráfica principal conserva un punto por día UTC. Además de las visitas, un corte
a las 23:45 UTC registra el inventario y las últimas referencias disponibles de ese
día, también para los gráficos por colección. Requiere el backend en ejecución;
no reconstruye días perdidos y no representa rentabilidad. Puede desactivarse con
`ENABLE_PORTFOLIO_SNAPSHOTS_CRON=false`.

En el detalle, la papelera superior derecha permite eliminar la colección. La confirmación informa la
cantidad de copias y que sus enlaces compartidos también se borran. No se navega
hasta que la API confirma; un fallo conserva la confirmación para reintentar. Las
otras colecciones se conservan. Sigue vigente la creación automática de una
colección inicial vacía cuando la cuenta ya no tiene ninguna.

### Acceso directo a eliminar

La papelera en la esquina superior derecha del detalle abre directamente la
confirmación de eliminación. «Editar» queda reservado para cambiar el nombre;
el borrado ya no está dentro de ese formulario.
