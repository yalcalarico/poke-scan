# Escáner visual DINOv2

Revisado el 2026-10-20. DINOv2 es el único método de reconocimiento. Se retiraron la lectura de texto, su comparador, el motor del navegador y los endpoints de identificación por texto.

## Rectificación de perspectiva de galería — 6 de octubre de 2026

La preparación busca cuatro lados rectos en una miniatura de hasta 180 px.
Si forman un cuadrilátero convexo con proporción y soporte de borde suficientes,
aplica una transformación proyectiva, interpola los canales y normaliza a 63/88,
con lado mayor de hasta 1400 px. Las cartas horizontales se rotan a vertical.
Las esquinas utilizadas quedan disponibles en `normalized.quadrilateral`.

Desde el 20 de octubre también se compara ese cuadrilátero con el marco del
detector de rectángulos. Si queda contenido en él (con el margen habitual) y
ocupa como máximo el 75% de su área, se conserva el marco exterior. Esto evita
recortar y girar sólo una parte del dibujo cuando el borde completo sigue
siendo reconocible. La propuesta, su revisión y el organizador usan el total
impreso de la expansión para mostrar el número de carta.

Una foto alineada, sin cuatro lados confiables, cortada o con geometría inválida
conserva el detector/recorte anterior; si tampoco detecta un rectángulo, se usa
la imagen limitada de tamaño. La cámara ya encuadrada sigue conservando los
píxeles de su guía: no ejecuta esta detección. Los umbrales son heurísticos,
todavía requieren validar fondos, fundas y reflejos con corpus amplio.

Se verificó geometría con imágenes controladas y se compararon cinco fotos
existentes preparadas en Node: 2/5 top-1 antes, 5/5 después. No equivale a
certificar cámara física ni precisión general. Es el resultado histórico de
ese pipeline: [evidencia del 6/10](../../docs/evaluations/scanner-perspective-2026-10-06.md).
El [contraste del 20/10](../../docs/evaluations/scanner-baseline-contrast-2026-10-20.md)
con decoder nativo da 3/5 top-1 y 5/5 top-8 antes/después del último parche;
no reproduce exactamente aquel 5/5 ni demuestra la causa de la diferencia.
La [corrección del 20/10](../../docs/evaluations/scanner-crop-fix-2026-10-20.md)
acredita galería real y guardado aislado para el recorte reportado, que pasa del
puesto 563 al 3 (Luxray todavía primero), sin certificar precisión general.

## Flujo de uso

### Señales orientativas de calidad — experimental, 6 de octubre

Después de preparar una foto de galería o recibir una captura de cámara se
analiza localmente su detalle y las regiones muy claras. El análisis usa una
miniatura de hasta 256 px, varianza del Laplaciano y superficie de píxeles
casi blancos (incluida su región conectada mayor), excluyendo el borde.
Los umbrales/versiones están en `lib/scanner/capture-quality.ts`.

Si aparecen señales, se muestra «Revisá la foto · experimental» con consejos
de enfoque/luz en la revisión y, para galería, también al terminar. Son
orientativas: una carta con diseño liso o blanco puede activarlas. No impiden
reconocer, elegir ni confirmar una carta; tampoco certifican calidad cuando
no aparece un aviso. No alteran los bytes enviados a DINOv2.

Las métricas y avisos quedan en memoria con la revisión y se incluyen como
`quality` en el JSON descargado voluntariamente. No se mandan a la API ni se
guardan en la sesión persistida. La cámara continúa aunque falle la
decodificación opcional de estas métricas. La calibración con fotos reales,
la UI móvil física y los umbrales de reflejos/desenfoque siguen pendientes.

Para reconocer cartas hace falta iniciar sesión. Si no hay sesión, las acciones de cámara y galería llevan al login y, al entrar, vuelven a `/escanear`, sin capturar ni enviar una consulta antes.

En teléfonos, “Escanear carta” abre la cámara. El marco es rojo mientras busca una carta y verde cuando encuentra una carta estable. Entonces captura el recorte y empieza a reconocer automáticamente, sin tocar el obturador. El botón central sigue disponible como respaldo. No se muestran controles de flash ni infinito.

En escritorio y tablet no se ofrece cámara. “Subir una foto” usa el mismo reconocimiento visual. La búsqueda manual sigue disponible en todos los dispositivos.

La primera predicción DINOv2 se suma como propuesta por revisar. En la cámara, el set de esa carta aparece arriba y la coincidencia queda en un recuadro tocable abajo. Al tocarlo se abre una comparativa del recorte enviado con la carta del catálogo y las ocho alternativas: elegí otra y confirmá para reemplazar esa lectura, sin duplicarla. La captura automática queda pausada durante la revisión. Los precios se consultan sólo para la opción confirmada, mediante el cliente y la caché existentes. Revisá nombre, set y número antes de organizar; no hay rechazo calibrado. La barra muestra miniatura, nombre, set, número y valor; si falta precio muestra “Sin precio” o un guion, sin inventarlo. “Organizar” requiere confirmar el destino, la variante, la condición y la carta propuesta antes de guardar. Sumar a la sesión no equivale a persistir en una colección.

