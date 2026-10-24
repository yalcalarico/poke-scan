# Coherencia de referencias, variantes e historial — 20/10/2026

> Sustituido por el pedido posterior de [TCGCSV como fuente única](tcgcsv-single-source-2026-10-20.md).
> Este informe conserva la primera corrección local y su alcance limitado;
> la separación que dejaba el resumen sin precio motivó el cambio de política.

## Problema observado

`me55-92` (Umbreon ex) tiene cinco observaciones Holofoil de TCGCSV y ninguna
de TCGdex. La ficha mostraba USD 1,09 de TCGCSV, la colección devolvía precio
ausente y el historial compacto consultaba el proveedor activo sin fijar la
variante. La edición y el alta ofrecían todas las variantes canónicas.

## Cambio

- Los ítems autenticados conservan `price` para el proveedor activo y agregan
  `referencePrice` para la misma alternativa que la ficha, sólo cuando no existe
  proveedor activo para la carta. Selección en lote, variante exacta y metadata
  original. Alta, listado, duplicados y edición comparten la resolución.
- La tarjeta y el editor muestran la referencia por copia y por cantidad, con
  procedencia y aviso de exclusión del total TCGdex. Se eliminó el aviso duplicado
  de ausencia. Los totales activos, orden por precio, sets, portafolio y vistas
  públicas conservan la política de no mezclar proveedores.
- Alta y edición consultan las variantes conocidas. Una única variante se
  muestra fija; se conserva siempre la guardada y el alta prefiere la referencia
  con mercado conocido. Si no hay evidencia se conserva la selección manual.
- El historial compacto recibe proveedor y variante del precio visible. Ambos
  gráficos respetan fechas UTC y días ausentes. La comparación marca cada
  observación, agrega fechas y cantidad de observaciones por fuente; el período
  ocupa una fila completa para que sus etiquetas entren.

## Validación local

`pnpm run stop` antes de las suites. `pnpm run check` terminó con código 0:
lint, tipos, 598 pruebas backend, 6 E2E, 625 frontend, suites de scripts/operación
y ambas compilaciones. Las 35 pruebas focales también pasaron. Se corrigieron
una ruta de aserción y una opción no tipada en pruebas nuevas; se actualizó la
regresión anterior que esperaba unir días a través de un precio nulo.
Revisión independiente de sólo lectura: sin hallazgos accionables; un encargo.

Flujo real con `pnpm run dev`, cuenta y colección temporales aisladas, sin
consumidores externos durante QA: la ficha e historia devolvieron TCGCSV
Holofoil USD 1,09 y cinco observaciones; alta/listado conservaron la misma fecha,
precio activo ausente y referencia alternativa. Dos copias muestran USD 2,18.
La cobertura activa siguió contando esas copias como no cotizadas por TCGdex.

Navegador Chrome con DOM y geometría, sin capturas: 1440×1000 y 390×844,
claro/oscuro y movimiento reducido. Precio y subtotal visibles, Holofoil fija en
alta/edición, cinco puntos con fechas, períodos legibles, sin desborde horizontal
ni errores JavaScript. Cuenta temporal eliminada (cero cuentas QA remanentes).
No acredita dispositivo físico ni PWA instalada. Se restauró el arranque habitual
sin las variables temporales de aislamiento.

Evidencia: [gate](collection-price-history-fix-2026-10-20-evidence/check.json),
[navegador](collection-price-history-fix-2026-10-20-evidence/browser.json).
