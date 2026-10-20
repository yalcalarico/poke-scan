# UX-01 — Revisión e inventario del lote

Fecha: **2026-10-07** · Responsable: agente UI/UX · Estado: **Especificación aceptada por coordinación**.

Entregable: especificación para FE-01. DEC-01 queda **resuelto para implementar en interacción y continuidad**; el mecanismo para confirmar una escritura incierta sigue siendo entrada de BE-02. No se implementó interfaz, no se ejecutaron escrituras y no se realizaron entrevistas ni pruebas en dispositivos.

**Encargo inmediato FE-01:** conservar captura automática; pedir revisión de carta, variante y condición explícitas; agrupar por esos tres campos; separar copias conservando `runId`; persistir el draft en `sessionStorage` sin fotos; guardar únicamente filas completas y retirar solo partes confirmadas. Reenviar o confirmar un intento incierto queda pendiente de BE-02.

Referencia: HEAD `5a2fe2f557b677b2c6e38749a1932d24a21b25c5` más el árbol de trabajo local leído el 7/10. Hay cambios locales previos en la página y revisión del escáner; esta lectura no representa exclusivamente ese commit.

## Entradas y evidencia

- [DEC-01](../10-decisiones-y-contratos.md): identidad carta + variante + condición, trazabilidad de lecturas, continuidad y guardado incierto.
- [Protocolo vigente RES-02](../../../evaluations/scanner-validation-protocol.md): DINOv2 top-8, propuesta automática sin rechazo calibrado; fotos y corpus nuevo pendientes. El protocolo permite preparar este flujo sin esperar nuevas capturas.
- [Escáner actual](../../../../frontend/docs/scanner.md) y [página](<../../../../frontend/app/(app)/escanear/page.tsx>): cada captura tiene `runId`; confirmar otra candidata reemplaza la lectura. La revisión en memoria permite comparación; recargar pierde las fotos.
- [OrganizeSheet](../../../../frontend/components/scanner/organize-sheet.tsx): hoy agrupa por `cardId`, edita cantidad y destino, muestra Normal/Near Mint y envía únicamente `cardId` y `quantity`. El draft de la hoja vive en estado React.
- [Storage](../../../../frontend/components/scanner/session-storage.ts): array de lecturas en `pcs.scanSession`, `sessionStorage`, máximo 30; actualmente conserva las más nuevas si se excede el límite. No existe persistencia del draft completo.
- [ScanMatchSheet](../../../../frontend/components/scanner/scan-match-sheet.tsx): comparación y alternativas disponibles; su búsqueda manual actual navega a `/buscar` y no establece un retorno que reemplace un `runId`.
- [Cliente de colecciones](../../../../frontend/lib/api/collections.ts), [DTO](../../../../backend/src/modules/collections/dto/add-item.dto.ts) y [service](../../../../backend/src/modules/collections/collections.service.ts): ya admiten variante, condición y cantidad 1–999. Agregar suma copias; no alcanza bloquear dos clicks para confirmar que un POST cuya respuesta se perdió no escribió.
- [Design system](../../../../frontend/docs/design-system.md), [guía](../../../../frontend/docs/build-guide.md), [labels](../../../../frontend/lib/variants.ts) y skill [frontend-ios-elegante](/Users/ysmaelalcalarico/.codex/skills/frontend-ios-elegante/SKILL.md): una app, primitivas existentes, ambos temas, foco, targets de 44 px y copy rioplatense. Se leyó la descripción conservada de referencias visuales; no se afirma haber inspeccionado capturas originales.

## Decisiones de interacción

