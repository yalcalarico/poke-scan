# FE-02 — Implementación restante de compartir

> Cierre del coordinador, 7/10: ID completado localmente; [gate frontend](LOTE-FRONTEND-validacion.md) aprobado con 815 pruebas/check, flujo real, QA y limpieza. La evidencia enfocada y límites del autor conservan su alcance original.

Fecha: 2026-10-07 · Estado: implementación y revisión/corrección Sol HIGH aprobadas; pendiente validación visual y gate integral del coordinador. Ver [FE-02-review.md](FE-02-review.md).

## Cambios entregados

- `share-link-creator.tsx` incorpora la preview antes de crear en el mismo `Sheet`: nombre público tomado de `displayName`, título según alcance, aviso de acceso público, matriz de campos compartidos/privados y la frase “Tus notas privadas no se comparten”. La vigencia indica fecha/hora local estimada antes del POST y usa el `expiresAt` devuelto por servidor al confirmar; “Nunca” explica que sigue activo hasta desactivar o revocar.
- `share-preview.ts` selecciona una sola colección para la muestra: la elegida o la primera no vacía del listado para alcance global. Hace una sola consulta `listItems(page: 1, pageSize: 1, signal)`. La respuesta privada se proyecta por allowlist a carta/edición, variante, condición, cantidad y precio USD/fuente/fecha; notas, IDs internos, fecha de alta y marca de intercambio no entran al estado/render de preview. Cancelaciones descartan respuestas obsoletas. La carga, error con reintento y vacío no bloquean crear el enlace. El alcance global explica que incluye futuras colecciones y contenido agregado después.
- `share-link-preview.tsx` presenta la muestra como representativa, sin implicar que sea el inventario entero. Market cero se muestra como dato conocido; falta de referencia o moneda no USD se muestra como desconocida. En la misma preview se distinguen explícitamente campos incluidos y excluidos.
- `share-link-status.ts` elimina el estado terminal local de revocación. `expiresAt` prevalece sobre `isActive`, por lo que un enlace vencido no ofrece activación; el contador de activos excluye enlaces vencidos. Se preserva la semántica de backend: activar/desactivar/DELETE no introduce distinción durable, y un enlace apagado puede reactivarse mientras no venció.
- `share-link-card.tsx` cambia el copy de revocar/desactivar, muestra fecha y hora local de vencimiento, explica que páginas/capturas/copias ya vistas no se pueden retractar, presenta el error DELETE y reintento dentro del `Sheet` y conserva el error de toggle junto a sus acciones. Las acciones principales usan botones de 44 px y un guard serializa toggle/DELETE en la misma tarjeta.
- `share-links-section.tsx` elimina `revokedIds`, aclara la reversibilidad y el límite de retractación, y cuenta solo enlaces disponibles. `share-links-state.ts` unifica y deduplica base + enlaces creados, aplicando el último parche también a los recién creados; cubre crear → DELETE/desactivar → activar sin recargar.

## Correcciones de la revisión

La creación y la sección reinician su estado al cambiar de cuenta; cerrar la creación desmonta y aborta la muestra. Una respuesta anterior no aparece bajo el título de otra colección ni se agrega a la cuenta nueva. La muestra se vincula al ID de colección vigente; el destino inicial ausente se muestra como error de campo y bloquea el POST. La creación tiene guard síncrono contra envíos dobles, congela selectores y evita cerrar la hoja mientras se resuelve; un resultado posterior al desmontaje no llama `onCreated`.

Tarjeta y contador se actualizan al próximo vencimiento con timeout local, sin polling ni consultas adicionales. El toggle vuelve a verificar elegibilidad al pulsarlo. También se serializan y bloquean los cierres de DELETE pendiente. La muestra usa formato de precio/fecha compartido, valida carta y variante exactas del precio y trata números inválidos como desconocidos; mantiene cero conocido y no ajusta por condición.

## Pruebas añadidas

Se agregaron regresiones para proyección de allowlist (sin notas/IDs/estado de intercambio), selección global de una muestra, límite `pageSize: 1`, cancelación, vacío, precio cero/desconocido/fuente/moneda, formato horario local, cuatro combinaciones de `isActive`/expiración, contador de activos, ciclo del overlay creado y errores/reintento de toggle y DELETE. Los tests de `ShareLinkPreview` verifican dueño, título, alcance, campos, privacidad y feedback de precio/vacío/error.

## Evidencia ejecutada

- `pnpm run stop`: ejecutado antes de las pruebas.
- `pnpm --dir frontend exec vitest run components/share lib/api/schema.share.test.ts`: **10 archivos, 52 pruebas aprobadas** (revisión final).
- `pnpm --dir frontend run lint`: aprobado, incluidos `check-no-raw-colors` y `check-no-url-spaces`.
- `pnpm --dir frontend exec tsc --noEmit`: aprobado.
- `git diff --check` sobre los archivos de implementación/tests: aprobado.

Vitest imprimió el aviso conocido de `configLoader: 'native'` en `vitest.config.ts`; no afectó el código de salida ni los resultados.

## Límites pendientes

No ejecuté `pnpm run check`, el smoke integrado, stack, navegador ni pruebas de dispositivo. Queda para el cierre del lote la inspección interactiva a 390×844 y desktop, ambos temas y teclado real. Escape y retorno de foco al disparador tienen evidencia jsdom; no equivalen a validación visual, lectores de pantalla ni dispositivos físicos. No afirmo revisión visual ni uso por usuarios. El consumidor público BE-01 no se reabrió; sus resultados previos permanecen en [FE-02-integracion-BE-01.md](FE-02-integracion-BE-01.md) y [LOTE-BACKEND-validacion.md](LOTE-BACKEND-validacion.md). No se modificaron scanner/FE-01, APIs/tipos del contrato, backend, paquetes, páginas públicas, parser ni service worker.

## Archivos de esta implementación

`frontend/components/share/share-link-creator.tsx`, `share-link-card.tsx`, `share-link-status.ts`, `share-links-section.tsx`, `share-preview.ts`, `share-link-preview.tsx`, `share-links-state.ts` y pruebas privadas bajo `frontend/components/share/__tests__/`, incluido el nuevo `share-owner-flow.test.tsx`.