## Cámara, recorte y orientación

`components/scanner/camera-view.tsx` mantiene el video vivo durante el reconocimiento. `lib/scanner/camera.ts` calcula la misma guía para el dibujo y la captura, incluyendo el mapeo de `object-cover` al video original. La vista se ajusta al `visualViewport` de Safari (barras del navegador, teclado y zoom), bloquea el scroll mientras está abierta y lo restaura al cerrar. Se dibuja una sola guía: no queda un halo blanco después de leer. El marco ocupa el 72 % del espacio disponible en pantallas móviles pequeñas, respetando la proporción 63/88 y los controles.

La cámara entrega una foto ya recortada al marco: no vuelve a detectar bordes ni girarla. Las fotos subidas pasan por `lib/scanner/visual-photo.ts` y `preprocess.ts`: detectan el contorno, amplían el margen y orientan el recorte si el rectángulo es apaisado. El detector exige continuidad en los lados del candidato para evitar confundir el dibujo interno con toda la carta. El recorte se limita a 1400 px por lado largo y se envía en color.

`lib/scanner/auto-visual.ts` analiza una muestra local de 240 px cada 350 ms, incluyendo margen alrededor de la guía. Exige contorno vertical, tamaño y centrado compatibles y 900 ms de estabilidad. Los sondeos no usan red ni guardan fotos. No dispara durante una consulta; deja al menos 2,5 s entre capturas automáticas y evita repetir la misma carta hasta que se retire o cambie la imagen. Verde significa encuadre estable, no identidad confirmada.

La cámara solo se ofrece a navegadores de teléfonos mediante `hooks/use-mobile-camera.ts`; reducir la ventana del escritorio no la habilita. Necesita `getUserMedia`, permiso y un contexto seguro (HTTPS, salvo localhost). En la red local, seguí `docs/local-network.md`.

## Contrato y ranking

`POST /api/cards/identify-visual` requiere sesión autenticada y `SCANNER_VISUAL_ENABLED=1` en el backend. Recibe `{ image: "data:image/...;base64,..." }`: JPEG, PNG o WebP, hasta 6 MiB y 24 MP. No almacena la foto de consulta.

La API ejecuta DINOv2 con el modelo ONNX local, compara el vector de consulta con todos los vectores del índice y devuelve los ocho candidatos de mayor similitud coseno, sin ORB ni acceso a imágenes de referencia. Devuelve carta completa, similitud y posición, junto con tiempos de índice, modelo, inferencia y total. La similitud no es una probabilidad ni confirma edición o acabado.

`lib/scanner/camera-visual.ts` selecciona el candidato #1 DINOv2 y consulta `/cards/:id/prices` solo para ese ID. La falta o demora del precio no cambia la identidad. La consulta completa admite cancelación y tiene un límite de 35 s; los precios tienen un límite de 5 s. Los contadores de corrida impiden que una respuesta anterior reemplace una captura posterior.

La sesión usa `sessionStorage`, pausa nuevas capturas al llegar a 30 lecturas pendientes y se restaura después de hidratar. Un legado que excede ese límite se conserva completo para organizarlo sin perder lecturas. Cada captura conserva su `runId`; el draft de organización también se versiona como `pcs.scanDraft` y excluye fotos y recortes.

## Modelo e índice

Los artefactos viven en `backend/.scanner-models` y `backend/.scanner-index` por defecto. La API no descarga un modelo al atender una captura. La versión consultada, cantidad de referencias y colecciones viajan en la respuesta. El índice se relee al cambiar los archivos, así que las actualizaciones del día no requieren reiniciar la API.

Comandos desde la raíz:

```bash
pnpm run scanner:index
pnpm run scanner:sets
pnpm run scanner:index:sets
pnpm run scanner:validate
pnpm run scanner:evaluate
```

Consultá `pnpm run help` para las opciones y `docs/evaluations/visual-indexer.md` para el formato y actualización del índice. El último catálogo validado tiene 20.670 referencias en 175 carpetas. El escaneo necesita los vectores y metadata del índice, no las imágenes de referencia; las fotos de consulta no se guardan. El catálogo y precios conservan sus límites y cola existentes.

## Verificación

