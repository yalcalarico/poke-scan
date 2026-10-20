# BE-01 — Preflight de contrato público de compartir

Fecha: 2026-10-07 · Estado: preparación estática revisada y aceptada para implementar · Implementación y pruebas pendientes.

Este documento prepara BE-01 a partir de AGENTS.md, README.md, DEC-02, UX-02 aceptado y el código/documentación vigentes. No se ejecutaron tests, consultas a DB ni mediciones. No se modificó código. BE-02 está en curso en `collections`, Prisma y tipos; la implementación de BE-01 debe volver a inspeccionar esos archivos y coordinar sus cambios.

## Hallazgos que condicionan la implementación

- `ShareService.getPublic()` consulta Redis antes de comprobar existencia, `isActive` o `expiresAt`. Si hay hit, devuelve el payload caliente aunque el link se haya desactivado o vencido. Hoy el TTL fijo es 5 minutos y no se limita por `expiresAt`.
- El payload público usa `CollectionItemDto` de Collections, que incluye `id`, `collectionId`, `isForTrade`, `notes` y `addedAt`. `toItemDtos()` efectivamente serializa esos campos.
- `loadPublicItems()` toma 501 filas para detectar truncamiento y la salida conserva 500. `aggregateStats()` se ejecuta sobre las filas serializadas: sus agregados describen la muestra, no todo el alcance. No hay un total de grupos.
- La consulta del listado de precios es un único `DISTINCT ON` para las cartas solicitadas; sigue la política del proveedor activo. La lectura pública no necesita ni debe solicitar precios externos.
- Los links a todas las colecciones son dinámicos: la ruta vuelve a buscar los items actuales usando `collection: { userId }`. Se recomienda documentar explícitamente que también reflejan nuevas colecciones/items mientras el link siga vigente.
- El contrato de frontend se valida en runtime en `frontend/lib/api/schema.ts`; al cambiar el tipo no alcanza con editar `frontend/types/api.ts`.
- El constraint es `@@unique([collectionId, cardId, variant, condition])`: un link global puede contener dos grupos con la misma carta, variante y condición en colecciones distintas. No agruparlos ni asumir unicidad global para resolver el render.
- `CardGridEntry.card` y `CardTile.card` exigen `CardDto`. Sus campos actuales y los de `SetDto` son datos públicos del catálogo; no contienen inventario, propietario ni notas. `CardTile` lee `id`, `name`, `rarity`, `set?.name`/`setId` e imágenes. Reutilizar este contrato de catálogo con proyección explícita evita ampliar innecesariamente el cambio a primitivas compartidas.
- `formatPrice()` ya acepta `null` y devuelve `—`. El cambio de valor desconocido requiere adaptar semántica, etiquetas y metadata; no corregir una incompatibilidad inexistente del formatter.
- El service worker actual excluye `/api/s/:slug` de su allowlist de API, pero `networkFirstNavigation()` guarda cualquier navegación exitosa, incluida `/share/[slug]`, y la puede reproducir offline. FE-02 debe excluir y retirar esas entradas de navegación, además de quitar la Data Cache de Next.

## Contrato propuesto

Crear tipos públicos propios en `share.service.ts`; no reutilizar ni extender `CollectionItemDto` privado. Forma sugerida para `GET /api/s/:slug`:

```ts
interface PublicSharedItemDto {
  card: CardDto;              // catálogo público; proyección explícita existente
  variant: CardVariant;
  condition: CardCondition;
  quantity: number;
  price: PublicReferencePriceDto | null;
}

interface PublicReferencePriceDto {
  market: number | null;
  currency: string;           // USD por política de precios
  provider: string | null;
  source: string;
  fetchedAt: string;
}

interface PublicShareStatsDto {
  totalGroups: number;
  totalCards: number;         // suma de quantity en todo el alcance
  uniqueCards: number;        // cardId distintos en todo el alcance
  duplicateCards: number;     // grupos cuya quantity > 1, semántica existente
  setsCount: number;
  totalValueUsd: number | null;
  pricedGroups: number;
  cardsMissingPrice: number;  // grupos sin market, no copias
}

interface SharedCollectionDto {
  ownerDisplayName: string;
  collectionName: string;
  items: PublicSharedItemDto[]; // hasta 500 grupos, orden actual
  stats: PublicShareStatsDto;   // alcance completo
  truncated: boolean;
  sharedAt: string;
}
```

