# BE-02 — Gate de validación integral

Fecha: 2026-10-07. Coordinación: GPT-6.1 Sol Alto. Estado: **gate local en verde**, habilita la siguiente entrega BE-01. Revisión y correcciones: [BE-02-review.md](BE-02-review.md). Contrato: [BE-02-reintentos.md](BE-02-reintentos.md).

## Suite completa del proyecto

`pnpm run stop` seguido de `pnpm run check`, en la raíz, terminó con **exit 0**. No hubo implementación ni suites DB/Redis en paralelo.

| Comprobación | Resultado |
|---|---|
| Lint backend/frontend y guards de colores/URLs | Pasan |
| Typecheck configurado por el proyecto (frontend) | Pasa |
| Backend Vitest | 23 archivos, 335 tests pasan |
| Scripts backend de evaluación/índice/caché | 13 tests pasan |
| Backend e2e | 2 archivos, 6 tests pasan |
| Frontend Vitest | 44 archivos, 369 tests pasan |
| Builds backend/frontend | Pasan |

Total: **723 tests**. Log de esta sesión: `/tmp/pokescan-check-20261007.log`. `git diff --check` también pasó. Los ocho errores de `backend tsc --noEmit` identificados por el revisor en specs ajenos siguen documentados; ese comando adicional no forma parte del typecheck raíz. No se afirma haber corregido esos specs.

## Stack real aislado

Se levantó API compilada en modo desarrollo local y frontend compilado con HTTP en localhost:3001/3000. DB: `pokemon_cards_test`; Redis: DB 15, comprobada vacía antes de usarla. Workers de precios y crons desactivados. DINOv2 desactivado para este smoke. Se crearon tres precios fixture de USD 100 para evitar consultar proveedores; **no son precios reales ni una evaluación de exactitud de mercado**.

`scripts/verify-app.mjs` pasó sus **12 comprobaciones**: salud/Redis, carta/set, precio fresco, histórico activo y legacy, búsqueda por nombre y número, orden por precio, registro/colección/ítems/totales/intercambio, link público API y página, seis rutas HTTP y HTML de carta.

Además, con registro/JWT reales y AppModule completo:

- Alta de dos copias LP/holofoil con `Idempotency-Key`; primera respuesta descartada.
- Replay: HTTP 201, cantidad final 2 y una sola operación persistida.
- Misma clave con cantidad distinta: HTTP 409.
- Nueva intención con nueva clave: HTTP 201 y cantidad 4.

El helper temporal de reproducción quedó en `/tmp/pokescan-integrated-smoke-20261007.mjs`; salida en `/tmp/pokescan-smoke-20261007.log`. No se guardaron tokens ni URLs con credenciales en este informe. Dos intentos iniciales de arrancar API en modo producción fueron rechazados por los guards de secretos/orígenes HTTPS; se usó el modo desarrollo local para probar HTTP, sin cambiar la seguridad de la app ni su configuración persistente.

Limpieza comprobada: tres usuarios fixture y sus relaciones, tres precios fixture, tres jobs nuevos concretos de precio y claves del Redis aislado. No se usó FLUSHDB ni se reseteó desarrollo. API/web detenidas y puertos 3000/3001 sin listeners al cerrar.

## Límites y siguiente entrega

El gate acredita la suite disponible y los flujos HTTP/HTML descritos, no cada interacción posible. No hubo navegación/interacción de browser, cámara física, corpus DINOv2, entrevistas ni despliegue. La migración aditiva BE-02 está aplicada **solo a test**; su aplicación a desarrollo/despliegue permanece pendiente y debe conservar datos e índices trigram. El frontend todavía debe usar la clave por intención desde el draft de FE-01; clientes sin clave conservan su semántica aditiva.

La próxima implementación es BE-01 con su preflight aceptado y la adaptación indispensable del consumidor público. El usuario corrigió después la frecuencia de validación: pruebas enfocadas por tarea y gate completo al cerrar el lote backend BE-02/BE-01, antes de habilitar el lote frontend FE-01/FE-02. La validación BE-02 anterior se conserva como evidencia.
