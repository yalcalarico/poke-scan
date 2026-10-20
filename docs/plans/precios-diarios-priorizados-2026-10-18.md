# Plan: precios diarios de sets prioritarios

Fecha: 18/10/2026. Estado: análisis terminado; implementación pendiente.
Ejecutor previsto: GPT6 Luna, esfuerzo low (`gpt-6-luna`, `low`).

Este documento especifica una implementación futura. Su elaboración no cambia
los cronjobs, las colas ni los procesos que ya están ejecutándose.

## 1. Resultado que se busca

Actualizar diariamente los precios de una lista persistente de sets, comenzando
por diez conjuntos comerciales populares. Incorporar también los sets de las
cartas que los usuarios guardan en sus colecciones. Mantener el resto del catálogo
disponible para buscar, escanear y consultar precios bajo demanda.

El catálogo completo continúa siendo el catálogo de cartas. La lista de
actualización diaria es otro registro, mucho más pequeño. No confundirlos.

Una actualización diaria significa comprobar las cartas programadas y guardar
las cotizaciones reales recibidas. No garantiza que una fuente tenga precio para
todas las cartas, ni que publique un nuevo archivo todos los días.

## 2. Evidencia obtenida

Se hicieron consultas SQL de sólo lectura sobre `pokemon_cards` el 18/10/2026 y
se revisó el código vigente. Las cantidades son una fotografía de desarrollo.

| Medida | Resultado |
|---|---:|
| Registros en `card_sets` | 176 |
| Cartas en `cards` | 20.670 |
| Sets con asociación TCGCSV persistida | 143 |
| Sets sin asociación TCGCSV segura | 33 |
| IDs de set de la selección inicial, incluido Classic Collection | 11 |
| Cartas de esa selección | 1.801 |
| Sets distintos presentes en colecciones locales | 10 |
| Unión entre selección inicial y sets de colecciones locales | 18 IDs / 2.769 cartas |

Los 176 registros incluyen expansiones, promos y subcolecciones. No representan
el total mundial de expansiones Pokémon. La base de desarrollo tampoco es una
muestra representativa para inferir popularidad de mercado.

Al consultar la cola durante el análisis todavía había unos 20.000 trabajos
TCGdex pendientes del barrido anterior. No basta con limitar futuros encolados:
la implementación tiene que dejar esos trabajos heredados fuera del consumo
automático cuando no pertenezcan a la nueva lista.

### Cómo funciona hoy

- `ScheduledJobsService.onModuleInit()` solicita un ciclo TCGdex al iniciar.
- `backfillPricesHourly()` solicita otro cada hora, en el minuto 13.
- `pollPriceCycles()` atiende señales compartidas cada cinco segundos mediante
  `price_sync_controls`, generaciones coalescidas y leases.
- `PriceBackfillService.enqueueStale()` considera todo el catálogo. Usa un límite
  de 25.000, frescura móvil de 24 h y cooldown de 24 h para jobs completados.
- `PriceQueueService.claimNext()` ordena por disponibilidad y creación. Hoy no
  conoce la prioridad de los sets ni el origen de una solicitud.
- `PriceQueueWorker` consume esa cola y usa `ProviderRateGate`, de 2.300 ms.
  Hay reintentos internos del proveedor: el cálculo de duración no equivale a
  contar exactamente todas las solicitudes HTTP.
- TCGCSV descubre grupos cada diez minutos. Ese descubrimiento también encola
  todos los grupos asociados elegibles. Su cron diario actual es 20:30 UTC y su
  consumidor revisa la cola cada cinco segundos.
- TCGCSV conserva una reserva de 24 h por archivo/grupo, valida el build antes y
  después de descargar y no vuelve a publicar un build ya importado.
- Las fichas de cartas, las lecturas de colecciones, el portfolio y la comparación
  también pueden solicitar trabajos. Filtrar sólo el backfill sería insuficiente.
- `fetchAndStore()` devuelve el último precio conocido cuando no obtiene precio
  nuevo. Ese retorno no prueba que se haya observado una cotización nueva.
- La retención conserva detalle durante 90 días y consolida a un punto diario;
  el horizonte es 730 días. Mantener esta política.

## 3. Selección inicial recomendada

Es una selección editorial de prioridad operativa, no un ranking oficial único
de los diez sets más populares de octubre ni una medición de nuestros usuarios.
Combina demanda reciente y continuidad de ventas entre los sets disponibles.