La allowlist de item no incluye item ID, collection ID, user ID, `isForTrade`, notas ni `addedAt`. `card.id`, `card.setId` y `set.id` son IDs del catálogo permitidos por UX-02 y necesarios para identidad/enlaces o el fallback del set; no son identificadores de inventario o propietario. La alternativa mínima compatible conserva `CardDto`/`SetDto` actuales: la proyección explícita `toCardDto()` contiene solo datos públicos del catálogo (identidad, atributos impresos, edición e imágenes), y `toCardDto()` del parser también devuelve una allowlist. No copiar objetos Prisma/JSON mediante spread ni ampliar automáticamente la salida pública si esos contratos incorporan campos privados a futuro. Un DTO de carta reducido sería una decisión adicional con cambios de tipos de las primitivas; no es requisito de BE-01. El precio es una referencia de mercado por variante, no precio de venta; conservar fuente/fecha para poder rotularlo. No incluir ARS.

`totalGroups` hace inequívoco el alcance de la lista. La UI puede decir “Se muestran 500 de N grupos de cartas”; para hasta 500, `items.length` coincide con `stats.totalGroups`. No agregar paginación en esta fase.

Un grupo sigue siendo una fila de `collection_items`, también en el scope global. Dos filas iguales en carta/variante/condición pero pertenecientes a distintas colecciones cuentan como dos grupos; no sumarlas en una fila ni cambiar cantidades para obtener una clave de render.

Reglas de stats: agregar antes del límite visual; `totalCards = SUM(quantity)`, `uniqueCards = COUNT(DISTINCT cardId)`, `duplicateCards = COUNT(*) FILTER (WHERE quantity > 1)`, `setsCount = COUNT(DISTINCT setId)`. Sumar `quantity × market` solo en grupos con `market` presente. `totalValueUsd` vale `0` si el alcance está vacío, `null` cuando hay grupos pero ninguno tiene precio, y el subtotal numérico si hay cobertura parcial o total. `pricedGroups + cardsMissingPrice = totalGroups`. Estas estadísticas son por grupo salvo `totalCards`; la UI debe titular `duplicateCards` como grupos con duplicadas para mantener la semántica.

Implementación de datos recomendada: query agregada única para todo el alcance, con `LEFT JOIN LATERAL` a `latestMarketPriceJoin()` usando la política de proveedor activa y variante del item. Mantener la lectura del listado en una consulta con límite 501 y una consulta de precios en lote para las hasta 500 filas visibles. No iterar haciendo consultas por carta/grupo; no llamar al proveedor externo desde `/s/:slug`. Para `collectionId` específico, el scope siempre viene del link ya resuelto; para scope global, limitar cada agregado al `userId` del link.

## Vigencia, Redis e interacción con revocación

La propuesta más fuerte y simple de auditar es consultar la vigencia en PostgreSQL en cada request pública, incluso si Redis contiene el payload. Seleccionar el link por slug y comprobar `isActive` y `expiresAt > now` antes de usar el caché. El borde es exclusivo: `expiresAt <= now` significa no disponible. Hacer que el `GET` devuelva el mismo 404 genérico para slug inexistente, inactivo, ajeno a un scope válido o vencido. Mantener `expiresAt = null` como vigencia indefinida.

Redis puede seguir acelerando el armado del payload, con TTL entero `min(300 s, max(0, floor((expiresAt - now) / 1000)))`, calculado al escribir, no con el reloj anterior al armado; sin vencimiento usar 300 s. No llamar a `setJson` si el TTL da cero: `RedisService.set()` trata cero como una escritura sin expiración. La validación por PostgreSQL sigue siendo obligatoria: limitar solo el TTL no cubre revocación/desactivación durante los cinco minutos. `PATCH` y `DELETE` deben persistir el cambio e intentar borrar la key del slug antes de responder éxito. El helper Redis actual degrada sin propagar fallos de `DEL`; por eso la garantía de vigencia debe descansar en DB aun si Redis está caído o la invalidación falla. Una lectura concurrente iniciada antes de que la revocación confirme puede terminar como request en vuelo; toda solicitud iniciada después de completar la revocación debe pasar la lectura de vigencia y recibir el estado no disponible. No declarar que borrar Redis invalida una respuesta de Next ya cacheada.

La transición de contrato también debe cubrir entradas Redis ya existentes: la key actual `share:${providerId}:${slug}` puede guardar `CollectionItemDto` privado. El tipo genérico de `getJson<T>()` no valida ni elimina esas propiedades. Preferir un namespace versionado del contrato público para lectura, escritura e invalidación; no leer la key legacy como fallback. Una alternativa válida es reproyectar/validar todo hit antes de servirlo. No requiere limpiar globalmente Redis ni migrar Prisma. Una fixture de cache legacy con notas pobladas debe demostrar que no se retorna ese JSON.

