# BE-01 — Contrato público de compartir

Fecha: 2026-10-07 · Estado: contrato y consumidor público integrados y revisados; gate global y smoke de coordinación pendientes.

## Contrato implementado

`GET /api/s/:slug` devuelve un DTO propio. Cada grupo contiene únicamente `card` (proyección `CardDto`/`SetDto` del catálogo), `variant`, `condition`, `quantity` y `price` (market, currency, provider, source y fetchedAt, o `null`). No serializa identidad del item/colección/dueño, marca de intercambio, notas ni fecha de alta. La carta y el set conservan sus identificadores públicos de catálogo.

`stats` cubre todo el scope: `totalGroups`, suma de copias, cartas y sets únicos, grupos con duplicadas, grupos con precio y sin precio. Valor USD es 0 para scope vacío, null si no hay ningún precio market, y subtotal para cobertura parcial. El scope global es dinámico. Se listan hasta 500 grupos en el orden actual; `truncated` informa el recorte y no se fusionan grupos entre colecciones.

La consulta agregada usa SQL con `latestMarketPriceJoin()` y política de proveedor activa. La lectura no consulta proveedores. Antes de cada hit Redis se comprueba en PostgreSQL que el link esté activo y `expiresAt > now`; slug ausente, inactivo o expirado devuelve el mismo 404. El cache usa `share:public-v2:<provider>:<slug>`, sin fallback legacy; TTL de hasta 300 segundos se limita al tiempo restante y no se hace SET con TTL cero. Fallos de invalidación no autorizan una nueva lectura porque la elegibilidad se verifica en DB. La ruta aplica `Cache-Control: no-store` antes de ejecutar el servicio, también si la petición termina en excepción.

El espejo frontend y el parser dedicado proyectan solo campos permitidos, ignoran extras como `notes` y fallan si falta o es inválido un campo público obligatorio. El contrato y el comportamiento están descritos en `backend/docs/api.md` y los casos del spec en `backend/docs/testing.md`.

## Verificación de la entrega inicial

- `pnpm run stop` antes de los tests.
- `pnpm --dir backend exec vitest run src/modules/share/share.service.spec.ts --no-file-parallelism` contra `pokemon_cards_test`: 17/17 pasan. Se usó acceso local autorizado porque el sandbox inicial no alcanzaba PostgreSQL en `localhost:55432`.
- `pnpm --dir frontend exec vitest run lib/api/schema.share.test.ts`: 2/2 pasan.
- `pnpm --dir backend run lint`: pasa.
- `pnpm --dir backend run build`: pasa.
- `pnpm --dir frontend exec tsc --noEmit`: queda bloqueado por consumidores FE-02 aún no migrados: `frontend/components/share/public-card-grid.tsx` lee `item.id`, y `public-collection-view.tsx` pasa el nuevo `PublicShareStatsDto` donde todavía espera `CollectionStatsDto.totalValueArs`. No se tocó UI por la reserva de FE-02.

Los tests cubren allowlist serializada con notas privadas, precio y shape exactos, revocación incluso con Redis caliente y `DEL` fallido, namespace público, `SET` tardío concurrente, expiración pasada y exacta, TTL menor a un segundo, scope vacío, precio desconocido, y agregado de 520 grupos con lista limitada a 500. El smoke integrado API/web, incluyendo respuesta HTTP, metadata/HTML, payload legacy y origen tras calentar Next, queda a cargo de coordinación al integrar FE-02.

## Handoff FE-02

El typecheck señala dos adaptaciones necesarias en `frontend/components/share/public-card-grid.tsx` y `frontend/components/share/public-collection-view.tsx`. La guía aceptada en `BE-01-preflight.md` recomienda eliminar dependencia de `item.id` y dejar que `CardGrid` use su fallback local; el resumen debe mostrar grupos visibles frente a `stats.totalGroups`, cobertura y valor desconocido/parcial. También quedan las exclusiones de Data Cache de Next y service worker acordadas en UX-02.

Reserva BE-01 liberada explícitamente para que coordinación delegue el consumidor frontend en serie. No se modificaron archivos UI, service worker, metadata, Prisma, paquetes ni migraciones. Se preservaron las modificaciones BE-02 concurrentes en `backend/docs/api.md` y `backend/docs/testing.md`.

## Revisión integrada posterior

El consumidor FE-02 ya fue integrado. La revisión encontró que el parser público delegaba catálogo a un parser genérico que inventaba defaults ante campos obligatorios ausentes o inválidos, y admitía conteos fraccionarios/negativos o valor cero con grupos sin precio. Se corrigió con validación y proyección propias de carta/set públicos; los parsers genéricos y DTOs privados permanecen intactos. La proyección conserva los strings/null del catálogo y descarta extras. Se validan conteos, cobertura, USD y fechas de referencia; market cero sigue siendo conocido.

La suite ahora usa JSON en una caché Map: prueba lectura del namespace nuevo sin consumir entradas privadas legacy, desactivación/revocación con `DEL` fallido, expiración con entrada caliente y un `SET` tardío realmente almacenado. El reloj controla el cálculo de TTL al escribir y el vencimiento durante una petición en vuelo. La fixture de 522 grupos individuales/523 globales coloca todas las referencias fuera de los primeros 500: valor y cobertura completos se comprueban sin depender de la muestra. También se conservan dos grupos iguales entre colecciones y se filtra proveedor/mercado/moneda activos.

Después de `pnpm run stop`, **21/21 pruebas backend** pasan contra `pokemon_cards_test`, incluido controller real con servicio/DB reales y puerto HTTP efímero: `Cache-Control: no-store` en 200 y 404 genérico, incluso con Redis caliente. **15 pruebas frontend en 5 archivos** pasan; lint/backend build y lint/typecheck frontend pasan. El sandbox bloqueó el primer intento de conexión local; la ejecución autorizada fuera del sandbox pasó. No se iniciaron workers ni proveedores externos. Ver [revisión del lote](LOTE-BACKEND-review.md) para alcance y verificaciones pendientes.