1. **Conservar captura automática y propuesta a sesión.** No cambiar DINOv2, umbrales o encuadre. Verde informa estabilidad del encuadre. El candidato automático lleva estado textual «Propuesta por revisar» hasta confirmar nombre, set y número; similitud no se presenta como probabilidad de acierto.
2. **Guardar exige identidad revisada, variante y condición elegidas.** Los nuevos atributos comienzan como `null` en el draft, con «Elegí una variante» y «Elegí una condición». No se preseleccionan Normal/NM ni se deduce condición de una foto. «No sé todavía» conserva `null` y deja pendiente esa fila; el DTO existente no permite guardar desconocido como condición.
3. **Una colección explícita por lote.** La colección habitual puede aparecer como sugerencia en el selector, pero el primer guardado requiere haber confirmado el destino. El destino confirmado se conserva al reabrir/recargar para la misma sesión y cuenta. Destinos por fila quedan fuera del primer FE-01; para otro destino se guarda un subconjunto, se cambia el selector y se continúa con las pendientes.
4. **Agrupar solo para presentar y guardar.** Un grupo listo tiene clave `cardId + variant + condition`. Los pendientes sin atributos pueden aparecer juntos por carta con etiqueta «Por completar»; no constituyen un grupo listo ni heredan atributos de otra copia por proximidad.
5. **Aplicar a varias copias requiere una acción explícita.** Una fila con tres lecturas permite revisar individualmente o «Aplicar a todas». Este último confirma la candidata y atributos elegidos para esas tres copias, con texto que explica el alcance. Una captura nueva entra como propuesta sin atributos, aunque su carta ya tenga un grupo completo.
6. **Separar copias antes de guardar.** «Separar copias» abre una vista interna del mismo Sheet, permite seleccionar lecturas por miniatura/número de lectura y asignar variante/condición al subconjunto. No abre dos sheets simultáneos. Al volver, grupos con la misma identidad se fusionan visualmente; grupos distintos siguen separados.
7. **Precio sin efecto sobre identidad ni elegibilidad.** Se usa la referencia de la variante elegida; sin coincidencia exacta se muestra «Sin precio para esta variante». No se toma `prices[0]` como sustituto. Condición registrada no aplica un descuento. Se puede guardar sin precio.
8. **No retirar resultados inciertos ni reenviarlos por defecto.** Se preserva el payload original y la evidencia de intento; BE-02 define la confirmación/reconciliación segura. Una acción nueva de «Sumar otra copia» no se confunde con recuperar un intento anterior.

## Modelo lógico del draft y trazabilidad

Estos nombres describen estado cliente propuesto, no un DTO nuevo ni código obligatorio. FE-01 puede elegir tipos equivalentes si conserva los invariantes.

| Campo | Semántica |
|---|---|
| `schemaVersion` | Versión explícita del nuevo draft, inicialmente 1. |
| `sessionId` | Identidad estable del lote dentro de esta pestaña; diferencia otra sesión que reutilice números de corrida. |
| `entries[]` | Lecturas originales con `runId`, candidata y estado de revisión. Un `runId` identifica una captura, no necesariamente una sola copia después de editar cantidad. |
| `allocations[]` | Partes pendientes de inventario con ID local estable, `sourceRunId`, cantidad entera, carta, variante/condición opcionales y revisión. Una lectura comienza con una parte de cantidad 1. |
| `selectedCollectionId`, `destinationConfirmed` | Destino común explícito y constancia de selección. El ID no se usa si no pertenece a las colecciones obtenidas para la cuenta actual. |
| `groups` | Vista derivada de las partes; la identidad comercial es carta + variante + condición. No usar el primer `runId` del grupo como dueño de todo el draft. |
| `operations[]` | Intentos de guardar con ID local estable, cuenta/destino del intento, lista inmutable de partes y payload exacto, estado y confirmación disponible. La clave de idempotencia de servidor, si se adopta, la acuerda BE-02. |

**Invariantes obligatorios:**

