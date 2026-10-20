# FE-03 — Revisión y correcciones

8/10/2026 · Sol HIGH · Implementación inicial Luna.

**Revisada para el gate integrado BE-04 + FE-03**, con las correcciones siguientes. No se cierra FE-03 ni el lote: `pnpm run check` estándar y el flujo real aislado API/web pertenecen a la reserva siguiente y siguen pendientes.

## Resultado comprobado

- Agregados desde `valuation.amount`, cobertura por copias del scope recibido y transición legacy desconocida; cero, vacío, ausencia y subtotal parcial permanecen separados. El resumen público usa metadata server-safe compartida y conserva USD, rango de consulta y estados upstream fresh/stale/mixed/unknown, sin consultar sesión ni preferencia de moneda.
- Hero desde el primer `market` conocido en orden canónico; helper del delta toma esa misma fila. `mid` no rescata ausencia y el contador de variantes sin mercado incluye filas con bajo/medio/alto. Se corrigieron comentarios que seguían describiendo respaldo `mid` o “actualización”.
- Instantes cacheados con fecha, hora, milisegundos y UTC, sin reinterpretar frescura con el reloj del browser. El formato no normaliza una fecha legacy imposible a otro día. Los días históricos permanecen UTC, incluida la variante nullable del envelope; metadata de puntos usa el mismo componente de procedencia.
- El historial conserva gráfico/punto/lista, distingue carga, error complementario y respuesta sin puntos. Su `details` queda en la misma Surface, fuera del botón del hero; los controles históricos tienen foco visible. Se corrigió la estructura pública que anidaba bloques dentro de `span`.
- Item con unitario y subtotal de variante exacta, incluso cero; fila existente con `market:null` explica ausencia y conserva procedencia. El sheet inicia con cantidad/variante/condición guardadas y retira precio/procedencia anteriores al cambiar variante. La condición no ajusta el monto.
- Portfolio conserva rangos, gráfico, cobertura propia del snapshot y conversiones ARS al cambio actual; título visible “Valor observado de tus colecciones”. Ranking conserva orden recibido y máximo cinco, unitario/subtotal y metadata sin inventar coverage ni proveedor.
- La revisión de teclado encontró un fallo previo de la primitiva Sheet: Shift+Tab desde el panel inicial escapaba. Coordinación autorizó la extensión mínima a `sheet.tsx` y su test; el trap ahora incluye `active === panel`. La regresión falló antes y pasó después, preservando capas, Escape y retorno del foco.

## Evidencia técnica

[Evidencia central](FE-03-review-evidencia.json), [diff propio de revisión](/private/tmp/fe03-sol-review-20261008/review-code-and-docs.diff) y logs reproducibles en `/private/tmp/fe03-sol-review-20261008`.

- `pnpm run stop` antes de suites: puertos 3000/3001 liberados.
- Regresiones iniciales: **8 fallaron / 15 pasaron**, 5 archivos; reprodujeron delta, control histórico anidado, fechas sin hora, filas sin mercado, unitario ausente y bloques públicos. Sheet: **1 falló / 17 pasaron** antes del fix. Fecha legacy imposible: **1 falló / 4 pasaron** antes del guard.
- Final enfocada: **78 pruebas / 9 archivos aprobados** (60 de dominio + 18 de Sheet). Incluye edición de variante, ranking máximo/orden, cobertura histórica distinta del inventario actual y copy ARS. No es la suite frontend completa.
- `pnpm --dir frontend run lint`: aprobado, incluidos guardas de colores y URLs. `pnpm run typecheck`: aprobado; es el typecheck frontend definido en la raíz.
- `pnpm --dir frontend run build` estándar: falló primero por descarga de fuentes Google. Retry con `require_escalated` llegó a Turbopack, pero falló `EPERM` al abrir un puerto interno para procesar CSS. No hubo rechazo de auto-review.
- `pnpm --dir frontend run build --webpack`: aprobado; repetido en el estado final con éxito. Es un build alternativo y **no equivale al estándar de Turbopack ni al gate global**. No se cambiaron paquetes, framework, configuración ni fuentes para sortear el entorno.

El test nuevo de ItemSheet tuvo dos fallos de harness antes de pasar: se consultó el portal antes de montarse y su mock de `formatMoney` no aceptaba null. Se corrigieron el await y el mock; no se atribuyen al producto. Vitest mantiene la advertencia no bloqueante sobre configuración CommonJS/ESM y `configLoader: native`.

## Verificación visual acotada

Harness Vite temporal, solo en `/private/tmp`, con mocks locales de API/HTTP/moneda, shims de Next y cartas ficticias; no se abrieron rutas de producto ni stacks. Inspección CUA en el navegador integrado de Codex a **390×844 y 1280×844, claro/oscuro**: cifras y metadata legibles, sin overflow horizontal en esos cuatro casos; público USD con preferencia privada ARS. Capturas emitidas por la herramienta, sin archivo de imagen persistido. El harness y sus hashes se conservan para reproducción, pero no acreditan el layout de las rutas reales ni SSR/hidratación de Next.

Procedencia histórica operada con Enter sin abrir variantes; hero abre variantes con Enter. Retest del fix Sheet: Shift+Tab desde el panel y Tab desde Cerrar permanecen dentro; Escape devuelve el foco al hero. El sheet del item mostró unitario/cantidad/subtotal y footer visible en 390. Son comprobaciones acotadas de browser, no certificación de accesibilidad completa.

PWA/teléfonos físicos, lectores de pantalla, teclado virtual, zoom/forced-colors/reduced-motion ejecutados, contraste medido, estados offline reales, API/web aisladas y comprensión con participantes permanecen pendientes. No se afirma 9/10 ni antigüedad upstream atribuible.

## Atribución, preservación y limpieza

Se capturaron **27 archivos recibidos antes de esta revisión**; luego **2 archivos de Sheet antes de editar la extensión autorizada**. Hashes en [received-sha256.json](/private/tmp/fe03-sol-review-20261008/received-sha256.json). Los tres archivos de código nuevos de revisión son `valuation-metadata.tsx`, `lib/prices/format.ts` y el test de detalles/item; no se presentan como capturas previas inexistentes.

El baseline Luna tiene manifiesto inicial de **21 hashes** y completo de **27 entradas: 24 archivos + 3 ausencias**. Los 24 archivos almacenados y las tres ausencias coinciden con el completo; los 21 hashes iniciales coinciden. **19 archivos coinciden con HEAD; cinco conservan baseline local ajeno** (dos componentes públicos, dos tests públicos sin seguimiento y `docs/api-client.md`). Index, delta y sparkline no figuraban en el manifiesto inicial y fueron reconstruidos desde HEAD. Esta auditoría prueba coherencia de archivos/manifest, **no que las 27 entradas completas se capturaran antes de implementar**. `own-reserved.diff` de Luna conserva SHA-256 `378602a4b7669c77644ef48e20939d1dc28926696bae4d7cf544c6cb1612af52`; `preexisting.patch` se preserva.

Sin reset, git writes, backend/DTO/schema/infra/auth/scanner/providers raíz, servicios DB/Redis, migraciones, requests al proveedor ni datos reales. El harness se terminó, la pestaña se cerró, el viewport se restableció y puertos 3000/3001/3313 quedan libres. Writer y suites liberados; coordinación conserva cierre de IDs y gate integrado.