`pnpm run check` valida los dos proyectos. Antes de los tests backend, `pnpm run stop`: el worker de precios no debe competir con los specs. Los tests cubren selección del #1 y set, falta de precio, cámara automática, estabilidad, no duplicación, geometría del marco, orientación y preparación de galería. Probá además contra el stack real con fotos y una sesión autenticada. La cámara física de iPhone requiere una prueba en el dispositivo.

El service worker v4 elimina las cachés de las versiones anteriores. No hay motor de reconocimiento offline: reconocer cartas necesita conexión a la API.

## Descarga voluntaria para revisar errores

### Modo de prueba de una sesión

El modo de prueba es voluntario y se activa antes de capturar. Permite indicar un
set esperado como contexto del informe: no filtra candidatos ni modifica la
búsqueda de DINOv2. Las lecturas restauradas del borrador quedan fuera; no se
reconstruyen recortes ni predicciones que ya no están disponibles.

Cada lectura registrada vincula el recorte exacto enviado, la respuesta original,
las alternativas, la calidad disponible y los eventos de revisión con un UUID de
diagnóstico y su `runId`. La respuesta original se conserva aunque cambie la carta.
La búsqueda manual dentro de Organizar mantiene esa vinculación. Abrir la
comparativa, seleccionar provisionalmente o cancelar una búsqueda no confirma una
corrección: se registra la identidad elegida cuando la persona la confirma.

El informe HTML descargable incluye los recortes, el ranking, la elección humana
y la cronología, con los datos JSON incorporados. Se puede abrir sin conexión.
Separa lecturas sin revisión, propuestas confirmadas, correcciones mediante una
alternativa o búsqueda manual, descartes y fallos técnicos. La elección humana no
es una validación independiente; coincidir con el set esperado tampoco demuestra
un acierto. El informe no registra el texto de las búsquedas ni credenciales.

El informe señala por separado si la propuesta inicial y la identidad confirmada
pertenecen al set esperado. Si falta el set o no se configuró uno esperado, no
clasifica la lectura como fuera del set. Una selección manual conserva el puesto
que esa carta tenía en el ranking original, o indica que no estaba entre las
alternativas. La falta de ranking o de confirmación se muestra como información
no disponible, sin atribuirle una similitud nueva a la búsqueda manual.

Todo el diagnóstico vive en memoria, separado de `pcs.scanDraft`: no se envía al
servidor ni se guarda en almacenamiento del navegador. Guardar o descartar una
lectura conserva su evidencia diagnóstica. Finalizar congela el informe; descargar
no borra sus datos. Para iniciar otro hay que descartar explícitamente el anterior.
Recargar, salir de la pantalla o cambiar de cuenta libera el diagnóstico: descargalo
antes de salir.

El límite es de 30 lecturas o 64 MiB de recortes codificados. Al alcanzarlo se
suspende la incorporación de nuevas lecturas al diagnóstico con un aviso, sin
bloquear el escáner. Las lecturas ya registradas siguen admitiendo eventos hasta
finalizar. Las capturas posteriores quedan fuera del informe.

Finalizar queda bloqueado mientras se prepara una captura, se espera el
reconocimiento/precio o se confirma una alternativa con precios pendientes. Abrir
las opciones desde la cámara no interrumpe la consulta. Las cancelaciones dejan
la lectura en estado terminal y liberan el bloqueo; las preparaciones fallidas o
canceladas antes de producir un recorte se contabilizan por separado.

### Descarga individual existente

Después de una consulta de cámara o galería aparece «¿No coincidió? Guardá el recorte». Podés descargar el recorte exacto enviado (PNG/JPEG/WebP, sin recodificar) y un JSON con el mismo nombre base, origen, fecha, candidatos, versión del índice, tiempos backend y error si lo hubo. El ID correcto queda vacío (`expectedCardId: null`) para etiquetarlo después; la predicción no se convierte en ground truth.

La última captura se conserva sólo en memoria del navegador, fuera de la sesión restaurable. No se descarga automáticamente ni se guarda en el servidor, sessionStorage o localStorage. La siguiente captura la reemplaza; recargar o salir de la pantalla la pierde. Descartar la lectura/sesión también libera esa revisión. Si falló antes de preparar una imagen no hay recorte para bajar.

Abrir la revisión en cámara pausa la captura automática hasta cerrarla, para evitar reemplazar la imagen mientras se revisa. La cámara permanece abierta. Las descargas requieren acciones separadas para funcionar sin múltiples descargas automáticas en navegadores móviles. Guardá ambos archivos cuando quieras reportar una coincidencia incorrecta e indicá después el set y número reales. La descarga física en Safari/PWA queda sujeta a verificación en teléfono.

Al cerrar la cámara, la pantalla de entrada muestra un aviso con signo de exclamación y el botón para organizar las cartas pendientes; el inicio también resalta la sesión pendiente. La carta reconocida y su precio quedan en la cámara. Las fotos de galería mantienen el acceso «Revisar última foto» para corregir la coincidencia.

