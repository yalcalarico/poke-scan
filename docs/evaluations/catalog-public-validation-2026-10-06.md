# Orden por precio y colección pública — 6 de octubre de 2026

## Alcance

Validación contra stack y datos locales reales. GET de búsqueda y consultas SQL
read-only; no se solicitan precios por carta ni refrescos. Se mantiene la política
de orden: proveedor activo tcgdex/tcgplayer/USD, último market por variante,
máximo por carta, sin cotización al final y desempates nombre/ID ascendentes.
No se promete ese criterio cuando hay texto de búsqueda: el backend prioriza
relevancia en ese caso, como explica la UI.

Comando reproducible desde backend, con API arriba:

```sh
node --env-file-if-exists=.env scripts/catalog-price-order-smoke.mjs /tmp/catalog-price-order-report.json
```

Recorre todas las páginas de 100 cartas en ambos sentidos, dejando 750 ms entre
requests para respetar el rate limit público. Compara con el orden SQL completo,
cuenta IDs únicos y registra el límite con/sin precio. Hash del snapshot antes
y después: si cambia el catálogo/precio, el resultado queda inconcluso para un
snapshot global, en vez de declarar un fallo de orden.

## Observación de la UI

`/buscar?sort=price&direction=desc` muestra «Precio · descendente». Se observaron
120 cartas cargadas en la grilla, sin IDs repetidos; su secuencia coincidió con
las primeras 120 del orden SQL (checksum de observación `13df73cf`).
El intento automatizado de pulsar Cargar más terminó con localizador obsoleto
mientras la grilla avanzaba hasta 120 entradas; no se interpreta ese error de
herramienta como fallo de la app ni como prueba de un clic exacto por página.
La validación de paginación completa se realiza por HTTP por separado.

## Colección pública

Enlace ya existente `/share/tb7cpl5fql`, sin crear ni cambiar permisos.
Se cerró la sesión local de desarrollo desde Ajustes, se confirmó que muestra
login y se recargó el enlace. Renderizó en sólo lectura, sin acciones de agregar,
editar o eliminar. Captura visual desktop y árbol accesible coherentes:

- 34 cartas, 31 únicas, 3 duplicadas, 8 sets.
- 31 enlaces a fichas; cantidades visibles para tres cartas con dos copias.
- Valor total mostrado USD 2,30.
- Sin email, passwordHash o tokens en la respuesta pública anónima.

[Respuesta pública resumida](public-share-2026-10-06.json), obtenida sin
Authorization ni cookies. Los datos cambiaron respecto de la observación del
3/10 por el contenido actual de la colección; no se usa el conteo histórico.
No se editaron cartas, precios ni permisos. Las visitas públicas incrementan
su contador y usan caché según el comportamiento existente.

El intento de viewport 390×844 no cambió el ancho efectivo del navegador:
seguía siendo 1280 px. Se restauró el override. **No se certifica render móvil**
ni dispositivo físico con esa operación; esta observación es desktop.

## Resultado global

[Reporte completo](catalog-price-order-2026-10-06.json): estado `passed`,
396,2 segundos, 207 páginas por sentido (414 en total). Los 20.670 IDs únicos
coinciden con SQL tanto ascendente como descendente, sin páginas divergentes.
16.433 cartas tienen precio y las 4.237 restantes quedan al final en ambos
sentidos. Los hashes de orden esperado y observado coinciden; el hash del
snapshot antes/después también coincide.

No se encontró un fallo que requiera cambios en la aplicación. Se agregó el
script reproducible y se actualizó el roadmap con esta evidencia.
Mobile/PWA, red/offline y corpus/calibración siguen pendientes.

Verificación final: `pnpm run stop` → `pnpm run check`, verde con 675 pruebas
(315 backend, 7 scripts, 6 e2e y 347 frontend), lint, tipos y ambos builds.
`git diff --check` sin errores. Stack de desarrollo restaurado al terminar.