- Una lectura recién creada aporta una copia. Las partes de una misma lectura pueden dividirse entre grupos después de editar cantidad; sus cantidades se conservan durante el movimiento.
- Cada parte pertenece a un único grupo pendiente o intento bloqueado. No puede estar a la vez lista para guardar y ya enviada con resultado incierto.
- Cambiar cantidad en una fila cambia esa fila, no la lectura de otra carta. Se aceptan enteros 1–999 por POST; vacío, decimal, negativo o superior al límite se muestran como error de campo y no se convierten silenciosamente en 1.
- Si fusionar partes hace que un grupo supere 999, no recortar ni fraccionar en varios POST silenciosamente: dejarlo pendiente y pedir reducir/separar el incremento antes de guardar. FE-01 mantiene el límite del contrato existente.
- Aumentar cantidad significa que el usuario agrega copias manualmente equivalentes a la identidad de esa fila. Se indica «Incluye copias agregadas a mano». No se inventan capturas ni nuevos `runId`.
- Si hay varias lecturas, reducir cantidad por debajo de las copias ya representadas exige elegir qué partes retirar. La interfaz abre «Separar copias»; no descarta la primera o última lectura sin mostrarlo. Una reducción dentro de una parte con cantidad mayor que 1 solo modifica esa parte.
- Una parte con cantidad 3 puede separarse en 1 y 2 con IDs locales distintos y el mismo `sourceRunId`. Por eso `onSaved(runIds)` no alcanza para retirar lecturas parcialmente guardadas: FE-01 retira partes confirmadas y libera un `runId` solo cuando no quedan partes pendientes/inciertas asociadas.
- Corregir candidata afecta exclusivamente las partes pendientes vinculadas a la lectura seleccionada. Conserva cantidades y destino; invalida revisión/variante/condición si cambió `cardId`. Nunca modifica un ítem ya confirmado ni un payload incierto.
- Si la corrección debe afectar más de una lectura, se confirma «Aplicar a todas» con el listado afectado. Guardados anteriores se corrigen desde la colección; no se reescriben automáticamente.

**Ejemplo sin cambios de contrato:** un grupo listo envía `cardId`, `variant`, `condition` y `quantity` explícitos a `addItem(selectedCollectionId, payload)`. Los IDs locales y fotos no se envían como nuevos campos del DTO. Notas, graduación e intercambio quedan fuera de este flujo inicial. Si BE-02 cambia el contrato, ambos lados se actualizan juntos.

## Pantallas y componentes

### Entrada y cámara

Conservar las acciones actuales de cámara en teléfonos y galería en escritorio/tablet. La cámara sigue viva durante la consulta y pausa nuevas capturas al revisar, organizar o confirmar una salida. El aviso de sesión dice «20 lecturas pendientes» y diferencia esa cifra de «24 copias» si se editaron cantidades.

Al alcanzar 30 lecturas pendientes, pausar capturas nuevas y mostrar «Organizá estas lecturas» con acceso a Organizar. Una captura en curso que llega a ese límite no debe borrar una lectura previa: ofrecer guardar/descartar una existente o descartar expresamente la nueva propuesta. Este ajuste protege el draft editado; no aumenta el límite ni altera el reconocimiento.

### Revisar coincidencia

Reutilizar `ScanMatchSheet`: captura en memoria y carta del catálogo lado a lado, nombre, set y número visibles; alternativas top-8 y «Buscar a mano». «Confirmar carta» marca identidad revisada, sin confirmar acabado o condición. Si no hay foto tras recargar: mostrar referencia y «La foto ya no está disponible. Podés buscar la carta o volver a escanear para compararla»; no bloquear la corrección manual.

La búsqueda para corregir una lectura se resuelve como vista interna de revisión usando el catálogo y cliente existentes, con texto «Reemplazar lectura 7». Seleccionar y confirmar un resultado reemplaza ese `runId`, conserva el borrador y vuelve a Organizar. No agrega la carta directamente a la colección ni crea una nueva captura. Cancelar conserva candidata y ediciones previas. Una alternativa fuera del top-8 usa el mismo camino. Una nueva foto tomada para comparar no debe agregar otra copia de forma inadvertida: explicitar si se está reemplazando una lectura o escaneando otra.

### Revisar escaneos

Orden vertical a 390 px: título y resumen → destino → aviso de filas pendientes → filas → resumen y acciones. Una fila contiene miniatura, nombre/set/número, estado de revisión, Variante, Condición, Cantidad, precio unitario y acciones secundarias «Revisar carta», «Separar copias», «Sacar del lote».

Wireframe lógico:

```text
Revisar escaneos                            Cerrar
20 lecturas · 24 copias · 9 grupos
Colección [Mi colección ▾]                  Confirmada
2 grupos por completar · 1 resultado incierto

[Carta 63/88] Nombre · Set · 119 / 193
              Carta revisada
              Variante [Holofoil ▾]
              Condición [LP ▾]
              Cantidad [3]
              Referencia USD 12,50 / copia
              Revisar carta · Separar copias
              Sacar del lote

Valor conocido del lote: USD …
18 de 24 copias con precio de su variante
[Guardar listas]         [Seguir escaneando]
```

