# FE-01 — Revisión y correcciones

> Cierre del coordinador, 7/10: ID completado localmente; [gate frontend](LOTE-FRONTEND-validacion.md) aprobado con 815 pruebas/check, flujo real, QA y limpieza. La evidencia enfocada y límites del autor conservan su alcance original.

Fecha: 2026-10-07 · Revisor: GPT-6.1 Sol HIGH · Estado: correcciones y validación enfocada terminadas; reserva exclusiva liberada al entregar este informe.

## Resultado de la revisión

Se corrigieron riesgos reales de la entrega inicial dentro de FE-01. La implementación queda aceptada para el gate integrado del lote, con check global, smoke de datos y revisión visual/interactiva a cargo de coordinación. No se atribuye a estas pruebas una validación física ni el cierre de FE-02.

1. **Confirmación y lecturas separadas.** La nueva clave guarda un snapshot único con entradas, partes, operaciones y retiros. Una confirmación persiste su retiro en la misma escritura; el legado viejo no recrea copias. Se conserva el máximo de corrida para no reutilizar un `runId` ya retirado al recargar un lote vacío.
2. **Corrupción que podía habilitar otra alta.** El parser inicial perdía `allocationIds` ante payload inválido y descartaba allocations inválidas. Ahora un UUID/payload/estado/owner/destino/referencia inválido bloquea globalmente el snapshot; una versión futura, JSON dañado o forma no reconocida conserva el string original de storage sin sobrescribirlo. No se toma una evidencia ilegible como ausencia de commit.
3. **Guardar y replay.** Se validan cuenta, destino vigente, identidad revisada, atributos y cantidad. Se conserva UUID/payload antes del POST. Respuesta inválida queda incierta. Replay 400/401/404/409 nunca habilita otra clave; 410 queda bloqueado permanentemente. El guard de lote evita doble envío y nuevas solicitudes después de cambiar de cuenta mientras responde un grupo. Un fallo al persistir después del commit conserva un intento reconciliable con la misma clave.
4. **Cantidades y partes.** Input inválido muestra error y bloquea envío, en lugar de ignorarlo y guardar el valor anterior. Grupos sobre 999 quedan pendientes, sin recorte ni fraccionamiento automático. División y retiro mantienen `runId`, suma e IDs estables; el retiro pide confirmación de la parte exacta. Se eliminaron referencias de intentos rechazados cuando sus partes se editan/dividen para que no corrompan el siguiente restore.
5. **Revisión manual y agrupación.** La lista muestra grupos por carta/variante/condición con sus partes. La vista interna de selección permite mover un subconjunto y aplicar atributos explícitos a varias lecturas. La búsqueda manual interna reemplaza el mismo `runId`, incluye cartas fuera del top-8 y conserva cantidad; no navega para agregar otra copia. La confirmación visual revisa solo identidad. La selección manual se distingue con metadata cliente y no hereda una similitud anterior ni se presenta como DINOv2 medido.
6. **Referencias y errores.** Precio por carta y variante exactas, sin fallback singular/primera variante; cero es conocido. Cobertura y total se calculan sobre las mismas partes y condición no modifica precio. Error de colección queda junto al control con reintento. Storage bloqueado/lleno mantiene memoria, comunica el límite y no manda un POST sin persistir identidad. Controles nuevos usan primitivas con objetivos 44 px y foco; un cambio de grupo conserva foco del control que lo originó.
7. **Tope de captura.** Al llegar a 30 lecturas se pausa la captura nueva. Un legado que ya supera 30 se preserva completo para organizarlo; normalizar no descarta lecturas antiguas. Se conservaron los cambios ajenos de captura, galería, calidad y recorte.

## Shape final y continuidad

`pcs.scanDraft`, `schemaVersion: 1`:

- `sessionId`, `entries`, `ownerUserId`, `selectedCollectionId`, `destinationConfirmed`.
- `allocations`: `{id, runId, cardId, variant, variantReviewed, condition, conditionReviewed, quantity, reviewed}`.
- `operations`: `{id: UUID, userId, collectionId, payload: {cardId, variant, condition, quantity}, allocationIds, status, message?}`. Estados `saving`, `uncertain`, `confirmed`, `blocked`, `rejected`.
- `retiredRunIds`; `recoveryBlocked` existe solo en memoria para un snapshot que no se puede validar/escribir.
- Cada entrada conserva `runId`, una proyección de `candidate` con carta/precios del catálogo, y metadata cliente opcional `identityReviewed` / `selectionSource: manual|visual`. No guarda fotos, crop, ranking ni extras. En selección manual los campos numéricos exigidos por compatibilidad son cero y no se muestran como similitud medida.

`pcs.scanSession` pasa a ser legado de lectura. Se aceptan los snapshots iniciales de esta entrega sin `entries` solamente cuando sus partes e intentos se validan con las lecturas legadas; la siguiente escritura los reúne en la clave canónica. Una versión futura/corrupta no se migra ni sobrescribe. No hay limpieza automática de evidencia incierta ni botón de descartar un snapshot protegido.

## Evidencia ejecutada

Antes de la suite se ejecutó `pnpm run stop`. No se levantó stack ni DB/Redis.