La expiración y el cache set deben evitar recrear accidentalmente un payload válido después de una revocación concurrente. Al implementar, revisar la secuencia `GET elegibilidad → lectura/armado → SET Redis` contra `PATCH/DELETE → invalidación`; una invalidación que ocurre antes de un `SET` tardío deja una key vieja. Como mínimo, cada lectura revalida elegibilidad en DB, así que esa key no autoriza servir el contenido. Para comprobar la garantía temporal, usar reloj controlable en specs y una barrera/doble de Redis o Prisma que fuerce el orden entre GET y revoke; tras completar revoke, una llamada nueva debe devolver 404 aun con Redis precalentado.

El backend debe fijar `Cache-Control: no-store` en la ruta pública con el mecanismo existente de Nest, sin cambiar el resto de la API, y verificar sus respuestas. El alcance de FE-02 es distinto: eliminar la Data Cache persistente de Next para la respuesta pública (fetch `cache: 'no-store'`/ruta dinámica equivalente), conservar `cache()` de React solo para deduplicar página y metadata dentro del mismo render, y excluir la navegación `/share/` del guardado/fallback del service worker actual, retirando entradas previas. Revisar HTTP/CDN donde existan. Conservar `robots: noindex, nofollow` en metadata disponible y no disponible y no agregar slugs al sitemap. FE-02 verifica la petición de origen desde contexto nuevo después de calentar y luego revocar; no debe afirmar borrado de páginas abiertas, capturas ni copias descargadas.

## Archivos candidatos y propietarios

Archivos BE-01 previstos (confirmar cambios de BE-02 antes de editar):

- `backend/src/modules/share/share.service.ts`: DTO público allowlist, agregación global, comprobación de vigencia previa al hit Redis, namespace público sin fallback legacy y TTL limitado al vencimiento; conservar consultas en lote y ownership existente.
- `backend/src/modules/share/share.service.spec.ts`: casos de privacidad, totales con 501+, vigencia exacta, cache caliente y revocación concurrente. Aislarlos al spec de share y fixtures propias.
- `backend/src/modules/share/public-share.controller.ts`: fijar `Cache-Control: no-store` en la ruta pública y comprobar la respuesta efectiva, incluidas excepciones si el mecanismo elegido no las cubre.
- `backend/docs/api.md` § Compartir y `backend/docs/testing.md`: documentar nueva forma del DTO, stats de alcance completo, límites y regresiones relevantes.
- `frontend/types/api.ts`: definir tipos espejo públicos propios (`PublicSharedItemDto`, `PublicReferencePriceDto`, `PublicShareStatsDto`, `SharedCollectionDto`) con `card: CardDto`; mantener `CollectionItemDto` privado y tipos de catálogo intactos. Releer el archivo tras BE-02.
- `frontend/lib/api/schema.ts`: parser allowlist dedicado para público; no delegar a `toCollectionItemDto()` ni aceptar un item si le faltan campos obligatorios. Los campos adicionales privados del JSON no se copian al resultado.
- `frontend/lib/api/share.ts`: `PublicSharedCollection` debe extender el contrato nuevo o dejar de redeclarar los campos añadidos por el endpoint.

**Handoff mínimo compatible a FE-02:** al sustituir `items: CollectionItemDto[]` y `stats: CollectionStatsDto`, `public-collection-view.tsx` debe consumir `PublicShareStatsDto`, cambiar el aviso a `items.length de stats.totalGroups` e incluir cobertura/valor desconocido según UX-02. `public-card-grid.tsx` ya tipa sus items mediante `PublicSharedCollection['items']`; eliminar la dependencia de `item.id` y omitir `CardGridEntry.key`. `CardGrid` ya usa `${entry.card.id}-${index}` como fallback local: distingue las filas repetidas entre colecciones sin agregar identificadores al DTO ni fabricar un sufijo nuevo. Es suficiente para el payload de solo lectura cuyo render solo amplía el mismo prefijo ordenado; si FE-02 agrega reemplazo/reordenamiento de datos en el mismo montaje, deberá revisar el reset de esa vista. No sustituir por carta/variante/condición, que no es única en scope global, ni fusionar filas. Mantener `card: CardDto` permite usar `CardGridEntry`/`CardTile` sin cambiar sus tipos ni completar campos ficticios. FE-02 debe presentar variante, condición, cantidad explícita (también 1) y referencia por grupo: el tile actual de colección no muestra variante/condición/precio y oculta la cantidad 1, por lo que pasar esos datos al tile sin presentación adicional no cumple UX-02. `page.tsx` debe adaptar metadata a desconocido/parcial y eliminar `next: { revalidate: 60 }`/usar fetch sin caché. `formatPrice(null)` ya devuelve `—`; no hace falta cambiar ese helper. Conservar noindex/nofollow y excluir navegación pública de la caché offline. Estos ajustes consumidores son necesarios para que compile y represente el contrato; no conservar campos privados como placeholders. BE-01 toca el espejo de tipos/parser y coordina inmediatamente esta integración FE-02 si la ruptura queda introducida antes que el consumidor. No declarar `pnpm run check` verde antes de integrar consumidor y correr los checks requeridos.