Las cifras y moneda del wireframe son ejemplos de composición, no datos medidos; el formato efectivo usa los helpers vigentes. El resumen cuenta grupos por identidad y copias por cantidad, no equipara lecturas con cantidad guardada.

El primario «Guardar listas» se habilita si hay por lo menos una fila con revisión, atributos y destino confirmados. Antes de enviar un subconjunto, el footer explica «Guardaremos 18 copias; 6 quedan pendientes». No enviar filas incompletas o inciertas. Si todas están listas, conservar el mismo CTA y mostrar el total exacto. Durante envío: «Guardando…» y resumen persistente de progreso, sin inventar porcentaje si no hay respuestas.

En tablet/desktop reutilizar el Sheet centrado amplio y la grilla existente de dos columnas cuando tenga ancho suficiente; cada fila conserva el mismo orden de campos. El resumen permanece en el footer, el catálogo de corrección puede distribuir búsqueda y referencia en dos zonas. La cámara no se habilita por reducir el viewport de un navegador de escritorio.

### Separar copias

Vista interna del Sheet, encabezado «Separar copias», botón «Volver al lote». Lista de lecturas/partes con `Checkbox` y nombre accesible «Seleccionar lectura 7 de Umbreon». Si una parte tiene varias copias manuales, se elige cuántas mover; la suma de origen + nuevo grupo debe ser la cantidad inicial. Campos Variante/Condición aplican exclusivamente al subconjunto. Primario «Aplicar selección». Cancelar descarta solo los cambios todavía no aplicados en esta vista.

Eliminar todo un grupo exige distinguir «Sacar 3 copias» de «Eliminar colección». Confirmación contextual dentro de la vista para grupo con varias partes o cambios editados, sin encadenar modales. El gesto de swipe tiene el mismo alcance textual y alternativa de botón visible; no debe ser la única forma de retirar.

## Continuidad y almacenamiento

**Ubicación elegida:** un estado de sesión superior a `OrganizeSheet`, compartido por revisión y organización, con persistencia versionada en `sessionStorage`. Nunca `localStorage` de respaldo, IndexedDB de fotos, Service Worker para writes ni cola offline de altas.

| Situación | Comportamiento especificado |
|---|---|
| Cerrar/reabrir Organizar | Conservar destino, cantidades, atributos, separación y revisión ya confirmada. Cerrar no guarda en colección. |
| Seguir escaneando | Conservar draft; lecturas nuevas se suman como propuestas pendientes. No heredan condición/variante. |
| Volver desde otra ruta en la misma pestaña | Restaurar draft. Capturas solo existen mientras el componente que las conserva sigue montado; no prometer comparación disponible. |
| Recargar | Restaurar entradas, partes y destino confirmado válido, sin enviar altas. Fotos, calidad de captura y ranking completo permanecen fuera del draft. Precio restaurado es referencia previa, no una consulta nueva acreditada. |
| Recargar durante `saving` | Transformar cada operación sin confirmación persistida en `uncertain`. No volver a mandar POST durante hidratación. |
| Recargar después de éxito | La confirmación del resultado y retiro de partes se persisten juntos en el snapshot cliente. Si el navegador perdió esa persistencia, el intento se presenta incierto y se aplica BE-02. Persistencia cliente no garantiza atomicidad entre navegador y servidor. |
| Storage bloqueado/lleno | Mantener estado en memoria; mostrar «El borrador dura mientras esta pantalla siga abierta». No asegurar continuidad después de recargar. |
| Datos viejos | Leer el array anterior con el validador existente; crear `sessionId` y partes de cantidad 1, sin atributos ni revisión confirmada. Destino sin confirmar. No inventar cantidades antiguas del sheet, porque no se guardaban. |
| Datos inválidos/futura versión | Validar campos/enums/cantidades. Conservar las partes válidas independientes y avisar si algunas no pudieron recuperarse. Un intento parcialmente corrupto no se degrada a alta lista: conservarlo bloqueado para revisión. No reinterpretar una versión futura. |
| Cerrar pestaña/proceso eliminado | `sessionStorage` puede perderse. Copy: «El borrador se guarda en esta pestaña». No prometer recuperación universal de una PWA cerrada por el sistema. |
| Cerrar sesión/cambiar cuenta | Las candidatas pueden conservarse como en el producto actual, pero se invalida el destino y su confirmación al cambiar de cuenta. Intentos vinculados a otra cuenta no se reenvían ni se muestran como confirmables por el nuevo usuario. Mantener el estado de intento ligado a su cuenta original; no usar datos de sesión como autorización. |
| Descartar lote | Acción explícita. Si hay operación incierta, advertir que descartar el draft no revierte un posible guardado. No borrar ítems del servidor. |

