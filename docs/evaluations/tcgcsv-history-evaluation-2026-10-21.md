# TCGCSV: evaluación de importación histórica — 21/10/2026

## Decisión del bloque 5

Evaluación y diseño entregados. No descargar ni importar el archivo histórico
completo como sustituto del ciclo diario de Pokémon. La ampliación diaria puede
cerrarse sin este bloque. No se generaron observaciones históricas ni valores
pasados de colecciones.

Las [guías vigentes](https://tcgcsv.com/docs) describen archivos inmutables de
aproximadamente 2–4 MB por día, que incluyen todas las categorías, y piden no
volver a descargarlos ni sustituir con ellos consultas específicas de precios.
La [FAQ](https://tcgcsv.com/faq) documenta `.ppmd.7z` diarios desde 08/02/2024,
con rutas por fecha/categoría/grupo. Una ventana de siete días supone
aproximadamente 14–28 MB antes de extraer; es una estimación documental, no una
descarga medida. No se descargó ningún archivo para esta evaluación.

## Contrato propuesto para una importación acotada

1. Entrada explícita: fechas UTC y grupos únicos de interés, máximo configurable,
   presupuesto calculado antes de descargar. No cron ni llamada pública nuevos.
2. Almacén inmutable por fecha, SHA256 y recibo de descarga. Si ya existe una copia
   íntegra, reutilizarla sin red. `429` respeta pausa y `Retry-After`; trabajo serial.
3. Extracción aislada y acotada a `FECHA/3/GRUPO/prices`, rechazando rutas fuera
   del directorio, enlaces, tamaños excesivos o contenido parcial. Conservar el
   archivo completo recibido aunque se procese sólo Pokémon.
4. Identidad: exigir evidencia válida para esa fecha de producto, carta, idioma,
   número y variante. El archivo de precios sólo no aporta esos productos. Un
   mapping actual no prueba que la identidad histórica fuera equivalente; dejar
   el caso pendiente si no hay evidencia histórica suficiente.
5. Publicación idempotente por proveedor/grupo/fecha/checksum. Repetir la misma
   entrada no agrega puntos; un checksum distinto para la misma fecha requiere
   revisión. Transacción por grupo y rollback completo ante conflictos.
6. Separar recepción del archivo, publicación del feed y fecha histórica observada.
   Hoy `card_prices.fetchedAt` significa recepción y las lecturas actuales e
   históricas lo usan para ordenar/agrupar. Antes de importar hace falta un campo
   histórico propio y adaptar esas lecturas: poner una recepción actual podría
   reemplazar el precio vigente; falsear `fetchedAt` perdería la procedencia.
7. La importación no cambia `publishedBuild`, reservas ni referencia actual del
   worker diario. No atribuir datos TCGdex a TCGCSV ni unir series de fuentes.
8. Mantener huecos. El precio histórico de una carta no reconstruye una colección
   sin el inventario y composición de ese día.

## Resultado y alcance pendiente

La ejecución del backfill queda diferida: hacen falta una ventana/grupos concretos,
evidencia de identidad histórica y la ampliación temporal del contrato anterior.
No se agregó un importador que acepte fechas o identidades supuestas. Esta decisión
no bloquea caché, asociaciones, telemetría ni ampliación del ciclo diario.
