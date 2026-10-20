# UX-02 — Compartir con control de visibilidad

Fecha: 2026-10-07 · Estado: especificación aceptada por coordinación para BE-01 / FE-02 · DEC-02: propuesta resuelta para implementar.

## Decisión de producto

Un enlace comparte una colección elegida o todas las colecciones del dueño. La persona que lo abre ve una página de solo lectura, sin cuenta. Crear el enlace debe mostrar antes de confirmar una vista previa fiel de los campos públicos y explicar que cualquiera con el link puede verlos. No existe en el contrato una opción “solo intercambio”; queda para una variante posterior.

El link público usa como título el nombre de la colección (o “Todas las colecciones”) y muestra el nombre público del dueño. No se agrega descripción editable ni persistencia nueva al núcleo de BE-01/FE-02. Una descripción pública escrita por el dueño puede evaluarse luego como opción independiente; nunca se deriva de notas privadas.

## Matriz de visibilidad

| Campo | Enlace y preview | Reglas |
|---|---:|---|
| Título | Sí | Nombre de la colección elegida; “Todas las colecciones” si abarca todas. |
| Descripción pública | No en esta entrega | Posible opción posterior, con consentimiento explícito; nunca se rellena con notas. |
| Nombre visible del dueño | Sí | El `displayName` público vigente. No email ni datos de sesión. |
| Carta y edición | Sí | Nombre, set/serie, número, rareza, artista e imágenes necesarias para identificarla. Excluir IDs internos de item/colección y datos de usuario. |
| Variante, condición, cantidad | Sí | Son atributos relevantes para identificar las copias compartidas; mostrarlos como valores explícitos por grupo. No inferir condición de una imagen. |
| Referencia de precio | Sí | Precio de mercado disponible para la variante, moneda USD, proveedor/fecha de consulta si vienen en el dato. Rotular como referencia, no precio de venta. Sin precio se muestra “Sin referencia”. No mostrar ARS en esta página. |
| Notas privadas | **No** | Excluir del DTO público y de metadata, HTML, logs de medición y caché de frontend. La preview indica “Tus notas privadas no se comparten”. |
| Estado “para intercambio” | No en esta versión | No habilitar filtro ni modo de intercambio en creación inicial. El alcance acordado no agrega esa variante. |
| IDs internos de item, colección y usuario, email, credenciales | **No** | Excluir identificadores de registros y datos de sesión que no necesita la vista pública. |
| IDs públicos del catálogo (`cardId`, `setId`) | Según necesidad | Se pueden incluir si hacen falta para resolver imágenes, fichas o enlaces del catálogo; no son IDs de inventario/propietario. |
| Fecha de alta y campos de gestión interna | **No** | No forman parte de la presentación pública. |

La allowlist del contrato debe ser un DTO público propio, no la reutilización directa de `CollectionItemDto`: hoy ese DTO incluye `notes`, `collectionId`, `id`, `isForTrade` y `addedAt`.

## Crear y previsualizar

Usar el `Sheet` existente de creación en Ajustes, con sus `Field`, `Select`, `Alert` y `Button`. Mantener el orden: alcance (todas / una colección), título derivado, vencimiento y preview; acción primaria “Crear enlace”. En 390 px el contenido puede desplazarse dentro de la hoja, el footer conserva acciones accesibles y el foco no queda tapado. En desktop se conserva el mismo flujo y ancho legible. Ambos temas usan tokens del design system.

La preview refleja el alcance seleccionado y enseña una fila representativa con carta, edición, variante, condición, cantidad y precio si existe; debajo, título derivado y resumen. Debe separar con texto visible “Se comparte” / “No se comparte”, incluir “Tus notas privadas no se comparten” y señalar “Cualquiera con el enlace puede verlo”. No presentar un preview de una carta como inventario completo. Antes de crear, dejar claro si el enlace vence y cuándo; opciones actuales: nunca, 7, 30, 90 o 365 días. “Nunca” requiere informar que el link seguirá activo hasta desactivarlo o revocarlo.

El control de alcance conserva las opciones vigentes: “Todas mis colecciones” y una colección. El caso sin colecciones conserva la conducta actual de compartir todas (vacío); preview explica que hoy no hay cartas y el enlace podrá reflejar contenido que se agregue luego, salvo que BE-01 determine que el alcance queda materializado al crear. Esa semántica de snapshot vs colección dinámica es una incertidumbre técnica que debe quedar explícita y confirmada por BE-01; el código actual consulta los items al abrir el link, lo que indica una vista dinámica.

## Lista pública, cantidades y totales

Para más de 500 grupos de items, conservar el tope actual: no construir paginación en esta entrega. El orden actual (más recientes primero, desempate por ID) define cuáles son los primeros 500; la UI dice exactamente “Se muestran 500 de N grupos de cartas. El resumen corresponde a toda la colección.” No usar “primeras 500 cartas” porque cada grupo puede representar varias copias. Para hasta 500, indicar el total de grupos mostrados. La lista no simula que el usuario puede cargar más.

