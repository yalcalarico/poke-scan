# Resultado 02 — REV-05 y REV-06

Fecha: 26/10/2026. Encargo 2/4. Estado de implementación: **REV-05 y REV-06 implementadas; pruebas focales, lint y typecheck en verde**. No se modificaron backend ni DTOs.

## Cambios

- REV-05: `appendSessionEntry` ya no impone 30 lecturas. La página tampoco bloquea ni pausa la cámara por `session.length`; conserva el flujo serial existente. La caché de recortes permanece separada y acotada a 30 imágenes en memoria, sin persistir fotos.
- REV-06: cada lectura nueva acepta automáticamente la identidad propuesta, una copia y condición NM. Usa la variante de la primera referencia de precio que la cámara muestra, preservada junto a la lista TCGCSV al restaurar. Los precios TCGdex guardados por versiones anteriores se descartan del snapshot activo. Una corrección manual consulta los precios de esa carta por el cliente existente y vuelve a calcular la variante; no agrega una captura.
- Organizar conserva el destino explícito, pero ya no solicita variante, condición, cantidad ni confirmación de identidad. Sin variante acreditada por el catálogo/precio local, una lectura queda pendiente mientras otras se guardan.
- `readyAllocationGroups` divide grupos en payloads de hasta 999 copias con allocation IDs canónicos disjuntos. El envío continúa serialmente; se detiene al primer fallo. Cada operación conserva su UUID/payload y la parte confirmada se retira. Un reintento incierto reenvía esa misma operación antes de continuar.
- La escritura de sesión sigue sin truncar si sessionStorage rechaza una escritura. La UI informa que el borrador queda en memoria de esa pestaña y que no se restaurará tras recargar.

## Archivos

- Flujo: `frontend/app/(app)/escanear/page.tsx`, `frontend/components/scanner/session-storage.ts`, `session-draft.ts`, `organize-sheet.tsx`, `draft-card-search.tsx`, `types.ts`, `frontend/lib/scanner/price-reference.ts`, `frontend/components/scanner/index.ts`.
- Regresiones: `session-storage.test.ts`, `session-draft.test.ts`, `session-draft-safety.test.ts`, `organize-sheet.test.tsx`, `scan-page-camera.test.tsx`, `draft-fixture.ts`.
- Documentación operativa: `frontend/docs/scanner.md`, `frontend/docs/components.md`.

## Evidencia y comandos

- `pnpm run stop` — ejecutado antes de la suite; liberó puertos 3000/3001.
- `pnpm --dir frontend exec vitest run --no-file-parallelism --reporter=dot components/scanner/__tests__/session-storage.test.ts components/scanner/__tests__/session-draft.test.ts components/scanner/__tests__/session-draft-safety.test.ts components/scanner/__tests__/organize-sheet.test.tsx components/scanner/__tests__/scan-page-camera.test.tsx` — **44/44 pruebas**, 5 archivos aprobados.
- `pnpm --dir frontend run lint` — **exit 0**, incluye guard de colores y URLs. Un warning preexistente de `<img>` en `components/cards/__tests__/card-tilt.test.tsx`.
- `pnpm run typecheck` — **exit 0**.
- Aceptación cubierta: 35 capturas se conservan y restauran (supera 30); precio/variante exactos y NM sin selector; dos capturas intencionales iguales producen quantity 2; pendiente sin variante no bloquea ni desaparece al guardar otra; grupo 1002 se envía en 999+3; la parte incierta reintenta con el mismo UUID y payload.
- No se ejecutó `pnpm run check`, build ni flujo real con API/DB: quedan para el encargo 4. No se probó cámara física.

## Receta para QA integral aislado

Levantar una copia aislada del stack y una cuenta/colección descartables, con un catálogo local y una carta que tenga precio TCGCSV. Desde una sesión autenticada verificar captura, corrección opcional y persistencia de variante/condición. Preparar en `pcs.scanDraft` 1002 allocations de la misma carta/variante/NM (sin miles de llamadas visuales), guardar en esa colección y comprobar del lado API/DB que se aplican cantidades 999 y 3 y que las lecturas se retiran. Forzar en el entorno aislado una respuesta perdida para el segundo incremento; verificar que el replay usa la misma clave y payload, que no suma duplicado y que al completar no quedan allocations. Agregar otra lectura sin precio ni variante local y comprobar que permanece pendiente al guardar el resto. Eliminar sólo los datos y la colección de esa cuenta aislada.

## Pendientes y contrato para REV-04

- El próximo agente debe mantener `runId` único e inmutable por captura intencional. `appendSessionEntry` se ejecuta una vez cuando termina el reconocimiento; los reintentos de guardado no vuelven a capturar ni incrementan cantidad. Dos nuevas capturas iguales son dos copias.
- `source: 'auto'` conserva la cadencia de 2,5 s; `source: 'manual'` no usa ese throttle. El reconocimiento sigue serial y el avance de sesión no se ata a un máximo.
- `reviewsRef` es sólo una caché de imágenes en memoria: retiene hasta 30 y expulsa la más antigua; no afecta las entradas ni `pcs.scanDraft`.
- Mantener `autoCapturePaused` por comparativa/corrección/salida; no agregar `session.length` como condición. Mantener sonido/eventos de captura sin alterar `runId`, la deduplicación del mismo resultado de cámara ni la semántica de una captura intencional nueva.
- El flujo real aislado y el gate global corresponden a QA final; sin riesgo de datos de usuario se puede cerrar con el fixture de borrador descrito arriba.

## Riesgos conocidos

- No existe capacidad de memoria/almacenamiento infinita. Ante cuota excedida la sesión vive hasta cerrar o recargar la pestaña y el aviso lo comunica; las lecturas no se recortan en memoria.
- Una lectura sin referencia/variante respaldada no se puede completar desde Organizar y queda pendiente; resolverla requiere que el catálogo local tenga el dato, sin consulta externa desde ese flujo.
- La lista larga no está virtualizada. El agrupamiento y la sincronización evitaron búsquedas cuadráticas por cada entrada, pero la respuesta visual en una PWA/dispositivo físico con sesiones muy extensas requiere QA.