- El informe TCGplayer de Q3, publicado el 14/10/2026, destaca 30th Celebration y
  Pitch Black entre los lanzamientos del trimestre y muestra demanda de singles
  de varias expansiones Mega Evolution. Su ranking de sets sólo compara
  lanzamientos de Q3, no todas las expansiones existentes.
  [Informe Q3 2026](https://seller.tcgplayer.com/blog/best-selling-trading-card-games-q3-2026).
- El informe de productos sellados de septiembre, publicado el 13/10/2026,
  confirma la fuerte demanda de 30th Celebration. No es un ranking de singles.
  [Productos de septiembre](https://seller.tcgplayer.com/blog/top-selling-sealed-products-september-2026).
- El ranking completo localizado de mayo respalda los otros conjuntos de la
  selección. Incluye ventas de sellado y singles por GMV, que mide dinero vendido
  y no cantidad de personas que poseen cartas.
  [Sets de mayo de 2026](https://seller.tcgplayer.com/blog/top-selling-pok%C3%A9mon-sets-right-now-05-19-2026).

| Orden operativo | Conjunto | IDs canónicos locales | Cartas |
|---:|---|---|---:|
| 1 | 30th Celebration, incluida Classic Collection | `me55`, `me55c` | 191 |
| 2 | Ascended Heroes | `me2pt5` | 295 |
| 3 | Prismatic Evolutions | `sv8pt5` | 180 |
| 4 | Scarlet & Violet—151 | `sv3pt5` | 207 |
| 5 | Phantasmal Flames | `me2` | 130 |
| 6 | Pitch Black | `me5` | 120 |
| 7 | Chaos Rising | `me4` | 122 |
| 8 | Perfect Order | `me3` | 124 |
| 9 | Destined Rivals | `sv10` | 244 |
| 10 | Mega Evolution | `me1` | 188 |

Son diez conjuntos comerciales y once IDs porque Classic Collection está
separada en la base. No inferir familias por nombres o prefijos: la única
agrupación inicial explícita es `me55` + `me55c`.

Estimaciones sin fallos, esperas adicionales ni tráfico interactivo:

- Catálogo completo: 20.670 × 2,3 s ≈ 13,2 horas de separación entre operaciones.
- Selección: 1.801 × 2,3 s ≈ 69 minutos; reduce el universo un 91,3 %.
- Selección más colecciones locales actuales: 2.769 × 2,3 s ≈ 106 minutos.
- Classic Collection no tiene mapeo TCGdex: se omiten sus llamadas con estado
  explícito de falta de soporte. Esto reduce algo el trabajo efectivo.
- TCGCSV trabaja por grupo: inicialmente once grupos, dos archivos de contenido
  por grupo cuando exista build nuevo, más manifest y descubrimiento compartidos.
  No descargar un archivo por carta ni multiplicar manifest por carta.

### Cobertura que efectivamente existe

La consulta de precios históricos TCGplayer/USD encontró:

| Fuente | Cartas seleccionadas que tuvieron precio alguna vez |
|---|---:|
| TCGdex | 1.610 / 1.801 |
| TCGCSV | 1.777 / 1.801 |
| Unión de ambas | 1.796 / 1.801 |

Esto no mide frescura actual ni garantiza disponibilidad mañana. TCGdex no tiene
cotizaciones guardadas para `me55` ni `me55c`. TCGCSV tiene 156/161 de `me55` y
30/30 de `me55c`: quedan cinco cartas de `me55` sin precio histórico en ambas.
No resolverlo inventando precios, completando con cero ni asociando identidades
por parecido. Mantener separadas las series y la referencia activa.

## 4. Decisiones cerradas de producto

1. **Universo diario:** sets habilitados en el registro, inicialmente la tabla
   anterior más los sets ya presentes en colecciones persistidas.
2. **Incorporación por uso:** guardar una carta en una colección incorpora su set
   completo. Escanear sin guardar, abrir una ficha o hacer una búsqueda no
   incorpora automáticamente todo el set al mantenimiento diario.
3. **Primera carga:** un set recién incorporado solicita un primer ciclo en
   background para hoy, aunque ya haya pasado la hora del cron. La carta que el
   usuario está consultando conserva prioridad interactiva.
4. **Permanencia:** los sets incorporados quedan habilitados hasta intervención
   explícita del operador. Borrar la última carta de una colección no borra
   precios ni deshabilita automáticamente el set.
5. **Sets fuera del registro:** siguen disponibles y conservan el refresco bajo
   demanda de la carta o grupo solicitado. Eso no inicia un barrido del catálogo.
6. **Fuentes:** planificar TCGdex y TCGCSV por separado, conservando soporte,
   asociación, cooldown y errores por fuente. Una no sustituye silenciosamente
   la referencia activa de la otra.
7. **Prioridades:** solicitudes interactivas primero; luego sets curados en su
   orden 1–10; luego sets incorporados por colección o manualmente, ordenados de
   manera estable por prioridad e ID. Todos los habilitados se incluyen a diario.
8. **Día de trabajo:** UTC, igual al histórico actual. Las horas argentinas se
   muestran sólo como ayuda operativa. Un TTL móvil de 24 h no sustituye esta
   regla de calendario.
9. **Datos:** registrar cada precio real aunque repita el valor del día anterior.
   Una consulta sin cotización queda acreditada como tal, sin generar un punto
   de precio ni copiar el de ayer con fecha nueva.
10. **Popularidad:** lista inicial curada y editable, sin scraping automático de
    rankings ni algoritmo de puntuación en esta implementación.

## 5. Cronjobs y recuperación

Usar `@Cron` de NestJS y la cola persistente existente. No crear automatizaciones
de Codex, tareas de sistema, otra API ni otro proceso consumidor.

| Trabajo | Expresión UTC | Hora Argentina | Responsabilidad |
|---|---|---|---|
| `syncPriorityTcgdexDaily` | `15 3 * * *` | 00:15 | Reconciliar sets usados, crear objetivos de hoy y encolar TCGdex |
| `syncPriorityTcgcsvDaily` | `0 21 * * *` | 18:00 | Crear objetivos TCGCSV y descubrir/encolar sólo grupos habilitados |
| `resumePriorityPriceRuns` | `*/15 * * * *` | Cada 15 min | Recuperar trabajo durable pendiente de hoy; no crear otro ciclo completo |

TCGCSV informa que su contenido se actualiza alrededor de las 20:00 UTC; por eso
se propone 21:00 UTC con margen. [Horario del proveedor](https://tcgcsv.com/).
El margen no autoriza a saltarse las 24 h desde el final de una descarga.

Reglas obligatorias:

- Retirar el cron TCGdex horario de catálogo completo. Sustituir el cron TCGCSV
  diario anterior y desacoplar el descubrimiento periódico de los encolados globales.
- El tick técnico de cinco segundos puede seguir atendiendo señales y workers;
  la creación ordinaria de objetivos completos es diaria.
- Un run es único por `(provider, setId, syncDate UTC)`. Dos réplicas, dos ticks,
  dos señales manuales o un reinicio no duplican los objetivos.
- Al iniciar, reconciliar el registro y recuperar los runs de hoy que ya debían
  haber empezado según su hora. No iniciar por defecto un nuevo barrido global.
- Una incorporación nueva o una solicitud manual explícita puede iniciar hoy
  antes del horario ordinario; el cron de ese día reutiliza el mismo run.
- El resumidor revisa primero el estado local. Sólo consulta manifest TCGCSV si
  hay un run de hoy esperando feed/cooldown y ya llegó su próximo intento.
- Si la API estuvo apagada varios días, ejecutar el día actual y conservar los
  anteriores como omitidos/incompletos. No reconstruir observaciones antiguas.
- Fechar el resultado con el instante real de recepción. Una petición que cruza
  medianoche acredita el día de finalización, sin falsificar el del run anterior.
- Un feed repetido permite registrar que se comprobó la fuente. No cuenta como
  cotización nueva ni cambia `fetchedAt` de observaciones ya publicadas.
- Si el feed cambia tarde, reintentar sólo los runs pendientes con backoff. Al
  cerrar el día, distinguir `no_new_feed`, falta de mapping y fallo HTTP.

## 6. Persistencia mínima a implementar

Usar migración aditiva escrita a mano y actualizar Prisma. No ejecutar
`prisma migrate dev` contra desarrollo: preservar `pg_trgm` y sus índices GIN.
No introducir otra tecnología de colas.

### A. `PriceSyncSet` → `price_sync_sets`

- `setId`: PK/FK a `CardSet`.
- `enabled`: boolean, default true.
- `priority`: entero positivo; curados 1–10, incorporados por colección 100,
  manuales 100 por omisión.
- `origin`: valores cerrados `curated`, `collection`, `manual`.
- `activatedAt`, `lastDemandAt` nullable, `createdAt`, `updatedAt`.

La migración crea estructura, no presupone que el catálogo ya esté cargado.
Implementar `ensureCuratedSeed()` en el servicio de registro: inserta sólo los
once IDs curados que existan, con `ON CONFLICT DO NOTHING`. Ejecutarlo al iniciar
antes de planificar objetivos y exponerlo también en la CLI para setup. Después
ejecutar por separado la reconciliación de colecciones. No mezclar esta consulta
dinámica con el array estático de sets curados.

Seed idempotente por ID canónico. Validar que cada ID exista; ante uno ausente,
informar cuál y dejar el sistema acotado, sin recurrir a todo el catálogo.
No sobrescribir una deshabilitación o prioridad que el operador ya haya guardado.
Un registro vacío significa cero mantenimiento automático, nunca «todos».

### B. `PriceSyncSetDay` → `price_sync_set_days`

- PK compuesta `(provider, setId, syncDate)`; `syncDate` como `DATE` UTC.
- Estado cerrado: `pending`, `running`, `waiting_feed`, `waiting_cooldown`,
  `completed`, `partial`, `blocked_mapping`, `no_new_feed`, `failed`, `missed`.
- `expectedCards`, `nextAttemptAt`, `startedAt`, `finishedAt`, `lastError` sanitizado.
- `feedPublishedAt` nullable para informar qué build se importó o comprobó.
- `sourceCheckedAt` nullable: comprobación del manifest, distinta de publicación.
- `createdAt`, `updatedAt`.

Es evidencia de que el cron creó y atendió un objetivo; `lastHandledAt` del
planificador por sí solo sólo demuestra que se atendió una señal.

Resolver el estado desde los objetivos locales: `completed` cuando todos tengan
cotización; `partial` si se terminó el recorrido con ausencia de precio,
asociación o algunos fallos; `blocked_mapping` si el set entero carece de soporte;
`failed` si el recorrido no pudo resolver ninguna carta por fallos técnicos.
No repetir automáticamente hoy los resultados terminales `no_quote`,
`unsupported` o `unmapped`. Para TCGCSV, mantener `waiting_feed` hasta terminar
el día si no hay build nuevo; al vencerlo, cerrar como `no_new_feed`, sin filas
de precio ni consultas de contenido fingidas. `missed` identifica un objetivo
que no llegó a ejecutarse, no una cotización ausente de la fuente.

### C. `PriceSyncCardDay` → `price_sync_card_days`

- PK `(provider, cardId, syncDate)`.
- `setId` explícito, FK a `CardSet`, y FK `cardId` a `Card`.
  Insertarlo desde `cards.setId`, nunca desde input libre; validar pertenencia
  en la misma operación que crea el objetivo. No agregar otra unicidad en `cards`.
- Estado cerrado: `pending`, `processing`, `quoted`, `no_quote`, `unsupported`,
  `unmapped`, `no_new_feed`, `failed`, `missed`.
- `checkedAt` nullable, `quoteCount`, `attempts`, `lastError` sanitizado.
- Índice por `(provider, setId, syncDate, status)`.
- `createdAt`, `updatedAt`.

La planificación inserta objetivos `pending` por lote. El resultado del proveedor
actualiza ese objetivo y los precios reales en la misma transacción local.
Un refresco interactivo real también acredita su día: si ya hubo consulta terminal
hoy, el cron no repite el HTTP. Una lectura de caché no acredita una nueva consulta.
Los reintentos fallidos actualizan el objetivo existente; no crean otros.

Implementar un único camino interno con resultado tipado y transacción, por
ejemplo `fetchAndStoreWithOutcome()`. El worker y los caminos directos existentes
(`refresh()`, `refreshThrottled()`, `refreshMany()` y admin) deben usarlo. Mantener
`fetchAndStore()` como wrapper compatible si sus consumidores necesitan el array
actual. No acreditar sólo en el worker ni realizar dos HTTP para obtener el
resultado: una cotización manual real también evita el duplicado automático de
hoy. Las acciones explícitas existentes conservan su política de refresco;
la deduplicación diaria limita los ciclos automáticos.

El estado `quoted` exige al menos un `market` no nulo de TCGplayer/USD; cero es un
precio válido. Conservar además todas las variantes reales que el proveedor ya
guardaba. Una respuesta de fallback no cuenta como `quoted` nuevo.

TCGCSV acredita como `unmapped` las cartas locales no asociables y como
`no_quote` las asociadas cuyo precio sea nulo. Si todo el set carece de asociación,
el run queda `blocked_mapping`, sin fingir consultas carta por carta.
Al cerrar un día sin build nuevo, los objetivos de cartas todavía pendientes
quedan `no_new_feed`, con `checkedAt=null`: la comprobación real ocurrió en el
manifest y se acredita mediante `PriceSyncSetDay.sourceCheckedAt`. No sobrescribir
objetivos `quoted` del mismo día: si el build ya se recibió hoy, esos resultados
reales satisfacen el run sin volver a publicar ni declarar ausencia de feed.

No imponer unicidad diaria a `card_prices`: puede haber varias variantes y
observaciones reales dentro de un día. La unicidad corresponde al objetivo
automático, no a la tabla histórica de precios.

### D. Extensiones de las dos colas existentes

Añadir a `PriceRefreshJob` y `TcgcsvGroupJob`:

- `origin`: `legacy`, `daily`, `interactive`; default de migración `legacy`.
- `syncDate`: `DATE` nullable para el objetivo diario.
- Índices necesarios para reclamar por origen, día, estado y disponibilidad;
  verificar el plan de consulta con el volumen real.

Reglas del upsert:

- `interactive` promueve prioridad aunque el job ya esté pendiente; no adelanta
  backoff, no borra un lock y no reinicia un intento en curso.
- Un encolado diario puede adjuntar el día a un job interactivo sin quitarle su
  prioridad. No crear otra fila para la misma carta/grupo.
- Reprogramar un job terminado para otro día reinicia sus intentos una sola vez.
  Los ticks de recuperación del mismo día no reinician los cinco intentos.
- Revisar cada productor SQL directo, especialmente
  `CollectionPriceRefreshService`: no alcanza con cambiar `queue.enqueue()`.

## 7. Transición de la cola masiva actual

No borrar filas de cola, observaciones ni corridas para reducir el backlog.

1. La migración marca los trabajos existentes como `legacy`: su procedencia no
   puede deducirse de forma fiable a posteriori.
2. Los jobs `processing` al activar la versión terminan normalmente. Conservar
   recuperación de abandonados, leases, timestamps y backoffs.
3. La planificación promueve por lote los pendientes heredados de los sets
   habilitados al objetivo de hoy, sin resetear estados en curso.
4. Los heredados de sets no habilitados quedan conservados y diferidos. El
   consumidor no los reclama automáticamente.
5. Una nueva solicitud real de usuario puede promover cualquiera de esos jobs a
   `interactive`, conservando su `availableAt` y el resto de garantías.
6. El claim diario sólo admite objetivos del día actual y sets habilitados. El
   interactivo funciona para cualquier set. Aplicar también este filtro a TCGCSV.
7. El reporte muestra `legacy_deferred` por separado: no presentar esos 20.000
   pendientes conservados como trabajo diario que el sistema todavía deba hacer.

En la primera activación, acreditar por SQL local las observaciones reales
TCGplayer/USD que ya se recibieron hoy para sets habilitados. Usar `card_prices`
y la procedencia/build de TCGCSV para poblar objetivos ya resueltos; no descargar
otra vez el build de hoy sólo porque las tablas de control son nuevas. No usar
`completedAt` legacy para inventar una consulta con precio o sin precio: el job
puede haber terminado devolviendo fallback o por falta de mapping.

No se puede prometer conservar una prioridad interactiva histórica que no fue
registrada. Se preservan las filas y las colecciones actuales; una nueva señal
del usuario vuelve a activar el trabajo concreto.

## 8. Incorporación de sets y manejo operativo

Crear `PriceSyncRegistryService` con operaciones locales para consultar el
registro, habilitar por colección, habilitar manualmente y deshabilitar.

- Integrar la incorporación después de confirmar `CollectionsService.addItem`,
  cubriendo tanto el camino normal como el idempotente. Una avería del recupero
  opcional no debe convertir una carta ya guardada en un error para el usuario.
- El handler únicamente escribe la señal local. No llama fuentes externas ni
  espera a que termine el set. Reutilizar la señal durable del planificador.
- El reconciliador diario incorpora sets presentes en `collection_items` con un
  único `INSERT … SELECT DISTINCT … ON CONFLICT`, sin consultas por usuario.
  Esto recupera una señal post-guardado perdida e incluye las colecciones previas.
- No degradar `origin=curated` cuando uno de esos sets aparezca en una colección.
- Una deshabilitación explícita se conserva: el reconciliador no vuelve a
  habilitarla. El refresco de una carta individual sigue siendo posible.
- Eliminar la última carta de un set no modifica automáticamente el registro.

Agregar una CLI local bajo pnpm, sin endpoint público nuevo:

```text
pnpm run prices:sets -- list
pnpm run prices:sets -- add --set=swsh7 --priority=100
pnpm run prices:sets -- disable --set=swsh7
```

Validar IDs, existencia, prioridad entera positiva y opciones desconocidas.
El alta manual solicita el primer ciclo de hoy; no crea otro consumidor.
`prices:sync` mantiene su nombre, pero su alcance pasa a ser el registro habilitado.
No añadir una opción implícita o por omisión de «todos los sets».

## 9. Fuentes, fallos e histórico

- Mantener el gate compartido TCGdex y el ritmo compartido de TCGCSV. No paralelizar
  veinte cartas ni crear un reloj nuevo para los cronjobs.
- Conservar validación de identidad, rollback atómico de TCGCSV y la unicidad
  `(provider, groupId, feedPublishedAt)` de las publicaciones.
- No volver a descargar un archivo TCGCSV dentro de su reserva durable de 24 h.
  El run puede esperar hasta `availableAt`, aunque haya cambiado el día UTC.
- No convertir un set sin mapping en un error HTTP con cinco reintentos por carta.
  Declarar la limitación por fuente; `me55c` es un caso conocido en TCGdex.
- Para TCGdex con mapping pero sin cotizaciones, comprobar una vez por día y
  registrar `no_quote`. No deshabilitar `me55` por su ausencia actual de precios:
  puede empezar a tenerlos más adelante.
- No reciclar el filtro móvil de 24 h del backfill como regla del cron diario:
  una consulta a las 03:16 de ayer no debe hacer perder el cron de hoy a las 03:15.
  Mantener el TTL existente de lectura/caché para la UI.
- Respuestas 429 deben producir espera visible por proveedor. Propagar status y
  `Retry-After` con un error tipado; no analizar strings de mensajes. Si falta
  `Retry-After`, usar 15 minutos. Guardar `blockedUntil` nullable en
  `provider_rate_limits`; tomar el máximo ante dos respuestas concurrentes.
  Durante la espera no reclamar nuevos jobs de esa fuente. Un job tomado antes
  de conocer la pausa se libera conservando backoff; no se duerme 15 minutos con
  un lease de trabajo reclamado. Un intento que no llegó a HTTP no consume un
  intento de proveedor. El cliente TCGdex no debe reintentar inmediatamente un
  429 dentro de su bucle interno antes de propagar esta pausa.
- Mantener los reintentos acotados existentes para red/5xx. El resumidor no
  resucita indefinidamente los fallos agotados del mismo día. El día siguiente
  puede comenzar un nuevo ciclo, respetando cualquier pausa todavía vigente.
- Preservar `fetchedAt`, `feedPublishedAt`, proveedor, moneda y variante. No copiar
  ayer, interpolar, rellenar con cero ni atribuir al feed una fecha que no informa.
- No cambiar la gráfica ni la política de referencia activa en este lote. La
  gráfica recibirá los nuevos puntos reales del histórico existente.

## 10. Estado y evidencia para el operador

Extender `prices:status` y su JSON con:

- Fecha UTC del ciclo, registro habilitado y número de sets/cartas objetivo.
- Por proveedor y set: estado, última comprobación, último precio recibido,
  build TCGCSV, próximo intento y error sanitizado.
- Objetivos consultados con precio, sin cotización, sin mapping, no asociados,
  pendientes, en proceso y fallidos. Informar aparte las observaciones por variante.
- Pausa por rate limit y `blockedUntil` cuando corresponda.
- Trabajos heredados diferidos y trabajos interactivos separados del ciclo diario.
- Última creación de run, última actividad del worker y última finalización real.
  Un heartbeat de planificador no debe mostrarse como ejecución de proveedor.
- Estimación de drenaje calculada sobre cartas elegibles actuales, con aclaración
  de que los reintentos, pausas y tráfico interactivo pueden ampliarla.

No devolver emails, IDs de usuario ni detalles privados de colecciones.
Al finalizar sin precio para parte del set, mostrar cobertura parcial; no «100 %
de precios actualizados» sólo porque todos los jobs alcanzaron `completed`.

## 11. Archivos y orden de implementación para Luna low

Leer primero `AGENTS.md`, `docs/orquestacion-codex.md`,
`backend/docs/jobs.md`, `backend/docs/pricing.md` y `backend/docs/testing.md`.
Conservar todos los cambios locales ajenos. No reset, stash, commit, upgrade ni
despliegue. No implementar tareas pendientes de otros planes.

Dividir la ejecución low en cuatro hitos secuenciales, con checkpoint breve de
archivos, decisiones y focales al cerrar cada uno. No intentar resolverlos como
un único cambio sin verificar. Mantener una sola implementación y DB/Redis/tests/
build/runtime serializados. Ningún hito aislado habilita la migración en desarrollo:
la activación operativa espera que los cuatro estén integrados y validados.

1. **Persistencia y registro.** `backend/prisma/schema.prisma`, migración nueva,
   `backend/src/jobs/price-sync-registry.service.ts` y seed curado explícito.
   Incluir las extensiones de origen/día y `blockedUntil` del contrato anterior.
   Aceptación focal: seed repetido, set inválido, lista vacía, registro de
   colecciones separado del seed y deshabilitación conservada. No cambiar aún
   los consumidores ni ejecutar fuentes reales.
2. **TCGdex diario y uso de colecciones.** Nuevo
   `backend/src/jobs/price-sync-daily.service.ts`, `price-backfill.service.ts`,
   `sync-prices.service.ts`, `price-queue.service.ts`, `price-queue.worker.ts`,
   `provider-rate.gate.ts`, `scheduled-jobs.service.ts`, `jobs.module.ts`,
   `collections.service.ts` y `collection-price-refresh.service.ts`, con sus
   módulos si requieren inyección. Implementar calendario UTC, resultado real,
   transacción de precios/evidencia, origen, prioridad y legacy. La consulta
   diaria usa objetivos del registro; el backfill global deja de ser el camino
   automático. Cubrir también los caminos directos de `refreshMany()`.
   Para la pausa tipada usar `backend/src/common/errors/provider-rate-limit.error.ts`
   y `backend/src/modules/providers/tcgdex.provider.ts`; conservar la causa al
   envolver errores en `PriceFetchError`, sin dependencia circular con Jobs.
   Aceptación focal: día UTC, dos réplicas, transición legacy, guardado normal e
   idempotente, fallback/no_quote, pausa por fuente y reintentos del mismo día.
3. **TCGCSV diario y acotado.** `tcgcsv.service.ts`, `tcgcsv.client.ts`,
   `card-comparison.service.ts` y coordinación diaria común: separar descubrir
   identidades de encolar contenido, seleccionar por registro y conservar
   solicitudes interactivas. Aplicar el cron de 21:00 UTC, resultados por carta,
   espera de feed/cooldown y pausa tipada de la fuente. Preservar pins y
   asociaciones. Aceptación focal: sólo grupos seleccionados, repetición de
   build, 24 h, feed tardío/sin cambios, estados de mapping y 429 compartido.
4. **Operación, integración y cierre.** `backend/scripts/prices-control.mjs`,
   `prices-sync.mjs`, nueva CLI de sets, manifiestos backend/raíz y
   `scripts/help.mjs`. Actualizar docs de jobs/precios/base/operación y env de
   ejemplo sólo si se agrega una variable necesaria. Completar el reporte de
   progreso real. Ejecutar las aceptaciones restantes, `pnpm run check` estándar
   y flujo aislado. Preparar respaldo/transición operativa sin descargar todo el
   catálogo como prueba.

No cambiar respuestas públicas: este plan sólo requiere CLI e internos. No
agregar endpoints para habilitar sets, otra cola, paneles frontend ni un marco
genérico de scheduling. Si aparece una dependencia que exige esas ampliaciones,
registrarla como pendiente y conservar el hito verificable.

Los flags actuales siguen vigentes: `ENABLE_PRICE_BACKFILL_CRON` gobierna ahora
la programación TCGdex diaria, `PRICE_QUEUE_ENABLED` su consumidor y
`ENABLE_TCGCSV_INGESTION` la fuente TCGCSV. Un flag apagado no se ignora por
arranque, CLI, incorporación de set ni recuperación. No hace falta una pantalla
de administración ni nuevos endpoints para completar este trabajo.

## 12. Pruebas de aceptación obligatorias

Usar fixtures y reloj controlado. Parar el stack antes de tests como exige
AGENTS.md. Usar DB clonada y Redis propios para el flujo con impacto de datos;
no drenar colas de desarrollo ni compartir consumidores con los specs.

1. Seed repetido: once IDs iniciales, diez prioridades y ninguna duplicación.
   En una fixture con catálogo actual, 1.801 cartas; fuera de ella calcular desde
   la base, sin fijar esa cifra como un límite permanente del código.
2. Lista vacía: cero jobs diarios TCGdex/TCGCSV; nunca fallback a catálogo entero.
3. Dos réplicas y dos disparos: un objetivo por proveedor/set/día y uno por carta/día.
4. Horarios: comprobar ambos `@Cron`, zona UTC y correspondencia argentina.
5. Frontera diaria: ayer 03:16/hoy 03:15 sí consulta; segunda señal de hoy no repite.
6. Arranque después de la hora: recupera hoy. Arranque antes: espera el horario,
   salvo primera carga o pedido manual explícito. No rellena días perdidos.
7. Cotización idéntica a ayer: se guarda observación real de hoy. Cero válido se
   guarda; `market=null`, fallback y ausencia de mapping no son precio nuevo.
8. Guardar carta fuera del top diez: incorpora su set completo una sola vez,
   incluso en camino idempotente. Abrir, buscar o escanear sin guardar no lo hace.
9. Señal post-guardado fallida: la carta se conserva y el reconciliador diario
   incorpora el set. Las colecciones preexistentes también se cubren.
10. Deshabilitado manualmente: el reconciliador no lo reactiva. Interactivo sigue
    permitiendo consultar la carta. Ningún histórico se elimina.
11. Backlog legacy de miles de cartas: sólo se promueven sets habilitados; el resto
    queda diferido. El primer claim no cae en un set ajeno por su antigüedad.
12. Solicitud interactiva sobre un legacy pendiente: obtiene prioridad conservando
    backoff y lock. Un daily no degrada esa prioridad ni reinicia intentos en curso.
13. Agotar cinco intentos hoy: un tick no reinicia otros cinco. Mañana puede
    reprogramarse con el cooldown de proveedor todavía respetado.
14. TCGCSV: once grupos iniciales; repetir manifest/build no duplica publicaciones;
    el descubrimiento no encola los otros grupos del catálogo.
15. TCGCSV: mismo archivo dentro de 24 h queda esperando; build tardío vuelve a
    revisarse sólo cuando corresponde. Falta de mapping, `unmapped` y `no_quote`
    producen estados distintos. `me55c` no genera llamadas TCGdex inventadas.
16. 429 en cada fuente: `Retry-After` numérico y fecha HTTP, fallback 15 min,
    pausa durable tras reinicio, dos instancias, sin HTTP durante la pausa y sin
    consumo de intentos cuando no se envió una solicitud.
17. Crash después de publicar y antes de confirmar cola: al recuperar, la evidencia
    diaria/build publicado evita repetir automáticamente el trabajo confirmado.
18. Una petición que cruza medianoche: el resultado y su evidencia corresponden a
    la fecha real de finalización; el run anterior no recibe un precio ficticio.
19. CLI y JSON: alcance, progreso, diferidos y pausa correctos; sin datos privados.
20. Flags apagados: ningún mecanismo alternativo inicia trabajo de esa fuente.

Después de las focales, ejecutar una vez `pnpm run stop` y `pnpm run check` al
cierre del lote. No repetir suites verdes sin cambios. Probar el flujo real con
stack aislado y proveedor simulado: sembrar top diez, guardar carta de un set
adicional, avanzar el reloj, ejecutar ambos cronjobs y consultar estado/histórico.
Registrar conteos, cuotas, timestamps y cleanup, sin capturas de pantalla.

Aplicar la migración a desarrollo sólo después de respaldo y validación aislada;
verificar tablas e índices GIN. No iniciar automáticamente otra descarga del
catálogo completo para demostrar este trabajo. La activación final sólo puede
consumir el registro habilitado.

## 13. Límites y entrega

No incluye frontend nuevo, cambios de scanner, nuevas fuentes, rankings
automáticos, actualización diaria de metadatos del catálogo, reconstrucción del
pasado, alteración del proveedor activo, acortamiento de retención, servicios
externos ni despliegue. El catálogo semanal sigue siendo independiente.

Los cronjobs Nest requieren una API permanentemente encendida. Si la computadora
se duerme no se ejecutan: la recuperación atiende el día actual al volver. No
afirmar garantía diaria de producción sin un backend con disponibilidad continua.

Entrega esperada del ejecutor: archivos cambiados, registro habilitado final,
cronjobs activos con zona horaria, pendientes/diferidos por fuente, pruebas y
check con resultados, evidencia del flujo aislado y limitaciones reales de
mapping/cotización. No declarar cobertura completa a partir del número de jobs.

Instrucción para iniciar la implementación en otro turno: «Implementá este plan
en el orden indicado usando GPT6 Luna low. Respetá sus límites y los de AGENTS.md;
no amplíes el alcance ni empieces por descargar precios del catálogo entero».
