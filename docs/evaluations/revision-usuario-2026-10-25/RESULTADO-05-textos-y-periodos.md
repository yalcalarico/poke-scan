# Seguimiento — textos compartidos y escala temporal

26/10/2026. Corrección directa por root, sin nuevas delegaciones. El presupuesto
del hito anterior permanece consumido; no se presenta esta corrección como un
quinto encargo a subagente.

## Evidencia posterior del usuario

El usuario siguió viendo párrafos técnicos completos en «Tu portafolio», la
cabecera «Mi colección» y la ficha de un ítem: evaluación con milisegundos UTC,
conteos de frescura, fechas de consulta, API, fuente y aclaraciones de condición.
El cambio inicial de REV-03 había cubierto solamente `CollectionCard`.

También informó que cambiar el período no cambiaba la escala de las gráficas.
No adjuntó una nueva imagen o video; se conserva este reporte textual como E08.

## Cambios y causa

- `ValuationMetadata` mantiene la cobertura breve visible y deja fechas/recencia
  bajo «Ver detalles del valor», cerrado por defecto, también en el resumen público.
- `PriceReferenceDetails` deja los párrafos técnicos bajo «Ver referencia del
  precio». La conversión a ARS también se consulta a demanda. Se retiraron las
  aclaraciones repetidas sobre la condición de las cifras y de los ítems.
- Los paneles de historial también pliegan sus detalles de fuente/evaluación.
  No se eliminaron datos de la API ni se cambiaron precios, variantes o cantidades.
- `Sparkline` y `ComparisonChart` antes usaban el primer y último punto para
  llenar el ancho. Dos períodos con el mismo poco historial se veían iguales.
  Ahora reciben un rango temporal explícito: toda la ventana seleccionada,
  inclusive, anclada al día UTC de evaluación. Portafolio, historial de carta y
  colección usan esa ventana. El eje Y sigue ajustándose a los importes presentes.
  No se agregan puntos ni líneas para días sin datos.

Los componentes son compartidos entre web y PWA; no existe una edición web separada.

## Verificación

- `pnpm run stop` antes de las suites.
- Suite focal de evidencias, detalle de ítem, portafolio, panel y chart: **32/32**.
  Incluye comprobar visibilidad cerrada y apertura de los detalles, cabecera de
  colección y cambio de coordenadas con exactamente los mismos dos puntos.
- `pnpm --dir frontend run test`: **631/631**, 82 archivos, salida 0.
- `pnpm --dir frontend run build`: salida 0, TypeScript y 17 páginas generadas.
- Lint y tipos de ambos proyectos terminaron antes de los tests en las dos
  corridas del gate estándar; no se detectaron errores de esos pasos.

**Gate integral pendiente, no se declara en verde:** se ejecutó `pnpm run check`
dos veces. La primera falló con cuatro casos del nuevo
`tcgcsv-common-batch.integration.spec.ts` a partir de un timeout de 5 s. Esa suite,
ejecutada sola sin API, pasó sus cinco pruebas. La segunda corrida pasó TCGCSV
pero falló por un timeout de 5 s en `share.service.spec.ts`, caso `getPublic devuelve
items y stats, y NO filtra datos privados del usuario`. Ambas corridas aprobaron
56/57 archivos backend. No se modificaron backend ni timeouts para enmascararlo;
la causa de la variabilidad no está confirmada. No se repitió una tercera vez.

## Comprobación web y runtime

Se restableció `pnpm run dev` en Herdr `w2:p7`; web
`http://localhost:3000/colecciones` y API `http://localhost:3001/api/health`
respondieron 200. Se dejaron ambos procesos activos, sin cambiar las pausas de ingesta.

En Safari de escritorio, sin capturas, se comprobó por accesibilidad:

- Portafolio y cabecera de colección: valor y cobertura visibles, «Ver detalles
  del valor» cerrado; no se exponen los timestamps del agregado.
- Detalle de Team Rocket's Hypnotizer: copias, mercado y total visibles;
  «Ver referencia del precio» cerrado, sin el párrafo de condición repetido.
  Se cerró el sheet sin guardar cambios.
- Ficha de Abra: período 30 días con eje 27/09–26/10; al seleccionar 7 días,
  eje 20/10–26/10. También cambiaron los límites de importes según los datos presentes.

No cambió el flujo de datos ni se usaron colecciones reales como fixtures. La
comprobación del navegador fue de lectura, sin altas/ediciones/bajas de inventario.
Safari de escritorio no acredita corrección de los síntomas de Safari/iPhone
REV-02/07, que siguen pendientes.
