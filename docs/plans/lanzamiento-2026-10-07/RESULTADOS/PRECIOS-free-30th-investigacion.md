# Precios gratuitos — 30th: revisión y diagnóstico root

13/10/2026. Usuario delegó encuestas y corpus etiquetado a sí mismo y pidió subagente para alternativas gratuitas. Luna medio investigó, un encargo1/4/solo documento; root revisó fuentes y verificó GET públicos acotados/SQL READONLY, sin modificar producto, cotizaciones, Redis, colas o runtime. Sin cuentas, pagos, scraping masivo ni contactos. Informe del subagente conservado [íntegro](PRECIOS-free-30th-evidencia/investigacion-luna-recibida.md); las verificaciones siguientes reemplazan sus conclusiones incompletas.

## Resultado confirmado

**TCGCSV es una alternativa gratuita técnicamente viable para 30th en inglés.** [Índice público de grupos](https://tcgcsv.com/tcgplayer/3/groups)200: `24722 = ME: 30th Celebration`, `24837 = ME: 30th Celebration Classic Collection`; ambos categoríaPokémon3. No depender del grupo japonés24721 ni trasladar su precio al inglés.

[Productos24722](https://tcgcsv.com/tcgplayer/3/24722/products) y [precios24722](https://tcgcsv.com/tcgplayer/3/24722/prices)200:222productos,161con número de carta,217registros de precio conmarketnonnull;161productos numerados tienen market. Estos conteos **no prueban todavía un mapeo1:1 completo con nuestras161cartas/variantes**. [PreciosClassic24837](https://tcgcsv.com/tcgplayer/3/24837/prices)200:30registros conmarketnonnull; identidades individuales aún no comparadas. No se publicó un dump completo ni se importó el dataset.

Ejemplo exacto: Articuno018/128, producto716451, Holofoil, marketUSD0.23; Articuno132/128, producto716220, Holofoil, marketUSD6.76. Mismo nombre, distinto número/producto/precio: no unir sólo por nombre ni aplicar Holofoil a `normal`. Son referencias del snapshot, no venta local ni garantía del importe actual. [Fecha del build](https://tcgcsv.com/last-updated.txt):2026-10-12T20:05:44+0000, observada13/10UTC. [Evidencia root](PRECIOS-free-30th-evidencia/tcgcsv-verified-sample.json) conURLs/status/tamaños/SHA y muestras pequeñas.

TCGCSV [documenta](https://tcgcsv.com/docs) actualización una vez al día, consultar last-updated y sincronizar como máximo24h, UApropio y pausas100ms;>10000requests/día puede causarban. CORSrestrictivo: ingesta backend/cachepropia, no fetch desde navegador. FuenteTCGplayerUSD/marketPrice porproducto+subTypeName, sinprecio porcondición/SKU. Gratuito accesible no demuestra licencia de redistribución; revisión de términos/derechos para presentación pública/comercial sigue pendiente, sin aprobación inventada. El informe Luna cubre opciones Cardmarket/Scrydex/TCGdex con sus límites; no se abre plan pago.

## TCGdex: lo comprobado y lo incierto

[Releaseoficial](https://github.com/tcgdex/cards-database/releases/tag/v2.48.0) incorpora30th a la base de cartas. [Docsmarkets](https://tcgdex.dev/it/markets-prices) declaranTCGplayerUSDhorario-a-diario/CardmarketEURdiario y omisión cuando no haylisting. No equivale a precio para cada carta.

GET directo puntual [30th/018](https://api.tcgdex.net/v2/en/sets/30th/018)200:Articuno,localId018,set30th,pricing.tcgplayer=null ypricing.cardmarket=null; variantsnormaltrue y variantes detalladas sinproductId de marketplace. Local `me55-18` es Articuno18/en, correcto para esa muestra. [Respuesta resumida/hash](PRECIOS-free-30th-evidencia/public-card-sample.json). **Ausencia en el proveedor acreditada para una carta**, no para todoelset ni demostración de por qué falta ese listing. No se debe reemplazar null por0 ni inferir que el set todavía no existe.

El visor web no accedió a5URLs del agente y3root; error del visor no es404 del proveedor. Root usó transporteHTTPSdirecto de una carta y la rutaTCGCSVoficial `/tcgplayer/...`: las URLs anteriores del agente omitían ese namespace. No hubo retries automáticos ni barrido;6GETdirectos públicos confirmados (1TCGdex+1gruposTCGCSV+productos+2precios+lastupdated), con pausas entre archivosTCGCSV. Las lecturas documentales del visor se registran aparte y no son syncoperativo.

## Diagnóstico local sólo lectura

[Conteos](PRECIOS-free-30th-evidencia/local-price-diagnostic.json):20670cartas,16940conmarketUSDdelproveedoractivoTCGdex,0consultadas en24h; último fetchedAt2026-10-10T15:06:53.918. Esa fecha es recepción local, no timestamp del dato upstream.

`me55`→`30th`:161cartas/0precio guardado. `me55c`:30cartas/0precio/mappingnull; código explica rechazo deClassic por numeraciónambigua/repetida. No se cambió mapper.69grupos deitems totales:41conmarketexacto/28sinmarket. [Clasificación agregada](PRECIOS-free-30th-evidencia/root-additional-diagnostic.json):24de28sí tienen una cotización delcardId paraotra variante,4no tienen ningunamarketquote. No combinar precios devariantes; tampoco implica que las24 estén mal elegidas sin inspeccionar las cartas físicas. Muestra agregada de todaslascolecciones locales, no diagnóstico de un usuario individual.

Worker de precios apagado por `PRICE_QUEUE_ENABLED=false`; wrapper deinstancia posee fetch externo bloqueado ycronsfalse, según modo habitual protegido tras QA. Explica falta de nuevosrefreshes **en esta instancia**, no que fuese el motivo original de todo precio faltante.18531jobscompleted/190failed/sinpending a laconsulta, sin detallesprivados ni lastError. No se activóworker/backfill ni se retiróguard con esta investigación. Consulta inicial dehelper falló por columna `variants` inexistente; ajustada al schema y READONLYcompletó, sin mutación y sin atribuir el fallo a los precios.

## Siguiente implementación concreta

1. MantenerIDs canónicos; catálogo/local me55→TCGCSVgroup24722, me55c→24837. Verificar las161y30identidades por set, idioma, número, denominador, nombre/edición yproducto externo; ambiguas quedan sinquote. Classic requiere mapeo explícito, no traducción ciega del número.
2. AdaptadorPriceProvider propio e inactivo inicialmente, namespace`tcgcsv`, marketTCGplayerUSD, variantes exactas normalizadas; unit/finite/nonnegative/null ytimestamps separados. `card_external_ids`/setexternalIDs yparser/consumidores conownership/cachés coherentes. No activarprovider parcialmente ni mezclar los totales de distintosproveedores.
3. Ingesta acotada por grupo ybuild, cache24h/revalidateporlastupdated, UserAgent/throttle/locks/idempotencia, fixtures negativas para mismo nombre/diferente edición/variante yClassicambiguo. Un refresh fallido conserva lo último conocido sin rejuvenecer fecha upstream.
4. Antes de activarfuente/backendworker eninstanciareal, completar permisos de datos y gate técnico propio. Ensayo de datos/consumidor aislado+stop/checkexacto alcerrarlote, cleanupownership/restaurarinstancia; fuera de este encargo de investigación. No cuotas/Scrydex/cuentas adicionales por defecto.

Estado de planes20/38/18pendientes intacto. No pruebas/builds redundantes por investigacióndocumental; enlaces/hashes revisados. Beta y corpus privados los preparaelusuario; miniPC/serviciosexternos/comercial mantienengates. AutomatizaciónPAUSED/doshoras ypreviewbeta/appsolicitados intactos.
