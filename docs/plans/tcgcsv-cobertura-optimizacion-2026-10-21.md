# TCGCSV: cobertura y optimización de precios diarios

Fecha: **21/10/2026**. Estado: **IMPLEMENTACIÓN PARCIAL VALIDADA — cobertura y cierre operativo pendientes**.

Pedido inicial: dejar el plan como faltante. El 21/10 el usuario autorizó su
implementación completa y subagentes bajo demanda. Se aplicaron migraciones
aditivas y conciliación local; automatización Codex permanece PAUSED.

Implementado: informe reproducible, equivalencias explícitas para 24 sets,
grupos compartidos, caché persistente condicional, telemetría y alcance diario
para identidades validadas. Snapshot posterior: **173 sets asociados / 171 grupos
únicos / 173 habilitados**, frente a 149/149/18. Tres sets quedan sin identidad
segura; no se promete cobertura total de productos ni precios.

Al corte del 22/10 22:13 UTC se agotó el trabajo disponible: 147 grupos
publicados, 14 en espera, 10 fallidos; 15.336 cartas con precio conocido.
Los formatos numéricos y las causas reproducibles de fallo se corrigieron en la
[recuperación del 22/10](../evaluations/tcgcsv-groups-recovery-2026-10-22.md):
25 grupos con replay de identidad válido y reencolados sin adelantar reservas;
gate de 1.355 pruebas. Persisten tres sets sin asociación y la comprobación de
publicación real de esos reintentos cuando sus ventanas lo permitan.
La aceptación de ahorro y ciclo diario completo requiere observar esos casos,
una publicación posterior y reservas vencidas. No se acredita con un `304` de
fixture ni con el registro ampliado. Evidencia y límites en el
[informe de implementación](../evaluations/tcgcsv-coverage-2026-10-21.md).

## Objetivo

Ampliar la cobertura de precios de nuestro catálogo y reducir el tráfico diario
reutilizando los productos que no cambiaron. Mantener TCGCSV como única fuente
activa y una misma referencia por carta/variante en búsqueda, ficha, colecciones,
portafolio y enlaces compartidos.

## Punto de partida del análisis

Lectura local del 21/10/2026; estos números son un snapshot, no un estado vivo:

| Medida | Resultado |
|---|---:|
| Sets locales | 176 |
| Cartas locales | 20.670 |
| Grupos Pokémon en el catálogo TCGCSV almacenado | 220 |
| Sets locales con asociación validada | 149 |
| Sets sin asociación segura | 27 |
| Sets habilitados en el ciclo diario | 18 |
| Cartas con observaciones TCGCSV de mercado no nulas | 14.283 |

Tener observaciones no acredita que sean recientes ni que cubran todas las
variantes. Asociar un set tampoco lo habilita automáticamente para el ciclo diario.

### Descarga actual

- Categoría `3` corresponde a Pokémon; sus grupos representan aproximadamente sets.
- `/tcgplayer/3/groups` lista grupos, sin incluir todos sus precios.
- Cada grupo expone `products`, `prices` y `ProductsAndPrices.csv`.
- Nuestra ingesta ya descarga precios por grupo completo. Para un grupo con
  publicación nueva obtiene productos y precios, más comprobaciones de
  `last-updated.txt` antes y después. No descarga una vez por carta o copia.
- El ciclo diario corre a las 21:00 UTC (18:00 en Argentina), sobre
  `price_sync_sets`, con reanudación y reservas persistentes de 24 horas.
- El análisis comprobó `ETag` y respuesta condicional `304` en un archivo de
  productos; hay que validar su comportamiento en los archivos utilizados al
  implementar. El cliente actual todavía no aprovecha esa respuesta.

## Trabajo pendiente, en orden

### 1. Medir cobertura y tráfico

- [x] Actualizar el snapshot y generar un informe por set: asociación, habilitación
  diaria, cartas/variantes cotizadas, ausencias y antigüedad de las observaciones.
