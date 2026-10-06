# Escáner visual DINOv2

Actualizado el 2026-10-03. DINOv2 es el único método de reconocimiento. Se retiraron la lectura de texto, su comparador, el motor del navegador y los endpoints de identificación por texto.

## Flujo de uso

Para reconocer cartas hace falta iniciar sesión. Si no hay sesión, las acciones de cámara y galería llevan al login y, al entrar, vuelven a `/escanear`, sin capturar ni enviar una consulta antes.

En teléfonos, “Escanear carta” abre la cámara. El marco es rojo mientras busca una carta y verde cuando encuentra una carta estable. Entonces captura el recorte y empieza a reconocer automáticamente, sin tocar el obturador. El botón central sigue disponible como respaldo. No se muestran controles de flash ni infinito.

En escritorio y tablet no se ofrece cámara. “Subir una foto” usa el mismo reconocimiento visual. La búsqueda manual sigue disponible en todos los dispositivos.

La primera predicción DINOv2 se suma automáticamente a la sesión. En la cámara, el set de esa carta aparece arriba y la coincidencia queda en un recuadro tocable abajo. Al tocarlo se abre una comparativa del recorte enviado con la carta del catálogo y las ocho alternativas: elegí otra y confirmá para reemplazar esa lectura, sin duplicarla. La captura automática queda pausada durante la revisión. Los precios se consultan sólo para la opción confirmada, mediante el cliente y la caché existentes. Revisá nombre, set y número antes de organizar; no hay rechazo calibrado. La barra muestra miniatura, nombre, set, número y valor; si falta precio muestra “Sin precio” o un guion, sin inventarlo. “Organizar” permite elegir la colección y cantidad y guardar las cartas; la hoja actual no ofrece un selector de variante. Sumar a la sesión no equivale a persistir en una colección.

## Cámara, recorte y orientación

`components/scanner/camera-view.tsx` mantiene el video vivo durante el reconocimiento. `lib/scanner/camera.ts` calcula la misma guía para el dibujo y la captura, incluyendo el mapeo de `object-cover` al video original. La vista se ajusta al `visualViewport` de Safari (barras del navegador, teclado y zoom), bloquea el scroll mientras está abierta y lo restaura al cerrar. Se dibuja una sola guía: no queda un halo blanco después de leer. El marco ocupa el 72 % del espacio disponible en pantallas móviles pequeñas, respetando la proporción 63/88 y los controles.

La cámara entrega una foto ya recortada al marco: no vuelve a detectar bordes ni girarla. Las fotos subidas pasan por `lib/scanner/visual-photo.ts` y `preprocess.ts`: detectan el contorno, amplían el margen y orientan el recorte si el rectángulo es apaisado. El detector exige continuidad en los lados del candidato para evitar confundir el dibujo interno con toda la carta. El recorte se limita a 1400 px por lado largo y se envía en color.

`lib/scanner/auto-visual.ts` analiza una muestra local de 240 px cada 350 ms, incluyendo margen alrededor de la guía. Exige contorno vertical, tamaño y centrado compatibles y 900 ms de estabilidad. Los sondeos no usan red ni guardan fotos. No dispara durante una consulta; deja al menos 2,5 s entre capturas automáticas y evita repetir la misma carta hasta que se retire o cambie la imagen. Verde significa encuadre estable, no identidad confirmada.

La cámara solo se ofrece a navegadores de teléfonos mediante `hooks/use-mobile-camera.ts`; reducir la ventana del escritorio no la habilita. Necesita `getUserMedia`, permiso y un contexto seguro (HTTPS, salvo localhost). En la red local, seguí `docs/local-network.md`.

## Contrato y ranking

`POST /api/cards/identify-visual` requiere sesión autenticada y `SCANNER_VISUAL_ENABLED=1` en el backend. Recibe `{ image: "data:image/...;base64,..." }`: JPEG, PNG o WebP, hasta 6 MiB y 24 MP. No almacena la foto de consulta.

