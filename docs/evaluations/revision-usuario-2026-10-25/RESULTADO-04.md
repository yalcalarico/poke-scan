# Resultado 04 — QA integral REV-01 a REV-07

Fecha: 26/10/2026. Encargo 4/4. Estado: gate integral aprobado y flujo de borrador/API/base de datos validado en una copia aislada. No se modificó lógica de producto durante QA.

## Estado por revisión

| REV | Estado | Evidencia y límite |
|---|---|---|
| REV-01 | Implementada y validada por check/build | `devIndicators: false` pasó lint, typecheck y build. No hice una inspección visual de navegador para medir el indicador. |
| REV-02 | Pendiente de reproducción física | Sigue pendiente verificar safe area y barra dinámica en Safari/iPhone real, como documenta [RESULTADO-01](RESULTADO-01.md). |
| REV-03 | Implementada y validada | Pasaron las pruebas de `CollectionCard` dentro de la suite frontend y el build. La API de colección también se ejercitó con una colección descartable. |
| REV-04 | Implementada; lógica y contrato validados; física pendiente | Pasaron las pruebas focales y la suite global. Este QA verificó la organización/persistencia con API real; no tomó fotos ni usó cámara física. Safari/iPhone, playback y encuadre siguen pendientes. |
| REV-05 | Implementada y validada | El runner retuvo 1003 allocations en `pcs.scanDraft` helpers, completó las listas y conservó la lectura pendiente tras reload del snapshot. |
| REV-06 | Implementada y validada | La API persistió 999+3 copias con la misma variante/condición. El replay del segundo delta usó la misma clave y payload; quedó una sola fila de 1002 copias. |
| REV-07 | Pendiente de reproducción física | Sigue pendiente comprobar zoom mínimo, scroll, rotación y hojas en Safari/iPhone real, como documenta [RESULTADO-01](RESULTADO-01.md). |

## Gate integral

Comandos ejecutados:

```sh
pnpm run stop
pnpm run check
```

La corrida final se ejecutó con `child_process.spawnSync('pnpm', ['run', 'check'])` para capturar el estado del proceso sin volcar logs completos: **status 0**, sin señal ni error. Se repitió una vez porque la primera captura del código de salida usó `status`, que zsh reserva como parámetro de solo lectura; no hubo regresión de producto. La corrida final incluyó lint, typecheck, tests y ambos builds.

| Suite | Resultado |
|---|---:|
| Backend Vitest | 57 archivos, 545 tests aprobados |
| Backend E2E | 2 archivos, 6 tests aprobados |
| Frontend Vitest | 82 archivos, 625 tests aprobados |
| Scripts Node de operaciones/QA | 24 + 15 + 54 + 7 = 100 tests aprobados |
| Total | 1.276 tests aprobados; 0 fallidos |

`nest build` completó; Next compiló, terminó TypeScript y generó las 17 páginas estáticas. Lint informó advertencias no bloqueantes (`Promise.allSettled` sin necesidad de spread y uso de `<img>` en un test). Next también avisó que detectó dos lockfiles y seleccionó la raíz de Turbopack; no se cambió esa configuración durante QA.

## Flujo real aislado de borrador y API

Runner reproducible: [scanner-draft-api-smoke.mjs](../../../frontend/scripts/qa/scanner-draft-api-smoke.mjs).

Preparé `pokemon_cards_qa_test` como copia de `pokemon_cards_test`, con 20.670 cartas. La copia de origen no tenía precios TCGCSV, así que agregué allí un precio centinela de prueba para `base1-1` (variante `normal`, `market=9876.54`, proveedor `tcgcsv`, mercado `tcgplayer`) y usé `base1-10` como carta sin cotización. El centinela no representa un precio real ni salió de un proveedor; el runner lo usa para confirmar que la API está conectada a la base QA correcta. La API corrió con la cola y las cronjobs de precios desactivadas.

El runner cargó los helpers reales `session-draft.ts` y el cliente HTTP de la app con Vite SSR. Registró una cuenta descartable por `register`, creó una colección por `createCollection`, consultó cartas/precios locales, armó `pcs.scanDraft`, persistió las operaciones antes del POST y usó el endpoint real autenticado de altas. Resultado:

- 1003 allocations: 1002 listas y una sin precio/variante.
- `readyAllocationGroups` produjo deltas de **999 y 3**.
- El primer delta se confirmó. En el segundo, el runner dejó que la API aplicara el POST y simuló perder la respuesta. El snapshot volvió como `uncertain`; el replay reutilizó la misma clave idempotente y el payload exacto.
- La API devolvió la cantidad total actual 1002. El listado mostró una sola fila con `quantity=1002`.
- La consulta directa a Postgres mostró `item=1|1002|1002|normal|NM` y exactamente dos operaciones idempotentes aceptadas.
- Después de confirmar ambas partes, el borrador conservó una allocation sin precio, con `variant=null`; no la incluyó en los grupos listos. `writeSessionDraft` y `readSessionDraft` conservaron ese estado.

Comando del flujo:

```sh
node frontend/scripts/qa/scanner-draft-api-smoke.mjs
```

El runner debe apuntar a una API local respaldada por una base aislada terminada en `_test`, con catálogo presente, la fila centinela descrita arriba y sin otra colección del test. Para volver a ejecutarlo, configure también `REDIS_URL` hacia un Redis o índice dedicado a QA; el runner no vacía Redis. No requiere cámara, imágenes, ni descargas de catálogo/precios.

## Fallos de preparación corregidos

- El primer nombre de usuario de prueba conservaba guiones UUID y el DTO lo rechazó. El runner ahora genera un username válido; no se creó una cuenta en ese intento.
- La columna `card_prices.id` no tiene default SQL en esta base. El fixture se insertó con UUID explícito, sólo dentro de `pokemon_cards_qa_test`.
- El primer arranque intentó pasar `--env-file` por `NODE_OPTIONS`, que Node no admite. Se arrancó la API con `node --env-file=.env.qa ...` y flags de ingestión desactivados.
- La captura inicial del exit status falló por el nombre reservado `status` de zsh. La corrida final con `spawnSync` confirmó `status: 0`.

No se necesitó corregir código de producto.

## Limpieza y servicios

La colección se borró por la API al finalizar el runner. Luego vacié sólo las tablas ligadas a usuarios dentro de la copia QA y comprobé `users=0`, `items=0`, `operations=0`; eliminé `pokemon_cards_qa_test` y el archivo temporal `backend/.env.qa`. `pokemon_cards_test` se mantuvo y no se modificó la base de desarrollo. La API reutilizó la conexión local de Redis, pero el flujo no llamó ARS, colas ni jobs y no ejecuté ningún `FLUSHDB`; el runner documenta que las próximas ejecuciones deben usar una conexión/índice Redis aislado. No hubo descargas de proveedores ni uso de datos de colecciones reales por el API de QA.

Al cerrar, Postgres y Redis quedaron arriba, saludables, en `55432` y `6379`, como estaban al comenzar. API y frontend quedaron abajo; los puertos `3000` y `3001` están libres. No hay comprobación de Safari/iPhone físico.

La revisión de whitespace y enlaces relativos encontró **14 documentos Markdown no rastreados**, 0 líneas con whitespace final y 0 enlaces relativos rotos. `git diff --check` también pasó.