- [ ] Medir peticiones y bytes por tipo de archivo, duración, reintentos y pausas
  de un ciclo. Separar comprobaciones de publicación de descargas de contenido.
- [x] Clasificar los 27 sets pendientes: nombre alternativo, grupo suplementario,
  agrupación diferente, ausencia upstream o identidad todavía incierta.

**Aceptación:** baseline reproducible y lista de casos con motivo; sin confundir
ausencia de asociación, ausencia de precio y precio vencido.

### 2. Completar asociaciones seguras

- [x] Agregar equivalencias explícitas y verificadas para promos y McDonald’s.
  Ejemplo: `SWSH Black Star Promos` frente a
  `SWSH: Sword & Shield Promo Cards`.
- [x] Revisar grupos suplementarios pertinentes. El descubrimiento actual los
  excluye; conservar validaciones de edición, idioma y producto al admitirlos.
- [x] Resolver Trainer Kits: TCGCSV reúne Latias/Latios y Plusle/Minun en grupos
  compartidos, mientras nuestro catálogo los divide. Diseñar la relación entre
  un grupo y varios sets antes de modificar el registro y las consultas que hoy
  exigen correspondencia uno a uno.
- [x] Validar cada producto por identidad de carta, número, idioma y variante;
  conservar pendientes los casos ambiguos, con su motivo.
- [x] Mantener una descarga por grupo aunque corresponda a varios sets locales;
  contemplar cola, encolado por carta, publicación y seguimiento diario de todos
  los sets asociados, sin N+1 ni asignaciones cruzadas.

**Aceptación:** nuevas asociaciones respaldadas por evidencia y regresiones;
ningún precio asignado por mera similitud de nombres. No se promete cobertura
total de los 27 casos antes de investigar los productos reales.

### 3. Reutilizar productos y descargar precios diarios

- [x] Diseñar caché persistente de productos validados por grupo, con contenido,
  checksum, `ETag`/`Last-Modified` cuando existan y fechas diferenciadas.
- [x] Usar consultas condicionales para productos: `304` reutiliza el contenido
  validado; `200` valida y reemplaza el contenido de forma atómica. Enviar un
  validador sólo cuando exista una copia local íntegra y utilizable.
- [x] Mantener la primera descarga completa y detectar productos nuevos,
  eliminados o modificados; conservar validaciones de tamaño y estructura.
- [x] Descargar los precios de cada grupo objetivo cuando haya una publicación
  nueva, respetando reservas de 24 h, ejecución serial y `429`/`Retry-After`.
- [ ] Revisar comprobaciones repetidas de `last-updated.txt`; agruparlas sólo si
  se conserva detección de cambios de publicación y recuperación por grupo.
- [x] Mantener la diferencia entre recepción, validación de caché y publicación
  del feed. Repetir una lectura local no renueva una cotización ni crea historia.
- [ ] Medir ahorro contra la etapa 1: bytes, peticiones, duración y cobertura.
  Una respuesta `304` ahorra contenido, pero sigue siendo una petición.

**Aceptación:** menos bytes para grupos sin cambios de productos, precios diarios
completos y recuperación tras reinicio/fallo sin publicar lotes parciales. Conservar
JSON por defecto; evaluar el CSV combinado sólo si una medición justifica el cambio
y se mantienen las garantías de identidad y validación.

### 4. Ampliar el alcance diario

- [x] Preparar una propuesta explícita para cubrir todos los sets locales con
  identidad validada, detallando grupos únicos, volumen y duración esperados.
- [x] Conservar prioridades y deshabilitaciones manuales del registro; definir
  cómo incorpora nuevos sets válidos sin volver a habilitar los excluidos.
- [ ] Aplicar la ampliación durante su implementación y verificar una publicación
  completa, reanudación, idempotencia y resultados por set.
- [x] Exponer cobertura y fallos pendientes en la operación existente. Mantener
  los casos sin precio como ausencias, sin volver a introducir TCGdex.