No se anticipa cambio de Prisma ni migración: las columnas necesarias ya existen (`share_links.isActive/expiresAt`, `collection_items.quantity/cardId/variant/condition`, catálogo y `card_prices`). Tampoco hace falta estado terminal durable de revocación, descripción editable o cambio de semántica de activación. La respuesta de gestión de links conserva IDs privados porque solo la recibe el dueño autenticado; la allowlist aplica a `GET /s/:slug`.

## Fixtures y casos de regresión propuestos

Usar fixtures deterministas en `share.service.spec.ts`, con precios inyectados/sembrados para el proveedor activo y `notes` con texto marcador sensible. No se ejecutaron.

1. **Allowlist pública:** un item con `notes: "SECRETO-BE01"`, IDs de item/colección/usuario, `isForTrade` y `addedAt`; serializar JSON y afirmar que no aparecen esos valores privados ni sus propiedades de inventario. No prohibir toda clave `id` recursivamente: `card.id`/`card.setId`/`set.id` sí pueden aparecer. Afirmar que precio contiene USD/market/proveedor/source/fetchedAt, sin email, y que cada objeto de item tiene exactamente las claves públicas acordadas.
2. **Alcance por grupo:** 501 grupos; retorno de 500 con el orden actual, `truncated: true`, `totalGroups: 501`; no presentar un endpoint paginado. Fixture con la misma carta repetida en dos variantes y distintas cantidades valida `uniqueCards` por cardId y duplicados por grupo. Incluir además dos colecciones del dueño con carta/variante/condición idénticas: conservar dos filas y validar el render de ambas sin IDs internos ni warning de claves duplicadas.
3. **Agregados completos:** distribuir grupos entre varias colecciones del mismo owner para link global; fixture para una colección específica. Verificar `totalCards`, sets, grupos duplicados, valor `Σ quantity×market` y cobertura de todos los grupos aunque la lista corte 500.
4. **Precio desconocido/cobertura:** alcance vacío → valor 0 y todas las cuentas en cero; grupos presentes con ningún market → valor `null`, `pricedGroups: 0`; mezcla con mercado presente y faltante → subtotal, coverage exacta y faltantes contados por grupo. Fila con `market = 0` es precio conocido, no ausente.
5. **Aislamiento del scope:** link global excluye items de otro usuario; link de colección solo incluye la colección referenciada. Un usuario ajeno no aparece en respuesta ni en query de agregación.
6. **Vigencia:** link ausente, inactivo, vencido (`expiresAt < now`), borde exacto (`expiresAt = now`) e indefinido; todos los no elegibles dan el mismo 404. Link activo con expiración futura sirve.
7. **Caché:** Redis caliente + revocación, desactivación y expiración deben volver a 404; la query de elegibilidad ocurre antes de retornar hit. El TTL almacenado queda acotado a 300 s y al tiempo restante al escribir; sin expiración queda en 300 s. Si resta menos de un segundo, no llamar a `setJson(..., 0)`. Precargar un payload legacy con notas y demostrar que no se entrega; una invalidación Redis fallida tampoco habilita el link inactivo gracias al chequeo DB.
8. **Concurrencia:** pausar una lectura después de tomar el payload Redis, completar `DELETE`/`PATCH isActive=false`, luego iniciar GET nuevo y exigir 404. Forzar también `GET elegibilidad → DELETE+DEL → SET tardío` y confirmar que el GET siguiente no entrega la entrada recreada. No prometer retractar la primera respuesta en vuelo.
9. **Cero proveedor/N+1:** mock del provider para asegurar que no se llama; verificar que el servicio usa consulta de agregado acotada y consultas de lista/precios en lote, nunca una lectura por grupo.
10. **Frontend parser fixture (coordinar FE-02):** acepta el shape público acordado con carta de catálogo; ignora claves extra como `notes`, `id` o `collectionId` y demuestra que no se copian al resultado. No rechazar un payload únicamente por extras privados: la allowlist del backend debe impedir que salgan por red. Rechazar campos públicos obligatorios faltantes/tipados incorrectamente o estadísticas inválidas; no inventar nota ni identidad como default. Una prueba unitaria del parser no reemplaza la prueba de cache/origen.

