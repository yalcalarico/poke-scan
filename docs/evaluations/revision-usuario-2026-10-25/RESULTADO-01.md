# Resultado 01 — Navegación y presentación

Fecha: 26/10/2026. Alcance: REV-01, REV-03, REV-02 y REV-07, en ese orden.

## Estado por tarea

| Tarea | Estado | Evidencia y límite |
|---|---|---|
| REV-01 | Implementada | `next.config.ts` ahora declara `devIndicators: false`. La guía de Next 16.3.6 instalada confirma que oculta el indicador y conserva los errores de compilación/ejecución. No hice una captura de navegador ni una comprobación manual en Safari. |
| REV-03 | Implementada | `CollectionCard` ya no muestra timestamps ni el detalle de procedencia/cobertura. Conserva cifra, cuentas, principal y acciones; informa brevemente el subtotal parcial o la falta de precios. Tests focales cubren vacío, cobertura parcial, cero real y cero copias con precio. |
| REV-02 | Pendiente de reproducción y validación física | La revisión de `BottomNav`, `ScreenContainer`, `globals.css` y `app/layout.tsx` confirmó barra fija, reserva de safe area correspondiente, `viewportFit: "cover"` y espacio inferior del contenido. No hay mediciones ni Safari/iPhone disponible para confirmar si la barra dinámica la oculta. No cambié offsets. |
| REV-07 | Pendiente de reproducción y validación física | `html` usa `touch-action: manipulation` y `overscroll-behavior-y: contain`; el viewport permite zoom hasta 5×. `Sheet` limita su cuerpo al viewport y restaura el `overflow` previo del documento al cerrarse. La revisión estática no localizó una causa concluyente del síntoma a zoom mínimo. No cambié gestos ni desactivé zoom. |

En REV-02 y REV-07, causa reportada por el usuario: confirmada como observación, no reproducida técnicamente. Sigue pendiente validar en Safari real ambas posiciones de la barra, scroll en las dos direcciones, mínimo zoom, rotación y hojas abiertas/cerradas. No se declara corregido ninguno de esos dos síntomas.

## Cambios

- [`frontend/next.config.ts`](../../../frontend/next.config.ts): oculta el indicador N de desarrollo mediante la opción soportada por la versión instalada.
- [`collection-card.tsx`](../../../frontend/components/collections/collection-card.tsx): quita metadata larga de valuación; muestra «Subtotal de cartas con precio» o «Sin cartas con precio» solo cuando corresponde; reemplaza el vacío por «Colección vacía». El monto y la cobertura siguen viniendo del DTO, sin inferir valores.
- [`collection-card.test.tsx`](../../../frontend/components/collections/__tests__/collection-card.test.tsx): agrega cobertura observable para importe vacío en cero, cobertura parcial, cero conocido y monto nulo.
- [`frontend/docs/components.md`](../../../frontend/docs/components.md): aclara dónde se presenta la metadata completa y el resumen compacto.

## Aceptación verificada

- REV-01: la propiedad es válida para Next instalado y la documentación local indica expresamente que los errores continúan visibles. No se editó CSS interno.
- REV-03: una colección vacía con agregado `0` presenta el valor conocido y el estado vacío sin párrafos técnicos; un valor parcial conserva su cifra y la identifica como subtotal; un cero real continúa siendo cero conocido; sin cartas con precio el monto permanece desconocido (`—`) y se informa esa ausencia. El resto de las acciones y el indicador de colección principal no cambiaron.
- REV-02/07: inspección de los archivos de shell y viewport citados en sus planes. Sin dispositivo físico no se puede comprobar visibilidad de pestañas ni gestos Safari; la aceptación física queda pendiente.

## Comandos y resultados

Antes de cada ejecución de tests corrí `pnpm run stop`; terminó con `puertos liberados`.

- `pnpm --dir frontend run test -- components/collections/__tests__/collection-card.test.tsx` — terminó correctamente, pero Vitest recibió el argumento como parte de su comando y ejecutó las 81 suites disponibles: 633 pruebas aprobadas.
- `pnpm run typecheck` — aprobado (`tsc --noEmit`).
- `pnpm --dir frontend run lint` — aprobado; cero errores. Quedó una advertencia existente de `@next/next/no-img-element` en `components/cards/__tests__/card-tilt.test.tsx`; los guards de colores y espacios en URLs pasaron.
- Tras agregar los casos nuevos: `pnpm run stop && pnpm --dir frontend exec vitest run components/collections/__tests__/collection-card.test.tsx` — aprobado, 1 archivo y 11 pruebas.
- `cat frontend/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/devIndicators.md` — confirma la opción `false` y que los errores de compilación/ejecución siguen reportándose.
- `git diff --check` — aprobado, sin espacios en blanco problemáticos.

No ejecuté build/check global por instrucción del encargo. No inicié el runtime; tampoco afirmo validación visual de navegador o dispositivo.

## Revisión documental y pendientes

Se preservaron los documentos locales no rastreados de la carpeta de evaluación. Este informe solo enlaza planes existentes; no los modifica. Falta la validación física de REV-02 y REV-07 y, por eso, sus estados permanecen pendientes. El gate integral de las siete tareas corresponde al encargo 4.