Todos los totales se calculan sobre el alcance completo, antes del límite visual, para colección individual o conjunto de colecciones. No reutilizar `stats` calculadas sobre la muestra truncada. Mantener semánticas inequívocas:

- **Copias** (`totalCards`): suma de `quantity` de todos los grupos.
- **Cartas únicas** (`uniqueCards`): cantidad de `cardId` distintos en todo el alcance.
- **Grupos con duplicadas** (`duplicateCards`): grupos/item con `quantity > 1`, siguiendo la semántica existente; rotularlo así para no confundir con cantidad de copias excedentes.
- **Sets**: cantidad de sets distintos.
- **Valor de referencia USD**: suma de `quantity × market` para grupos con precio disponible de la variante. Acompañar con cobertura: grupos con referencia de un total de grupos; si hay faltantes, rotular “parcial” e indicar cuántos grupos no tienen precio. No convertir desconocido en cero ni sugerir precio realizable local.

El encabezado público conserva título, dueño y fecha del enlace; el resumen distingue grupos visibles de copias totales. En colección vacía, mostrar estado vacío sin grilla, con cero copias/únicas/sets y valor USD 0 solo porque el conjunto está vacío. Si hay cartas pero todas sin precio, el valor es desconocido (`—`), no USD 0.

## Vigencia, revocación y cachés

La creación ofrece vencimiento opcional. El dueño puede activar/desactivar el link; según el modelo actual, desactivar y revocar escriben `isActive=false`, y un link desactivado puede reactivarse. La UI conserva esa semántica y no presenta revocación como terminal ni irreversible: la distinción durable requeriría una decisión posterior. El estado muestra la fecha exacta de vencimiento (zona local al presentar) o “Sin vencimiento”. El visitante recibe un único estado no disponible para slug inexistente, vencido o inactivo, con copy actual: “Este enlace no está disponible. Puede haber sido revocado, haber vencido, o el link puede estar incompleto. Pedile a quien lo compartió que te mande uno nuevo.” No revelar al visitante cuál de las causas ocurrió.

La página y su metadata solo pueden consultar el enlace si sigue activo y no venció. Una nueva solicitud de origen después de confirmar vencimiento, desactivación o revocación no debe entregar datos protegidos aunque Redis o la caché de Next estén calientes. Hoy Redis cachea el payload por 5 minutos antes de buscar/verificar el enlace; Next revalida a 60 segundos, y `generateMetadata` y página comparten el fetch mediante `cache()` de React. Invalidar Redis no purga por sí solo la Data Cache de Next ni páginas ya abiertas. BE-01/FE-02 deben documentar y verificar conjuntamente una estrategia compatible con este objetivo (validar vigencia antes de responder caché, TTL acotado al vencimiento e invalidación/lectura de Next que no conserve payload sensible tras revocar). No afirmar revocación inmediata si queda una caché intermedia con respuesta exitosa.

La página compartida y metadata mantienen `robots: noindex, nofollow`; los slugs no se agregan al sitemap. Título/descripción/Open Graph no pueden contener notas, email ni datos privados. No persistir payload para offline por defecto. El service worker y caché HTTP/CDN de la ruta deben revisarse antes de declarar que una consulta nueva no puede reutilizar contenido viejo.

Desactivar el link impide nuevas consultas elegibles al servidor una vez resueltas las cachés. No borra copias que otra persona ya descargó, guardó, capturó en pantalla o que quedaron en una notificación/vista previa externa. El texto de confirmación lo aclara brevemente: “El enlace dejará de abrirse; no podemos borrar capturas ni copias que ya guardaron otras personas.” La preview previa al compartir ayuda a evitar sorpresas; no promete retractar contenido.

## Estados y copy

| Estado | Presentación y acción |
|---|---|
| Alcance vacío | En preview: “Esta colección todavía no tiene cartas.” En público: estado vacío existente. Totales en cero por colección vacía. |
| Colección con cartas sin precios | Cartas visibles; cada precio dice “Sin referencia”. Total de valor `—` si no hay ningún precio; mostrar cobertura. |
| Más de 500 grupos | Banner informativo de truncamiento con N total de grupos, máximo visible 500 y aviso de que los agregados corresponden al alcance completo. |
| Slug inexistente / enlace inválido | Mismo estado no disponible que el vigente; acción “Pedile a quien lo compartió que te mande uno nuevo” y salida a catálogo. |
| Expirado o revocado | Mismo estado público que inválido, sin filtrar motivo. No servir metadata específica del enlace. |
| Error de red del servidor | Error recuperable existente “No pudimos cargar esta colección”; permitir volver a intentar mediante recarga del navegador y ofrecer catálogo. No tratarlo como vencimiento. |
| Desactivado | Desde Ajustes, chip/estado y explicación de que el dueño puede reactivarlo. Público recibe no disponible. |
| Inactivo/desactivado | Desde Ajustes, indicar que el enlace está apagado y se puede volver a activar. Público recibe no disponible. El backend actualmente no distingue revocación de desactivación. |
| Carga de creación/lista | Skeleton y acción con estado pendiente accesible; conservar error junto al formulario si falla. |

