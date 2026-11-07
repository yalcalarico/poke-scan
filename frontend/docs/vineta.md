# Viñeta: una sola aplicación

La dirección elegida es `design/vitrina-variantes/03-vitrina-comic.html`. Se adapta a componentes reales: no hay HTML de maqueta embebido, segunda aplicación ni selector de versión.

## Qué cambia

| Parte | Implementación |
|---|---|
| Tinta y tramas | CSS Module existente de la capa visual; bordes con `--text-primary`, superficies `--warning-soft`/`--info-soft`, radios y sombras del sistema |
| Inicio | [Home fiel a Viñeta](home-vineta.md): abanico, galería real, compartir, [vitrina personal](showcase.md), portafolio y [objetivos](goals.md) |
| Colecciones | Listado y detalle reales conservados; objetivos accesibles en cada álbum |
| Cuenta | [Datos y clave](account-controls.md), con sesiones reales y sin billing ficticio |
| Accesibilidad | Temas claro/oscuro, foco visible, reduced-motion y forced-colors |

## Buscar fiel al diseño

`/buscar` reproduce `searchView()` de Viñeta: trama de 8 px, área de 1280 px,
guía de 200 px separada por 32 px y campo de hasta 480 px. Paneles con borde de
tinta de 2 px y filtros en dos columnas, también en móvil; la guía se oculta a
700 px. Comparte tipografía system-ui 15/22 y espaciado de Inicio, sin modificarlo.
La carga conserva el mismo encabezado, guía, tarjetas y columnas.

El campo «Buscar por nombre» está dentro de la tarjeta de filtros, junto con set,
orden y sentido. No se muestra búsqueda por colección ni un aviso de indisponibilidad.
«Más opciones» es otra tarjeta debajo de «Explorar con intención», con los modos
nombre/número/artista y las rarezas siempre visibles. En escritorio los modos se
apilan y las etiquetas largas se ajustan al ancho de la tarjeta. En móvil sólo se
oculta la guía: las opciones quedan después de los filtros y antes de los resultados.
«Ver objetivos» lleva a Colecciones, donde vive cada objetivo.
Con texto, el backend ordena por relevancia: orden y sentido quedan deshabilitados.
Sin texto se conservan nombre, precio, rareza y número. «Limpiar filtros» conserva la búsqueda;
«Limpiar búsqueda» vacía sólo el texto. Los chips permiten quitar set y rareza.
Los resultados conservan sus acciones previas de limpieza completa.

Cada resultado muestra el precio abajo a la derecha, junto al set y fuera de la
imagen; nombre y rareza siguen a la izquierda. Usa `Money` con la moneda elegida
y `marketPriceUsd` de la misma respuesta de búsqueda, sin requests por carta.
Si falta, muestra exactamente `--` con nombre accesible «Sin precio»; cero sí se
formatea. Es una referencia local TCGCSV: el máximo de las últimas cotizaciones
market por variante, no el valor de una copia del inventario. Este tratamiento
es optativo de Buscar: no cambia Inicio ni los guiones de otras tarjetas.

## Ficha editorial

`/carta/[id]` adapta `detail()` con un único encabezado «Ficha editorial», nombre,
set, número y rareza reales, y «Volver» al catálogo validado de origen. Comparte
la trama de 8 px, ancho de 1280 px y tipografía de Buscar. Debajo del separador de
2 px hay dos columnas iguales con gap de 24 px; a 700 px pasan a una sola.
La imagen animada, de hasta 300 px y sin recortar el halo, queda dentro del panel
izquierdo con el logo del set también visible en móvil.

A la derecha siguen la referencia real y su historial, «Elegí dónde guardarla»
con las acciones existentes y todos los datos de la carta, incluido el símbolo
del set. No hay selector de colección ficticio ni cifras o textos de muestra.
Se conservan inclinación, holo, pausa, movimiento reducido y las cartas
relacionadas. La carga usa el mismo marco y anuncia que está cargando.