«Continuar» abre la revisión de escaneos: el selector superior exige elegir una colección vigente de la cuenta para confirmar el destino del lote. Cada lectura inicia con variante y condición sin elegir. «No sé todavía» conserva `null` y no habilita el guardado. Los grupos visibles tienen identidad carta + variante + condición; una captura nueva no hereda atributos de otra. Cada parte retiene su `runId` y se revisa individualmente. «Separar copias / aplicar a varias» abre una vista interna con selección explícita, cantidad a mover, variante y condición. Aplicar conserva la suma y permite partes distintas del mismo `runId`. «Separar una copia» conserva los atributos elegidos de esa parte y divide su cantidad en dos. Retirar una parte pide confirmación y conserva las otras partes de esa lectura.

La cantidad acepta enteros 1–999 por parte. Un input vacío, decimal, negativo o superior al límite muestra error y bloquea el grupo; no envía silenciosamente la cantidad anterior. Un grupo completo sobre 999 queda pendiente, sin recorte ni varios POST automáticos. El footer separa copias listas/pendientes y cobertura de referencia. El precio se selecciona por carta y variante exactas, admite `market=0`, muestra ausencia sin fallback singular y no aplica ajustes por condición.

El snapshot canónico `pcs.scanDraft` usa `schemaVersion: 1`, `sessionId`, `entries[]`, `ownerUserId`, `selectedCollectionId`, `destinationConfirmed`, `allocations[]`, `operations[]` y `retiredRunIds[]`. Entradas y confirmación/retiro de partes se persisten juntos en una única escritura. Las entradas son una proyección validada del catálogo/precios; no incluyen fotos, crops, ranking ni campos extra. `identityReviewed` y `selectionSource` son metadata cliente de revisión: confirmar identidad no confirma variante/condición; una selección manual no tiene similitud DINOv2 medida. Sus campos numéricos de compatibilidad son cero y no se muestran como score.

Cada operación conserva UUID, cuenta, destino, payload exacto y IDs de partes. Se persiste antes del POST, que requiere destino vigente y atributos explícitos. Un rechazo conocido de la primera solicitud sin escritura permite editar o crear una intención nueva. Red/5xx/cuerpo inválido quedan inciertos; recargar durante `saving` restaura `uncertain`. «Verificar este intento» repite manualmente la misma clave/payload. Un 409 o replay 400/401/404 conserva incertidumbre; 410 bloquea el intento y nunca genera otra clave ni repone copias. Una respuesta confirma el delta original, no la cantidad actual del ítem. No hay POST al montar ni reintento automático. Cambiar de cuenta durante el lote frena sus siguientes solicitudes; intentos ajenos no se verifican desde otra cuenta.

La clave anterior `pcs.scanSession` solo se lee para migración, sin copiar cantidades/atributos que nunca se persistieron. Los snapshots previos de esta entrega sin `entries[]` se validan con ese legado y se migran a un único snapshot al escribir. Una confirmación canónica prevalece aunque el legado todavía contenga lecturas guardadas. Se conservan `retiredRunIds` y el máximo de corrida al recargar para no reutilizar sus IDs.

Un snapshot corrupto, versión futura, payload/UUID/referencias incompletas activa protección global: conserva el string original de storage sin sobrescribirlo y bloquea todas las altas, ediciones y descarte. No interpreta evidencia ilegible como ausencia de un commit. Esa protección necesita recuperación explícita fuera del flujo de guardado; no hay botón que borre la evidencia. Storage lleno/bloqueado mantiene el draft en memoria y avisa; no inicia POST sin persistir primero su identidad. Si la confirmación local falla después del commit, conserva el intento para verificarlo con la misma clave. No hay respaldo en localStorage ni cola offline.

Cerrar la cámara con lecturas pendientes pide confirmación. Cancelar mantiene la cámara y pausa las capturas mientras el aviso está abierto; salir conserva la sesión para organizarla después.

En Revisar escaneos, la miniatura abre la misma comparativa y selección de
candidatas que la cámara y la galería. Cada lectura conserva su recorte y ranking
sólo en memoria mientras la pantalla sigue montada. Corregirla reemplaza ese
runId y recalcula los grupos y el total, sin repetir el reconocimiento. Guardar o
retirar lecturas libera sus recortes; las fotos no se escriben en sessionStorage.
Tras recargar, las cartas pendientes siguen disponibles sin foto. «Buscar carta a mano» corrige dentro del mismo Sheet, incluso fuera del top-8, conservando `runId` y cantidades y exigiendo revisar atributos nuevamente. Cancelar conserva el lote. Para recuperar la comparación física hay que volver a escanear expresamente.
