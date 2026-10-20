# Lote backend BE-02 / BE-01

Fecha: 2026-10-07. Coordinación/revisión: GPT-6.1 Sol Alto. Ejecutores de áreas: GPT-6 Luna.

Estado: **lote backend cerrado y validado localmente**. BE-02, BE-01 y el consumidor público indispensable pasaron revisión Sol Alto, check global y smoke real aislado. FE-02 conserva trabajo de UI privada pendiente; no se declara ese ID completo.

## Activación local de BE-02

Se revisó `prisma migrate status`: la única migración pendiente en desarrollo era `20261007090000_collection_item_add_idempotency`. Su SQL crea una tabla de operaciones y un índice; no altera ni elimina inventario existente. Se aplicó con `pnpm --dir backend exec prisma migrate deploy`, exit 0. No se ejecutaron migrate dev, db push ni reset.

Antes y después se verificaron 22 usuarios, 22 colecciones y 69 grupos de inventario, sin cambios en sus conteos. Los cinco índices GIN/trigram de desarrollo permanecen: card_sets_name, cards_artist, cards_name, users_display_name y users_username. La tabla nueva tiene cero operaciones. Estos conteos acreditan la comprobación local descrita; no sustituyen una validación de todas las filas.

La migración está ahora aplicada a **test y desarrollo local**. No hubo despliegue externo ni cambios de configuración persistente. La integración del draft/claves en el escáner sigue siendo FE-01.

## Cierre integrado

- Revisión/corrección GPT-6.1 Sol HIGH: [informe](LOTE-BACKEND-review.md); 21 pruebas backend de compartir y 15 frontend enfocadas, lint/build/tipos pertinentes pasan.
- `pnpm run stop` y `pnpm run check`: **exit 0, 746 pruebas**. Backend: 345 Vitest + 13 scripts + 6 e2e; frontend: 382. Lint, typecheck configurado y builds completos pasan. Log: `/tmp/pokescan-backend-batch-check-20261007.log`. El typecheck raíz cubre frontend; el build backend valida código de producción. No se afirma haber corregido errores previos de tsc standalone en specs ajenos.
- Stack real: API compilada + Next compilado, JWT reales de cuentas descartables, `pokemon_cards_test`, Redis DB 15 inicialmente vacía; workers/crons e inferencia desactivados. Precios y cambio USD fixture; sin requests a proveedores de precios.
- `verify:app`: **12/12** comprobaciones. Registro, inventario/totales, carta/precio/histórico, búsqueda, orden por precio, filtro de intercambio, seis pantallas y HTML de carta.
- BE-02: respuesta descartada tras alta, replay con misma clave sin sumar dos veces, payload incompatible 409 y nueva intención sumando cantidades. Una operación persistida para el replay.
- BE-01: allowlist pública en API/HTML, namespace Redis legacy ignorado, totales/cobertura parcial, vacío=0 y desconocido=null, y grupos iguales entre colecciones preservados. Fixtures >500 y bordes TTL/DEL fallido/SET tardío están cubiertos por las pruebas enfocadas.
- API caliente después de desactivar, revocar y vencer: **404 + no-store**. Next: HTML completo, incluidos scripts/Flight, genérico y sin nombre del dueño/colección, links a cartas del fixture ni sentinels privados; noindex y no-store. Se verificó con UA normal y Twitterbot. Metadata nofollow también cubierta en pruebas frontend.

La primera ejecución del smoke falló porque exigía status 404 de Next sin leer el cuerpo. Sol HIGH confirmó en las guías locales `next/dist/docs/.../not-found.md` y `loading.md` que un `notFound()` después de empezar streaming puede devolver HTTP 200. Se corrigió **solo el helper temporal**, conservando API404 y fortaleciendo la inspección del HTML completo. La repetición pasó, exit 0; las seis respuestas Next fueron 200 con página genérica sin payload protegido. No se modificó la aplicación después del check global. Logs: `/tmp/pokescan-backend-batch-smoke-20261007.log` (primer intento) y `/tmp/pokescan-backend-batch-smoke-20261007-rerun.log` (cierre).

Ambas corridas limpiaron sus propios 3 usuarios, 4 precios y 3 jobs, claves Redis de la DB aislada y procesos API/web. No hubo reset, FLUSHDB ni escritura de inventario de desarrollo. Los logs temporales son evidencia local; este informe conserva el resultado si se eliminan.

## Revisión visual y límites

Navegador real: 390×844 y 1280×900, tema oscuro, sin desborde horizontal; referencia parcial, vacío, desconocido y grupos idénticos visibles correctamente. Navegación de teclado comprobó enlace de carta y foco visible. Viewport restaurado y tab temporal cerrado.

Tema claro, interacción completa de controles privados de compartir y pruebas en teléfonos físicos quedan para el lote frontend. No se ejecutaron cámara/DINOv2 ni investigación con participantes. El check cubre la suite existente, no acredita todos los comportamientos posibles ni retracta páginas ya abiertas, capturas o previews externos. No hubo despliegue externo.

## Siguiente lote

**FE-01 → FE-02 restante**, con revisión Sol HIGH y pruebas enfocadas por tarea; gate completo al finalizar el lote frontend. Consumidor público ya integrado: no rehacerlo. [Checklist y cantidades por plan](../STATUS-CHECKLIST.md).