## Recorrido de escaneo

`/escanear` adapta `scan()` sin trasladar sus acciones de muestra: encabezado
editorial, retorno al inicio, escenario oscuro con dibujo local y columnas de
hasta 960 px/gap 32 px; una columna a 700 px. El dibujo indica explícitamente
que la cámara está apagada. La tarjeta abstracta Rayo / Estudio visual no es
identidad reconocida, inventario ni cotización. Cámara sólo en teléfono, subida
y búsqueda conservan sus acciones reales. Capturá / Revisá / Guardá acompañan
el recorrido sin reemplazar la revisión y organización existentes.

La carga comparte el marco; galería ocupada/error usa la foto real y su estado.
La cámara fullscreen queda deliberadamente afuera para conservar guía y controles.
Diagnóstico y avisos se mantienen debajo del panel, sin modificar reconocimiento,
precios ni guardado. Ver [escáner](scanner.md) para capacidades y límites.

## Colecciones: álbumes primero

El listado usa el encabezado «Coleccioná a tu manera.» y portadas con cartas reales
de cada álbum. La grilla aparece antes del valor y el historial: esas funciones
siguen disponibles, pero ya no compiten con la entrada a las colecciones.
Se conservan creación, búsqueda, orden y accesos a objetivos y progreso por set.

El detalle conserva sus filtros, edición, selección, paginación, exportación y
compartir. Las cartas quedan a la izquierda; objetivos, valor e intención de
intercambio se agrupan a la derecha y se apilan en móvil. Tener repetidas no las
publica ni las marca automáticamente para intercambio. No se copian los filtros,
etiquetas ni participantes ficticios de la maqueta.

## Ajustes: composición de Viñeta

La identidad de la cuenta ocupa el ancho superior. Debajo, la columna izquierda
reúne perfil/seguridad y colecciones; la derecha reúne PRO, privacidad y
preferencias/cuenta. Tema, moneda, enlaces compartidos, cierre de sesión y
eliminación conservan los componentes y flujos existentes.

PRO y las políticas mantienen su indisponibilidad real: sus detalles no simulan
facturación, consentimiento ni publicación. No se agrega el checkbox de privacidad
de la demo; la visibilidad se administra con los enlaces compartidos reales.
Los datos personales siguen detrás de `RequireAuth`, sin cambiar sus permisos.

## Movimiento

`AppVisualsProvider` conserva una sola fuente de estado para pausa manual y preferencia del sistema. El botón «Pausar efectos» está en el chrome mobile y en la navegación desktop; no agrega un sexto destino. Con movimiento reducido del sistema, el control informa esa preferencia y no la anula.

La pausa también frena inclinación, FLIP y cifras animadas, no sólo CSS. Al pausar se muestra el contenido final: no se congela un título invisible a mitad de entrada. Pestaña oculta y cartas fuera del viewport conservan sus límites anteriores. No se modifica captura ni reconocimiento de cámara.

## Límites honestos

Los precios siguen siendo referencias locales TCGCSV; ninguna pantalla descarga proveedores. Falta de precio no equivale a cero. Los objetivos no inventan progreso. Las políticas y PRO sólo muestran su indisponibilidad real; no hay términos aceptados, planes o pagos simulados.

## Verificación

Antes de suites, detener runtime propio con `pnpm run stop` y serializar DB/Redis/builds. `pnpm run check` es el gate completo. Pruebas focales de pausa: `pnpm --dir frontend exec vitest run components/visual-preview/motion-control.test.tsx components/visual-preview/visual-preview.test.tsx components/visual-preview/effects.test.tsx components/visual-preview/holo-card.test.tsx`.

La validación de controles en jsdom no acredita layout, contraste renderizado, cámara física ni Safari. Navegador se verifica con el runner aislado documentado en [testing](testing.md), sin capturas ni trazas por defecto.