La nueva estructura guarda únicamente datos necesarios de carta/referencia, atributos, cantidades y seguimiento del intento. No incluye `image` de consulta, base64, `blob:` local, métricas de foto, emails, cookies, tokens ni notas privadas. Las imágenes de referencia del catálogo son URLs, no capturas del usuario. La migración se prepara y escribe solo después de validar el snapshot; un fallo no debe destruir la única copia legible del array anterior.

## Estados y acciones

| Estado | Mensaje/acción | Regla de continuidad |
|---|---|---|
| Cargando colecciones | Skeleton de la estructura y «Cargando colecciones». | Ediciones locales conservadas; no guardar hasta validar destino. |
| Error de lectura de colecciones | «No pudimos cargar tus colecciones. Revisá tu conexión y reintentá» + Reintentar. | Reintentar una lectura GET no implica repetir altas. |
| Sin colecciones | «Creá una colección para guardar» + Ir a colecciones. | Mantener lote y volver a confirmar destino después. |
| Lote vacío | «Escaneá una carta para armar tu lote» + Volver a escanear o Subir foto según dispositivo. | Ningún POST ni total monetario ficticio. |
| Identidad/atributos pendientes | «Revisá la carta y elegí variante y condición» + acceso al primer campo pendiente. | Se puede guardar el resto, con conteos claros. |
| Listo sin precio | «Sin precio para esta variante». | Guardado permitido; total parcial/no disponible, nunca cero por ausencia. |
| Inferencia ocupada/503 | «El escáner está ocupado. Probá de nuevo» + Reintentar captura. | No agregar lectura ni reintentar en bucle. Mantener lote existente y recorte en memoria si disponible. |
| Offline antes de enviar | «Sin conexión. Tu lote sigue pendiente». | No POST, no guardado simulado, no reenvío al reconectar sin acción. |
| Enviando | «Guardando…». | Bloquear edición/corrección/destino y acciones de la operación. Cerrar la vista puede mantener envío en su dueño de estado; no abortar y declarar fallo seguro. |
| Confirmado | «Guardamos 3 copias»; si ya existían, «Las sumamos a las que ya tenías». | Retirar exclusivamente partes confirmadas; conteo refiere al incremento solicitado, no al total devuelto del ítem. |
| Rechazo conocido sin escritura | Error de validación/destino y acción para corregir, según contrato documentado de backend. | Volver a editar solo si BE-02/contrato permite clasificar inequívocamente ese resultado. |
| Timeout/desconexión/5xx sin prueba de no escritura | «No pudimos confirmar el guardado. Puede haberse completado». Acción «Ver colección»; «Comprobar guardado» solo con mecanismo BE-02. | Estado `uncertain`, payload bloqueado. Nunca botón genérico Reintentar POST. |
| Parcial | «Guardamos 12 copias. 5 quedaron pendientes y 3 necesitan confirmar el guardado». | Éxitos retirados; pendientes seguros editables; inciertos separados. CTA guarda únicamente las listas sin intento incierto. |
| Token/cuenta vencida | «Iniciá sesión para continuar». | Mantener draft sin envíos; al volver validar cuenta y colección. Resultado de un POST ya enviado se trata con BE-02, no se supone fallido por el redirect. |

Los conteos de ejemplo en parcial se aplican a 20 copias, no a 20 grupos ni a 20 requests. Cada fila informa su estado textual e icono semántico; el color acompaña.