- `pnpm --dir frontend exec vitest run components/scanner/__tests__ lib/api/collections.idempotency.test.ts`: **73 pruebas pasan en 10 archivos**.
- Dentro de esa selección, **61 pruebas** cubren draft, storage, OrganizeSheet y página/galería FE-01. Incluyen fixture UX-01 puro y por UI: 20 lecturas originales, retiro de la lectura 17, 23 copias, 21 listas → **15 confirmadas + 3 rechazo seguro + 3 inciertas + 2 incompletas**. Solo una parte de runId 7 se confirma; su parte restante y lectura siguen en el snapshot.
- Se verificaron restore con legado stale, JSON/futura versión/array corruptos, payload/referencias/cuenta/destino/estado inválidos, `saving → uncertain`, ausencia de POST al montar/StrictMode, replay manual con UUID/payload estable, 400/401/404/409/410, cuerpo inválido, storage lleno y persistencia fallida después de commit, cuenta que cambia a mitad del lote y destino inexistente.
- Se verificaron división 3→2+1 al remontar y después de editar/rechazar, selección explícita de una copia, corrección manual fuera top-8, nuevos candidatos sin atributos heredados, grupo sobre 999, inputs inválidos, variante exacta sin fallback y market = 0 sin ajuste por condición.
- **Pasan:** lint frontend (incluye colores/URLs), `pnpm --dir frontend exec tsc --noEmit` y `git diff --check` de la reserva.

No se ejecutó check global ni smoke autenticado con API/DB real, ni revisión visual 390×844/desktop/temas, teclado completo, lector de pantalla o cámara/PWA física. Coordinación tiene preparado el smoke aislado del lote; estas limitaciones no se presentan como pruebas realizadas.

## Archivos de la reserva

- `frontend/components/scanner/session-draft.ts`, `session-storage.ts`, `organize-sheet.tsx`, `types.ts`.
- Nuevos auxiliares: `draft-card-search.tsx`, `draft-selection-editor.tsx`.
- Tests: `session-draft.test.ts`, `session-storage.test.ts`, `organize-sheet.test.tsx`; nuevos `draft-fixture.ts`, `session-draft-safety.test.ts`.
- `frontend/app/(app)/escanear/page.tsx`: solo wiring/continuidad/revisión de FE-01, preservando captura/galería/calidad/recorte ajenos.
- `frontend/docs/scanner.md`, `FE-01-implementacion.md` y este informe.

No se modificaron contratos backend, paquetes, código FE-02, planes ni registro; no se desplegó ni se hizo commit. La reserva queda liberada para que coordinación siga FE-02 y luego ejecute los gates integrados del lote.

## Corrección posterior al gate UI real: referencias perdidas al restaurar

El coordinador detectó en navegador real que las referencias de la API (normal 10 / holofoil 100 / reversa 5) desaparecían al montar y persistir. Mi revisión previa no cubrió el array de precios después de múltiples sanitizaciones; los tests de precio anteriores refrescaban datos al elegir variante y no detectaban esta pérdida del snapshot.

Causa confirmada: `sanitizeSessionEntries` pasaba `candidate.prices` (array ya validado de `RecognizedCard`) a `toPriceList`, que espera un envelope `{prices}`. El parser devolvía vacío en cada lectura/escritura. Se corrigió únicamente esa llamada a `toPriceList({prices: candidate.prices})`; no se amplió el parser compartido ni cambió el contrato/schemaVersion. Se mantienen validación de variante, filtro de cardId exacto, cero conocido, null desconocido y exclusión de campos ajenos.

**Regresión reproducida antes del fix:** tres pruebas nuevas fallaron con precios vacíos / cobertura cero, en sanitización del DTO real, migración legacy y persistencia canónica, y Sheet restaurado. Después pasan. La prueba de modelo convierte el envelope API al array del candidato y recorre cinco sanitizaciones/serializaciones; descarta carta ajena y variante inválida. Storage migra legacy y pasa cinco ciclos read/write/reload canónicos conservando 10/0/null. La prueba rendered restaura A normal10/holo100/reverse5, G normal0 y F normalnull: muestra valores exactos por fila, **4 de 5 copias con referencia y USD 115** con condición HP, también después de desmontar/montar. No consulta otros precios ni manda POST.

Con stack detenido y `pnpm run stop` ejecutado, pasan **76 tests / 10 archivos** en `pnpm --dir frontend exec vitest run components/scanner/__tests__ lib/api/collections.idempotency.test.ts`, lint frontend, `tsc --noEmit` y diff whitespace de reserva. Solo se editaron `session-draft.ts`, `session-draft.test.ts`, `session-storage.test.ts`, `organize-sheet.test.tsx` y reportes FE-01. No se tocó implementación Organize, scanner page, FE-02, backend, paquetes ni parser compartido.

La reserva acotada se libera al entregar esta corrección. El gate integrado frontend **sigue pendiente del rerun real del coordinador**; las pruebas enfocadas no reemplazan su smoke. Un snapshot que ya había perdido las referencias no puede reconstruir esos valores desde un array vacío; esta corrección preserva referencias disponibles al migrar/recibir y en futuras escrituras, sin inventar precios.
