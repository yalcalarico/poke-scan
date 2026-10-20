# Plan técnico — comparación TCGCSV e históricos

**Estado vigente13/10:** implementación local y gráficas aceptadas; [validación](PRECIOS-comparacion-validacion.md). Ingesta comparativa local programada14/10,17:30Argentina después del presupuesto24h; primera ingesta real/cobertura y derechos públicos/comerciales no acreditados todavía. Snapshot diario local activo. El resto conserva el plan de diseño original, no sustituye el cierre vigente.

13/10/2026. Pedido del usuario: traer TCGCSV para comparar con la fuente actual y graficar precios de cartas y valores de cada colección. Este documento define la implementación; no ejecuta importación, migra schema, activa proveedores/colas ni cambia cotizaciones.

## Decisión técnica propuesta

Sincronización diaria en background, por grupos de TCGCSV. Consultar `last-updated.txt`; importar únicamente un build nuevo y respetar una descarga de contenido por24h. Horario propuesto:20:30UTC (17:30Argentina), después del build habitual anunciado alrededor20UTC. Si el build sigue anterior, mantener fecha y último precio; no inventar una actualización. User-Agent propio, pausas, límites de tamaño/timeout y control de concurrencia; no fetch desde navegador/handler público. Fuentes: [guías](https://tcgcsv.com/docs), [frecuencia](https://tcgcsv.com/).

Lecturas de la app desde PostgreSQL/Redis. Bajo demanda únicamente para incorporar un grupo aún no importado: la app encola y devuelve lo conocido/estado pendiente; un lock y presupuesto porgrupo/proveedor evitan descargas por cada usuario o carta. Abrir gráficos o pulsar actualizar nunca saltea cuota, fecha del build ni consulta cada carta externamente. Reinicio reconcilia última corrida; sin recurso de backup/genesis automático.

## Primer lote: comparación, sin sustituir el activo

- Grupo24722 `ME: 30th Celebration`; grupo24837 `ME: 30th Celebration Classic Collection`.
- Resolver relación local→producto remoto porgrupo/idioma/edición/número completo/nombre; conservar IDs canónicos, descartar sellados y dejar ambiguos pendientes. Classic necesita mapeo revisado por carta, no unión ciega de numeración. Precio ligado a producto+subTypeName/variante exacta; condition almacenada no transforma automáticamente importe.
- Guardar TCGCSV por separado, conservando TCGdex y sus históricos. Ambos transportan referencias TCGplayerUSD: la comparación es de cobertura, asociación y frescura del feed, no consenso entre dos mercados independientes. Comparar misma carta/variante/moneda y declarar fecha de cada observación; no promediar ni sustituir fuentes silenciosamente.
- Panel de comparación por carta: proveedor/market/currency/fecha del build y consulta, valores conocidos y faltantes. Por colección: dos totales calculados sobre las mismas cantidades, cada uno con copias cotizadas/total y faltantes. Un valor mayor con más cobertura no demuestra precios unitarios mayores. El valor principal conserva una política única explícita hasta decidir activación.

## Datos y publicación del lote

Reutilizar `card_prices` append-only y mapeos externos. Añadir metadata de ingesta/build (UTC), producto/grupo y runId/checksum; `fetchedAt` es recepción local, `feedPublishedAt` es publicación del archivo, y timestamp real de cotización upstream sigue unknown si no viene. No presentar build/consulta como fecha de la última venta.

Corrida identificada por proveedor+build+grupo, deduplicada e idempotente. Descargar a staging acotado, validar schema/IDs/moneda/variantes/números finitos no negativos/null y relaciones de productos, revalidar build, persistir y publicar sólo grupo/lote completo coherente. Una fuente incompleta/fallida no pisa la anterior ni marca datos viejos como frescos. Nunca reemplazar ausente por0; cero válido sí se conserva. Para gráficas habrá nueva observación por build real aun cuando el importe no cambie, sin registros nuevos por relectura del mismo feed.

## Histórico de cartas

El proyecto ya guarda precios y ofrece histórico en PostgreSQL. Ampliar soporte de proveedorTCGCSV en DTO/backend y espejo frontend, mantener source/currency y cache namespace separados. Gráfica de una **variante fija**; no usar la variante más cara de cada día, porque cambiaría el objeto observado. Series TCGdex/TCGCSV claramente rotuladas, con datos conocidos de cada día; faltantes/sin histórico no se rellenan con0 ni pasado inventado. TCGCSV suministra snapshot actual: nuestro historial comienza en la primera importación; conservar fechas históricas reales de TCGdex sin atribuirlas a TCGCSV.

Reutilizar política vigente de precios: detalle90d, consolidación diaria y horizonte730d, con excepciones del último conocido/referencia. No aplicar la política30d de backups a esta tabla ni podar journal de bajas. Volumen/índices se medirán antes de ampliar catálogo/retención; no estimar capacidad de mini PC sin equipo.

## Histórico por colección y portafolio

Hoy `portfolio_snapshots` guarda total porusuario/día al consultar el resumen; no es historial automático por colección y no identifica proveedor. No recatalogar snapshots anteriores como TCGCSV ni atribuirles fuente/frescura desconocida.

Agregar snapshots diarios por `collectionId + proveedor/política + díaUTC`, con dinero decimalUSD, cantidad de copias, cotizadas/faltantes, referencias viejas/desconocidas, fecha de evaluación y build/corte utilizado. Capturar estado coherente de cantidades y referencias, con ownership/cascada de eliminación; no reconstituir pasado usando inventario actual. Registrar cambios de composición mediante revisión del inventario y/o eventos propios para explicación posterior, preservando política de cuenta/restores y datos mínimos. Portfolio suma colecciones de ese corte con política consistente, sin mezclar fuentes.

Trabajo diario después del lote publicado, aunque el dueño no abra la app. Lecturas recalculan el valor actual desde datos locales; movimientos de cartas/cantidades actualizan valor actual y punto provisional del día. Una vez cerrado el día, puntos previos quedan inmutables, salvo corrección explícita auditada. Un fallo de la ingesta conserva último conocido y snapshot declara antigüedad/faltantes; no interpola frescura.

La gráfica principal muestra **valor de las cartas que había ese día**: varía por precios y por incorporaciones/retiros/cantidades; no es rentabilidad/ganancia. Mostrar cobertura y anotar cambios de composición. Separar precio de mercado de movimientos exactos requiere registros de cambios/cortes; no prometer descomposición causal que no esté guardada.

USD como base de comparación. ARS puede seguir convertido al cambio actual con etiqueta explícita; una serie histórica de valor real enpesos exige guardar también cotización histórica/tipo/fuente/día y no reinterpretar retrospectivamente con FX dehoy. Esto último es ampliación posterior, no parte automática del lote de comparación.

## Fases de ejecución

1. Adaptador y mapeo de los dos grupos, ingesta aislada y comparación verificable; conservar datos activos. Fixtures negativas por edición duplicada, variante, null/0, moneda, contenido parcial, builds repetidos/rollback y fallo de red. Consumidor real en recursos propios, stop/check estándar/cleanup al cierre.
2. Persistencia de runs/metadata y sincronizador diario/demanda porgrupo con límites; habilitación real después de validar derechos de uso y operación. No autoactivar worker crons/proveedores de la instancia protegida de QA.
3. Gráficas de cartas con fuente/variante fija y dos series comparables, sin reescribir históricos.
4. Snapshots programados porcolección y portfolio, cobertura, composición y gráficas7/30/90/365d. DTOs espejo, migraciones aditivas, pruebas significativas y consumidor propio; preservar schema/GIN/ownership404.

Permisos de uso/redistribución del feed siguen sin acreditar; no inventar aprobación por disponibilidad pública. Lo local puede prepararse y ensayarse con fixtures/recursos propios. Las encuestas y corpus etiquetado los aportaelusuario; mini PC y cuentas/servicios reales continúan para el final. Plan20/38/18pendientes; documento no demuestra funcionalidad implementada ni cierra IDs. AutomatizaciónPAUSED/doshoras; sin capturas ni fuentes consultadas de nuevo por APIs deprecios.