**Handoff obligatorio BE-02:** el cliente necesita saber qué respuestas acreditan no escritura, cómo consulta o repite de forma segura una operación cuyo resultado se perdió, qué retención aplica, y cómo distingue el mismo intento de otro incremento deliberado. Leer la cantidad actual de colección por sí sola no demuestra que esta operación escribió si hubo otra edición concurrente. Hasta recibir ese contrato, la vista puede ofrecer Ver colección y mantener el intento incierto; no puede prometer comprobación automática ni cerrar la integración de FE-01.

## Mapa de componentes y accesibilidad

| Necesidad | Reutilización / regla |
|---|---|
| Contenedor de revisión/organización | `Sheet`, `SheetHeader`, `SheetBody`, `SheetFooter`; un solo Sheet activo y subvista interna. Focus trap, Escape y retorno de foco existentes. |
| Selectores | `Field`, `Select`, opciones de `lib/variants.ts`; sin tablas nuevas de labels. |
| Cantidad y división | `Field`, `Input` con `inputMode="numeric"`; validación textual/`aria-invalid` y descripción del alcance. |
| Selección de partes | `Checkbox`; encabezados y labels identifican lectura y cantidad. |
| Búsqueda manual | Cliente de catálogo y componentes existentes; adaptar selección a reemplazar una lectura, sin editar el catálogo/algoritmo. |
| Carta y moneda | `CardThumb`/`next/image`, proporción 63/88, `ShowOrDash`/`Money`, helpers de formato y moneda. |
| Carga/error/parcial | `Skeleton`, `Alert`, `EmptyState`, `ErrorState` y `RetryButton` para lecturas seguras. |
| Éxito y estados del lote | `useToast`, `Badge`, texto persistente y resumen `aria-live="polite"`; no depender solo del toast. |
| Apariencia | Tokens `bg-surface`, `bg-surface-2`, `text-primary`, `text-secondary`, `text-tertiary`, semánticos warning/positive/negative y radios vigentes; claro/oscuro. |
| Foco | `--focus-ring` sobre superficie y `--focus-ring-on-media` sobre cámara. Aire en scroll horizontal; sin recorte del outline. |

En 390 × 844: controles de al menos 44 × 44 px, campos completos y filas apiladas; teclado/safe areas no cubren cantidad ni CTA. El footer no debe ocupar tanta altura que deje la fila inutilizable: se compacta el resumen y se conserva el scroll del cuerpo. En escritorio, mismo alcance, Tab sigue orden visual, ninguna acción depende de hover.

Revisión: los candidatos son botones con `aria-pressed` y nombre/set/número; no tabs incompletos. Cambio de subvista enfoca su encabezado, Volver devuelve foco al disparador. Error de campo enfoca el primer inválido al intentar guardar; cambio de atributo conserva foco. Éxitos de múltiples filas se anuncian mediante un resumen, evitando veinte anuncios simultáneos. `role="alert"` se reserva a errores; pendientes/éxitos usan `status`. Con movimiento reducido no es obligatorio swipe ni animación; botón Sacar del lote permanece accesible.

## Escenario verificable de 20 lecturas

Fixture lógico para FE-01/RES-03, **no ejecución ni precisión medida**. A, B… son IDs distintos válidos elegidos en el entorno de prueba; no etiquetas del corpus DINOv2.

Preparación: elegir y confirmar una colección del entorno aislado. Donde la tabla no indique otro atributo, confirmar explícitamente Normal/NM después de revisar identidad; estas elecciones son acciones del fixture, no defaults del producto.

| `runId` | Interacción | Resultado esperado |
|---|---|---|
| 1–4 | Carta A; confirmar todas. 1–2 Normal/NM, 3 Holofoil/NM, 4 Holofoil/LP. | Tres grupos, cuatro copias; ni LP ni Holo desaparecen al agrupar. |
| 5–7 | Carta B. 5–6 Reversa/MP. En 7 aumentar a 3 copias; separar 1 Reversa/MP y 2 Normal/LP. | Cinco copias, dos grupos; el origen de 7 permanece hasta confirmar sus dos partes. |
| 8–10 | Carta C. Corregir 9 a carta D desde top-8 y 10 a carta E desde búsqueda manual fuera del top-8. | Tres lecturas conservadas, tres copias; no se agregan corridas 21/22 por corrección. C no absorbe D/E. |
| 11–13 | Carta F. Confirmar Normal/HP; no hay precio para la variante. | Tres copias guardables; identidad y condición conservadas; cobertura parcial. |
| 14–16 | Carta G. Confirmar identidad pero dejar sin condición 14 y sin variante 15; 16 completo. | Solo 16 entra en el grupo listo; 14–15 quedan pendientes, sin Normal/NM implícitos. |
| 17–18 | Carta H. Confirmar atributos; 17 se retira explícitamente del lote. | Una lectura retirada y una pendiente; no borrar 18 por compartir cardId. |
| 19–20 | Carta I. Confirmar atributos; para 20 aumentar cantidad a 3. | Cuatro copias para I; distinguir lecturas 2 de copias 4. |