**Aceptación:** alcance diario documentado y verificable; cada set objetivo termina
cotizado, parcial o sin precio con un motivo, sin quedar presentado como completo
por el solo hecho de estar encolado.

### 5. Historial real — evaluación entregada; backfill diferido

- [x] Evaluar importación acotada de archivos históricos TCGCSV por fecha y grupos
  de interés, conservando los archivos recibidos para no descargarlos otra vez.
- [x] Estimar tráfico antes de importar: los archivos diarios incluyen todas las
  categorías y el proveedor desaconseja usarlos como sustituto del sync específico.
- [x] Diseñar importación idempotente con identidad histórica comprobada, fechas
  de origen y procedencia, sin sobrescribir la referencia actual con precios viejos.
- [x] Mantener huecos cuando falten observaciones. El historial de una carta no
  reconstruye el valor pasado de una colección sin conocer su inventario de ese día.

[Evaluación y contrato](../evaluations/tcgcsv-history-evaluation-2026-10-21.md):
no se ejecutó un backfill. Requiere evidencia de identidad histórica, ventana y
separación entre fecha de recepción y fecha observada antes de implementarlo.
Las casillas de esta etapa acreditan evaluación/diseño, no datos importados.

**Aceptación:** sólo datos históricos reales y atribuibles. Este bloque no condiciona
el cierre de las optimizaciones diarias de las etapas 1–4.

## Validación prevista al implementar

- Asociaciones: promos, suplementarios, grupos compartidos, colisiones de número,
  idioma y variantes; casos ambiguos rechazados.
- Caché: `200`, `304`, validadores ausentes, copia corrupta, cambio de productos,
  cambio de publicación, límites de tamaño y reinicio entre descarga/publicación.
- Cola: deduplicación por grupo, reservas de 24 h, leases, pausa `429`, reintentos,
  reanudación y grupos correspondientes a varios sets.
- Regresiones: cero conocido, `market: null`, variantes sin precio, totales y
  procedencia coherentes en todas las lecturas; fuente activa sólo TCGCSV.
- Antes de tests, `pnpm run stop`; cerrar el lote con `pnpm run check` y flujo real
  aislado que afecte datos. Usar fixtures propios, preservar inventario real y
  restaurar el entorno según el ownership vigente.
- Registrar resultados y límites en un recibo propio; actualizar este checklist
  únicamente con evidencia de implementación y validación.

## Fuentes y documentos relacionados

Análisis upstream sobre commit
[`605c63846b57e0b361a2db7f77d25e6e79b0470b`](https://github.com/CptSpaceToaster/tcgcsv/tree/605c63846b57e0b361a2db7f77d25e6e79b0470b):
[cliente](https://github.com/CptSpaceToaster/tcgcsv/blob/605c63846b57e0b361a2db7f77d25e6e79b0470b/lambda_tcgplayer_etl/tcgplayer_etl/tcgplayersdk.py),
[publicación](https://github.com/CptSpaceToaster/tcgcsv/blob/605c63846b57e0b361a2db7f77d25e6e79b0470b/lambda_tcgplayer_etl/tcgplayer_etl/main.py),
[horario](https://github.com/CptSpaceToaster/tcgcsv/blob/605c63846b57e0b361a2db7f77d25e6e79b0470b/tcgcsv_lambda_etl.tf).
Consultar de nuevo las [guías de uso](https://tcgcsv.com/docs) y
[archivos históricos](https://tcgcsv.com/faq) al implementar.

Política vigente: [precios](../../backend/docs/pricing.md),
[jobs](../../backend/docs/jobs.md), [fuentes](../data-sources.md) y
[cierre de fuente única](../evaluations/tcgcsv-single-source-2026-10-20.md).

**Siguiente verificación operativa:** observar el ciclo ampliado y comparar sus
bytes con un ciclo posterior que reutilice productos. Las casillas siguientes
conservan los criterios completos: implementación y validación operativa se
registran por separado en el informe; no se cierran criterios sin evidencia.