La API ejecuta DINOv2 con el modelo ONNX local, compara el vector de consulta con todos los vectores del índice y devuelve los ocho candidatos de mayor similitud coseno, sin ORB ni acceso a imágenes de referencia. Devuelve carta completa, similitud y posición, junto con tiempos de índice, modelo, inferencia y total. La similitud no es una probabilidad ni confirma edición o acabado.

`lib/scanner/camera-visual.ts` selecciona el candidato #1 DINOv2 y consulta `/cards/:id/prices` solo para ese ID. La falta o demora del precio no cambia la identidad. La consulta completa admite cancelación y tiene un límite de 35 s; los precios tienen un límite de 5 s. Los contadores de corrida impiden que una respuesta anterior reemplace una captura posterior.

`components/scanner/visual-diagnostics.tsx` permite revisar candidatos y tiempos después de subir una foto, sin abrir un selector. La sesión usa `sessionStorage`, conserva hasta 30 entradas y se restaura después de hidratar. Cada captura es una entrada; la persistencia definitiva la hace `OrganizeSheet`.

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

Después de una consulta de cámara o galería aparece «¿No coincidió? Guardá el recorte». Podés descargar el recorte exacto enviado (PNG/JPEG/WebP, sin recodificar) y un JSON con el mismo nombre base, origen, fecha, candidatos, versión del índice, tiempos backend y error si lo hubo. El ID correcto queda vacío (`expectedCardId: null`) para etiquetarlo después; la predicción no se convierte en ground truth.

La última captura se conserva sólo en memoria del navegador, fuera de la sesión restaurable. No se descarga automáticamente ni se guarda en el servidor, sessionStorage o localStorage. La siguiente captura la reemplaza; recargar o salir de la pantalla la pierde. Descartar la lectura/sesión también libera esa revisión. Si falló antes de preparar una imagen no hay recorte para bajar.

Abrir la revisión en cámara pausa la captura automática hasta cerrarla, para evitar reemplazar la imagen mientras se revisa. La cámara permanece abierta. Las descargas requieren acciones separadas para funcionar sin múltiples descargas automáticas en navegadores móviles. Guardá ambos archivos cuando quieras reportar una coincidencia incorrecta e indicá después el set y número reales. La descarga física en Safari/PWA queda sujeta a verificación en teléfono.

Al cerrar la cámara, la pantalla de entrada muestra un aviso con signo de exclamación y el botón para organizar las cartas pendientes; el inicio también resalta la sesión pendiente. La carta reconocida y su precio quedan en la cámara. Las fotos de galería mantienen el acceso «Revisar última foto» para corregir la coincidencia.

«Continuar» abre la revisión de escaneos: el selector superior define una colección para todo el lote. Las lecturas del mismo ID se agrupan en una fila, con cantidad inicial igual a sus capturas; escanear otra copia incrementa esa cantidad. La cantidad sigue siendo editable. En mobile, deslizar una fila a la izquierda revela «Eliminar». Desde tablet (768 px) y en PC, se muestra la papelera y el gesto queda desactivado. La papelera también aparece al recibir foco de teclado en mobile. Eliminar retira todas las lecturas de esa fila. El guardado envía un alta por carta agrupada y retira sólo las corridas confirmadas por la API. El total incluye precios conocidos y avisa si faltan valores.

Cerrar la cámara con lecturas pendientes pide confirmación. Cancelar mantiene la cámara y pausa las capturas mientras el aviso está abierto; salir conserva la sesión para organizarla después.

En Revisar escaneos, la miniatura abre la misma comparativa y selección de
candidatas que la cámara y la galería. Cada lectura conserva su recorte y ranking
sólo en memoria mientras la pantalla sigue montada. Corregirla reemplaza ese
runId y recalcula los grupos y el total, sin repetir el reconocimiento. Guardar o
retirar lecturas libera sus recortes; las fotos no se escriben en sessionStorage.
Tras recargar la página, las cartas pendientes siguen disponibles pero para
recuperar una comparativa hay que volver a escanear.