Balance: 20 lecturas originales, 1 retirada, 4 copias agregadas a mano → **23 copias pendientes**. Dos incompletas → **21 copias listas** antes de guardar. Esta suma se comprueba en el fixture, sin inferir cantidad de requests (depende de grupos).

Sobre ese lote:

1. Cerrar Organizar, volver a cámara y reabrir: mismos grupos, atributos, partes y 23 copias.
2. Recargar: mismas identidades/atributos confirmados y pendientes, sin fotos; búsqueda manual sigue disponible. No hay POST al montar.
3. Guardar listas: confirmar 15 copias, rechazar sin escritura 3 y perder respuesta de otras 3 con escritura simulada en entorno aislado. Balance visible: 15 confirmadas fuera del draft, 3 seguras por corregir, 3 inciertas y 2 incompletas; nunca repetir automáticamente las inciertas.
4. Incluir en éxitos solo una de las partes procedentes de `runId=7`; su otra parte sigue visible. No retirar toda la lectura hasta resolver el resto.
5. Recargar mientras 3 copias están inciertas: payload original y estado permanecen; verificación futura BE-02 no crea un incremento nuevo.
6. Una alta deliberada posterior de la misma combinación debe sumar otra copia como operación distinta. No reutilizar la identidad del intento incierto.
7. Repetir lectura/corrección y organización con teclado y lector, ambos temas, viewport 390 px y desktop; confirmar orden de foco, labels y ausencia de controles ocultos.

## Aceptación y cierre

| Criterio UX-01 | Evidencia de esta entrega | Estado |
|---|---|---|
| Flujo de 20 lecturas, varias variantes/condiciones, alternativa fuera top-8 | Fixture y balances definidos arriba; recorrido documental completo. | Especificado; ejecución FE-01 pendiente. |
| Estados en 390 px/desktop, teclado y lector | Matriz, jerarquía, controles y reglas de foco/announcements. | Especificado; prueba visual/física pendiente. |
| Primitivas/tokens actuales mapeados | Tabla vinculada a componentes y documentos leídos. | Comprobado por lectura estática. |
| Draft restaurable sin capturas | Modelo, migración y matriz de continuidad. | Resuelto para implementar; no storage nuevo ejecutado. |
| Parcial e incierto con acciones concretas | Estados separados, payload bloqueado y handoff BE-02. | UX especificada; consistencia final pendiente de BE-02. |

La revisión documental verifica que no se pide otra API para variantes/condición, no hay OCR, no se persistieron capturas y no se diseñaron prestaciones de otras áreas. No se afirma `pnpm run check` verde: este encargo produjo únicamente este Markdown.

**Consumidores:** FE-01 recibe decisiones de identidad, formulario, continuidad, división y componentes; BE-02 recibe clasificación/confirmación de operaciones; RES-03 recibe fixture y criterios observables para usabilidad. Investigación debe verificar comprensión y fricción de confirmar atributos; ningún resultado de usuarios se presume por cerrar la especificación.

**Límites pendientes:** precisión top-1/top-8 y umbrales no evaluados aquí; corpus y dispositivos del protocolo pendientes; contrato de consistencia BE-02 por recibir. Estas entradas no impiden implementar el draft y selectores existentes, pero impiden declarar seguro un reenvío automático o cerrar FE-01 integrado.

## Revisión de coordinación

Revisada el 7/10/2026: flujo/estados, continuidad y separación de copias están definidos para FE-01. Se acepta la especificación, no una implementación ni una prueba con usuarios. BE-02 sigue pendiente para cierre del guardado incierto.
