# BE-02 — Reintentos del alta aditiva

Fecha: 2026-10-07 · Estado: implementación local corregida y gate integral en verde; ver [validación del coordinador](BE-02-validacion-integral.md). Migración inicialmente aplicada solo a test y luego a desarrollo local; ver [activación del lote](LOTE-BACKEND-validacion.md). Integración del draft pendiente de FE-01.

## Reproducción y decisión

`POST /collections/:id/items` incrementa cantidades. Descartar una respuesta exitosa y repetir sin identidad de operación deja dos copias: la regresión reproduce el riesgo en `pokemon_cards_test`. Una alta deliberada de otra copia sigue siendo válida.

Se agregó `Idempotency-Key` opcional UUID al POST existente. El header pasa por `AddItemHeadersDto` y `ValidationPipe` explícito; se canonicaliza a minúsculas. La clave se particiona por usuario y se vincula a colección, carta, variante, condición, cantidad, notas y marca de intercambio mediante SHA-256 del payload normalizado. Defaults de variante/condición/cantidad equivalen a sus valores explícitos. Cambiar cualquier campo del payload o destino con la misma clave responde 409. Otra cuenta puede usar el mismo UUID sin cruzar resultados. Una colección ajena da 404, también en replay.

La escritura del ítem y del registro se confirman en una transacción. La PK `(userId, key)` serializa el mismo intento; su P2002 se recupera fuera de la transacción abortada. El alta del ítem usa `INSERT ... ON CONFLICT DO UPDATE`, compartido por clientes con y sin clave. Dos claves distintas concurrentes sobre una combinación nueva suman ambas cantidades. Se conservan notas existentes y la marca de intercambio se abre con `true`, sin cerrarse por una alta posterior con `false` u omitida.

La revisión reprodujo de forma determinista un fallo de la primera implementación: dos transacciones leían la combinación inexistente antes de crearla; el segundo INSERT causaba P2002 y consultar dentro de esa transacción fallaba con PostgreSQL `25P02`. El upsert atómico corrige esa carrera.

## Contrato para FE-01 / DEC-01

El cliente debe persistir cuenta, destino, clave estable y payload exacto **antes** del envío, sin fotos. Si pierde la respuesta, mantiene el intento bloqueado y puede recuperar con la misma clave/payload, sin convertirlo en otra alta. Una clave nueva representa una acción deliberada distinta.

La respuesta sigue siendo `CollectionItemDto`; no cambió el DTO JSON ni `frontend/types/api.ts`. El replay devuelve el estado actual del ítem, incluso si otra edición cambió cantidad, atributos o notas. Esa respuesta confirma la operación original; el cliente acredita el delta de su payload original y nunca infiere el incremento desde `quantity` actual. El replay no reaplica notas ni `isForTrade`.

| Resultado | Semántica y acción del cliente |
|---|---|
| `201` con cuerpo válido, original o replay | La operación quedó confirmada. Persistir confirmación y retiro de partes juntos en el draft. |
| Red, aborto, cuerpo inválido o `5xx` | Resultado incierto. Conservar cuenta/destino/clave/payload bloqueados; recuperar con la misma identidad. |
| `409` | Clave con otros datos o resolución pendiente. No generar otra clave ni acreditar cantidades. Reenviar únicamente los datos originales; si falta esa evidencia, mantener incierto. |
| `410` con la misma clave/payload | La clave corresponde a un commit anterior, pero venció el replay o se eliminó el ítem. No reponerlo ni volver a sumar. No demuestra presencia/cantidad actuales. |
| `400` / `401` / `404` | Esa solicitud no escribió. Si había un intento anterior incierto, el error no descarta su commit; una colección eliminada también responde 404. |

Los clientes antiguos sin header conservan su semántica aditiva y pueden duplicar ante respuesta perdida. El helper frontend envía incluso una clave vacía para que el backend la rechace; no la omite silenciosamente y convierte en un alta sin protección. No genera claves ni reintenta automáticamente.

El precio es opcional: fallo de encolado o lectura posterior al commit no transforma un alta confirmada en error. Se devuelve el ítem con `price: null` si no pudo consultarse y se mantiene la confirmación/replay. No se consulta un proveedor externo desde el request.

## Retención

La ventana de replay es de 30 días desde el alta. Después, la clave con el mismo payload responde 410 y nunca se reaplica; con otro payload sigue respondiendo 409. Se conserva un tombstone con usuario, UUID, hash y fechas; al reintentar una clave vencida se limpia `resultItemId`. **No hay purge por edad:** borrar claves permitiría un replay tardío aditivo.

Eliminar el ítem y recrear la misma combinación no habilita la clave original: responde 410. Eliminar la colección conserva la clave y devuelve 404 por ownership/destino inexistente. Eliminar la cuenta elimina los registros por cascade. No se guardan fotos, notas, emails ni el payload original en esta tabla.

## Archivos entregados

- `backend/src/modules/collections/collections.service.ts`, controller y service spec.
- `backend/src/modules/collections/add-item-headers.decorator.ts`, `dto/add-item-headers.dto.ts` y `collections.idempotency-http.spec.ts`.
- `backend/prisma/schema.prisma` y migración aditiva `20261007090000_collection_item_add_idempotency`.
- `frontend/lib/api/collections.ts` y `collections.idempotency.test.ts`.
- Contrato/modelo en `backend/docs/api.md` y `database.md`; la entrega inicial también incorporó la advertencia de reintentos a `gotchas.md` e inventario a `testing.md`.
- Revisión: [BE-02-review.md](BE-02-review.md).

## Evidencia

La entrega inicial aplicó la migración únicamente a `pokemon_cards_test`, con `prisma migrate deploy` y URL test resuelta en memoria; verificó conservación de los cuatro índices trigram. En esta revisión no se migró ni reseteó ninguna base, ni se inició el stack de desarrollo.

Tras `pnpm run stop`, ejecutados en forma serial:

- `pnpm --dir backend exec vitest run src/modules/collections/collections.service.spec.ts src/modules/collections/collections.idempotency-http.spec.ts`: **67 tests pasan** (62 service + 5 HTTP/header).
- Incluye HTTP sobre puerto efímero con controller real, servicio real y PostgreSQL test: descartar la primera respuesta y repetir conserva quantity=2 y un solo registro. Se sustituye auth y se excluyen AppModule, workers y proveedores externos. Las pruebas HTTP del header usan dobles del servicio.
- `pnpm --dir frontend exec vitest run lib/api/collections.idempotency.test.ts`: **3 tests pasan**.
- Lint backend, lint frontend, typecheck frontend y build backend: **pasan**.
- `git diff --check` sobre archivos BE-02: pasa.
- `pnpm --dir backend exec tsc --noEmit`: falla exclusivamente en errores fuera de BE-02: mocks de `sync-prices`/`tcgdex-set-mapping`, fixtures de `cards`, callbacks de `redis` y imports `supertest/types` de dos e2e. No se modificaron esos archivos.

La revisión enfocada se complementó con `pnpm run check` global y smoke del stack real aislado, documentados en [el gate integral](BE-02-validacion-integral.md). No acredita un despliegue ni pruebas físicas.
