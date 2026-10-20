# BE-02 — Revisión y correcciones

Fecha: 2026-10-07 · Revisor: GPT-6.1 Sol, esfuerzo HIGH.

Estado: **correcciones locales terminadas, reserva BE-02 liberada**. Check global queda a cargo del coordinador. No se modificaron registro de tareas, planes, scanner ni paquetes.

## Hallazgos corregidos

1. **Carrera entre dos claves distintas.** La implementación inicial manejaba P2002 dentro de la transacción al crear una combinación ausente. Se reprodujo con dos transacciones sincronizadas para leer antes del INSERT: el segundo intento fallaba con PostgreSQL `25P02` (`current transaction is aborted`). Se sustituyó por `INSERT ... ON CONFLICT DO UPDATE`; ambas altas se confirman, suman cantidades y conservan notas/apertura de intercambio. El mismo helper corrige el patrón heredado sin cambiar el contrato aditivo de clientes sin clave.
2. **Validación del header.** La regex manual del controller no respetaba DTO + ValidationPipe. El decorador específico extrae headers y habilita su validación con `AddItemHeadersDto`, whitelist y transformación. Los UUID se normalizan a minúsculas, evitando que otro casing reaplique el mismo intento. Se rechazan claves vacías/duplicadas. El helper frontend no omite una clave vacía enviada por el caller.
3. **Errores después del commit.** La lectura de precio opcional o el encolado podían ocultar un alta confirmada. Se conserva éxito con precio nulo si la consulta falla, sin convertirlo en otra escritura ni llamar proveedores desde el handler.
4. **Handoff ambiguo.** Se documentaron respuesta actual frente a delta original, cuenta/destino y payload inmutables para FE-01; un 409/410/404 no habilita otra clave para recuperar un resultado incierto. Se conservaron tombstones sin purge por edad.
5. **Alcance del diff.** Se quitaron cambios de formato ajenos al alta en service/controller/spec. Se agregó cleanup de usuarios de fixtures al cerrar la suite.

## Regresiones y checks

- Reproducción previa: la prueba de dos claves distintas concurrentes falló con `25P02` antes de la corrección. Después pasa.
- **67 backend**: replay y respuesta perdida; misma clave concurrente; claves distintas concurrentes; payloads distintos concurrentes; hash de todos los campos/defaults; cuenta/destino/ownership; UUID casing; resultado editado; notas/intercambio; expiración y tombstone repetido; ítem borrado/recreado y colección borrada; rollback de alta inválida; fallos de precios después del commit; header HTTP válido/inválido/ausente.
- HTTP real de pérdida de respuesta: controller y servicio reales con DB test, puerto efímero, auth sustituida y sin AppModule/workers/proveedores. Primer cuerpo descartado, replay 201, cantidad final 2 y una operación persistida.
- **3 frontend**: payload/clave preservados para reenvío; clave vacía enviada para rechazo; compatibilidad sin header.
- **Pasan:** lint backend, lint frontend, typecheck frontend, build backend y diff whitespace.
- **Limitación existente:** `backend tsc --noEmit` falla fuera de BE-02 en specs de sync-prices/tcgdex/cards/redis y dos e2e con `supertest/types`; ninguna salida señala los archivos BE-02. No se corrigieron porque están fuera de la reserva. El check global no se ejecutó desde este rol.

Se ejecutó `pnpm run stop` antes de suites; fueron seriales contra `pokemon_cards_test`. No se aplicaron migraciones adicionales, no se reseteó desarrollo ni se consultaron proveedores reales. Schema/migración inicial se revisaron y se conservaron.

## Archivos de esta corrección

- `backend/src/modules/collections/collections.service.ts`
- `backend/src/modules/collections/collections.controller.ts`
- `backend/src/modules/collections/collections.service.spec.ts`
- `backend/src/modules/collections/add-item-headers.decorator.ts`
- `backend/src/modules/collections/dto/add-item-headers.dto.ts`
- `backend/src/modules/collections/collections.idempotency-http.spec.ts`
- `frontend/lib/api/collections.ts`
- `frontend/lib/api/collections.idempotency.test.ts`
- `backend/docs/api.md`, `backend/docs/database.md`
- `RESULTADOS/BE-02-reintentos.md`, este informe.

El contrato final de BE-02 y la tabla de acciones para FE-01 están en [BE-02-reintentos.md](BE-02-reintentos.md) y en la documentación API. Integrar esa política al draft es trabajo de FE-01.