## Riesgos de compatibilidad y límites

- El cambio rompe `items: CollectionItemDto[]`: frontend debe migrar tipos, parser y consumidores en el mismo contrato. La página pública deja de poder usar `item.id`; puede reutilizar el fallback de render existente. Card/set conservan el contrato público del catálogo con proyección allowlist explícita.
- `totalValueUsd` nullable es compatible con `formatPrice()`. FE-02 debe mostrar `—` cuando no haya ninguna referencia y ajustar el copy de metadata: no afirmar “USD 0” ni un valor completo en una colección con precios desconocidos. Con cobertura parcial, rotular el valor como parcial y el denominador como grupos.
- `duplicateCards` tiene semántica heredada de número de grupos con quantity > 1; UX-02 pide presentarlo como “grupos con duplicadas”, no como copias excedentes.
- `totalGroups` resuelve el banner exacto sin pagination. El tope es de grupos, no de cantidad de copias ni de cartas únicas.
- Consultar DB una vez por request pública reduce la ventaja de un hit Redis, aunque evita confiar la vigencia al cache. Mantener esa consulta indexada por slug (`@@unique`) y pequeña; no cargar catálogo ni filas de precios al validar elegibilidad.
- Exponer estadísticas completas exige una agregación separada del listado. Implementarla sobre todos los items del dueño o colección puede ser costosa para inventarios grandes; usar agregación SQL con join lateral limitado por los items del scope y revisar plan/índices durante la implementación, sin N+1. No hay resultado de performance en este preflight.
- Un cache Next/HTTP/CDN con payload exitoso puede sobrevivir a la invalidación Redis. FE-02 debe cubrir fetch y el guardado actual de navegaciones del service worker, retirando entradas públicas anteriores; infraestructura/CDN desplegada requiere verificación aparte si existe. Un link ya abierto o datos copiados no son retractables.
- No cambiar colección dinámica a snapshot en BE-01: el comportamiento actual y UX-02 lo sustentan. Confirmarlo en API docs para que una colección vacía pueda luego reflejar cartas añadidas.

## Separación explícita de BE-01 y FE-02

BE-01 define y serializa el contrato, valida el enlace en cada request de origen, usa caché pública sin reutilizar el JSON privado legacy, limita TTL Redis, intenta invalidar Redis en los cambios privados, calcula estadísticas completas sin N+1 ni proveedor externo, actualiza el espejo frontend/parser y documenta API/tests. FE-02 actualiza metadata y componentes para allowlist, presentación por grupo, cantidad de grupos, precio desconocido/cobertura, y elimina o evita la caché persistente de Next; excluye y retira las navegaciones públicas del service worker y comprueba origen/navegación. `cache()` de React puede seguir deduplicando página y metadata en un render. Preservar noindex/nofollow y sitemap sin slugs. No afirmar que una llamada a Redis `DEL` invalida Next Data Cache.

## Referencias inspeccionadas

- `AGENTS.md`, `README.md`.
- `docs/plans/lanzamiento-2026-10-07/10-decisiones-y-contratos.md` § DEC-02.
- `docs/plans/lanzamiento-2026-10-07/RESULTADOS/UX-02-compartir.md` (aceptado; allowlist, stats globales, cache y alcance dinámico).
- `docs/plans/lanzamiento-2026-10-07/02-backend.md` § BE-01 y alcance del contrato.
- `backend/docs/api.md` § Compartir; `backend/docs/testing.md`; `backend/docs/pricing.md` (proveedor activo para valuaciones y `latestMarketPriceJoin`).
- `backend/src/modules/share/share.service.ts`, `backend/src/modules/share/public-share.controller.ts`, `backend/src/modules/share/share.service.spec.ts`, `backend/src/modules/collections/collections.service.ts`.
- `frontend/types/api.ts`, `frontend/lib/api/schema.ts`, `frontend/lib/api/share.ts`, `frontend/lib/format.ts`, `frontend/app/share/[slug]/page.tsx`, `frontend/app/sitemap.ts`, `frontend/components/share/public-collection-view.tsx`, `frontend/components/share/public-card-grid.tsx`, `frontend/components/cards/card-grid.tsx`, `frontend/components/cards/card-tile.tsx`, `frontend/components/set-progress/use-chunked-list.ts`, `frontend/public/sw.js`.
- `backend/prisma/schema.prisma` (solo lectura del constraint), `backend/src/common/sql/latest-price.ts`, `backend/src/redis/redis.service.ts`.