Mensajes de estado usan `Alert`, `EmptyState`, `ErrorState`, `Badge` y `Surface` existentes. Acciones tienen área táctil de 44 px, foco visible, texto además de color, nombres accesibles y funcionamiento con teclado. Conservar el `PlainShell` de `/share/[slug]`, sin navegación privada del dueño.

## Evidencia inspeccionada

- `backend/src/modules/share/share.service.ts`: 500 items + 1 para detectar truncamiento; cache Redis 5 min consultada antes de verificar link; stats agregadas sobre DTOs de los items recortados; revocación/desactivación invalida solo Redis.
- `backend/src/modules/collections/collections.service.ts`: el `CollectionItemDto` privado incluye `notes`; definición de cantidades/valor; valor es cantidad por precio de variante.
- `backend/src/modules/share/dto/create-share.dto.ts` y `backend/docs/api.md` § Compartir: scope actual por `collectionId` o todas, vencimiento 1–365 días; respuesta pública reutiliza DTO de colección.
- `frontend/components/share/share-link-creator.tsx`, `share-link-card.tsx` y `share-links-section.tsx`: Sheet de creación, alcance y vencimientos actuales; acciones de activar/desactivar/revocar; estados y textos actuales.
- `frontend/app/share/[slug]/page.tsx`, `not-found.tsx`, `layout.tsx` y `frontend/components/share/public-collection-view.tsx`: fetch compartido por metadata/página, Next revalidate 60 s, noindex/nofollow, página de solo lectura, resumen actual y alerta de 500.
- `frontend/docs/design-system.md`: tokens semánticos, temas claro/oscuro, mobile-first 390 px y controles 44 px. Se reutilizan primitivas existentes; no se propone reemplazar el sistema visual.

## Criterios verificables para BE-01 / FE-02

1. El DTO público tiene allowlist y una prueba con `notes` poblada demuestra que notas, email, tokens, IDs internos de item/colección/usuario y campos privados no aparecen en JSON, HTML ni metadata. Los IDs públicos del catálogo se permiten si la vista los necesita.
2. Preview para todas/una colección coincide con el alcance del enlace e identifica título derivado, carta, edición, variante, condición, cantidad y valor/ausencia; avisa que cualquiera con link lo ve y que notas no se comparten.
3. Dataset de 501+ grupos: lista devuelve/presenta máximo 500; totales cuentan todos los grupos y copias; UI expresa cantidades exactas visibles vs alcance total. Prueba con múltiples grupos de la misma carta verifica cartas únicas, grupos duplicados y suma `quantity × market`.
4. Casos de precio parcial y ausente no presentan cero como desconocido; la cobertura y el denominador se entienden por grupos de items.
5. Una colección vacía muestra estado vacío. Una colección poblada con todo precio desconocido muestra valor `—`. Un slug inválido, vencido o revocado muestra el estado común sin metadata que identifique la causa.
6. Con Redis y caché Next calientes, confirmar vencimiento, desactivación y revocación evita que una nueva carga de origen reciba payload o metadata protegida. Verificar además navegación cliente, service worker y cualquier caché HTTP/CDN configurada.
7. Página/metadata preservan `noindex,nofollow`, fuera del sitemap; inspección de la preview externa y de Open Graph confirma que solo incluye datos permitidos.
8. El dueño entiende vencimiento, que el enlace inactivo puede reactivarse y el límite de retractación antes de confirmar. La vista funciona a 390 px y desktop, en ambos temas, con teclado, lector de pantalla, foco visible y objetivos táctiles conformes al design system.

## Incertidumbres técnicas para resolver en implementación

- El contrato público lo define BE-01; si cambia, BE-01 actualiza el espejo de tipos del frontend en la misma entrega. FE-02 consume ese contrato y no define cambios de schema. Descripción pública editable queda como opción posterior, fuera del núcleo.
- Confirmar si el enlace a todas las colecciones incluye futuras colecciones/items. La implementación actual parece dinámica porque carga items al consultar el link; especificarlo y cubrirlo.
- El modelo actual no diferencia desactivación y revocación: ambas usan `isActive=false`, y PATCH permite volver a activar. La UI representa esa conducta vigente; una distinción terminal durable queda como propuesta posterior, sin ser requisito para asegurar privacidad/vigencia.
- Acordar la invalidación o bypass de Data Cache Next y cachés de hosting/PWA para el objetivo de vigencia. `cache()` de React solo deduplica dentro del render, no resuelve por sí misma la frescura entre solicitudes.
- Calcular los totales completos requerirá separar agregación del listado limitado; cuidar que precio total y cobertura respeten la variante y los datos disponibles sin disparar solicitudes a proveedores externos desde la ruta pública.

## Revisión de coordinación

Aceptada el 7/10 después de corregir scope: descripción editable y distinción terminal durable quedan fuera del núcleo; IDs públicos del catálogo permitidos si son necesarios. Allowlist, totales completos, límite visible y vigencia con dos cachés son entradas para BE-01/FE-02. Implementación y pruebas reales siguen pendientes.
